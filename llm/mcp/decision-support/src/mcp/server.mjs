import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const root = dirname(fileURLToPath(import.meta.url));
const workerPath = join(root, '..', '..', 'worker.clj');
const toolNames = ['decision_model_validate', 'decision_space_explore', 'decision_options_compare'];
const MAX_VARIABLES = 100;
const MAX_DOMAIN = 100;
const MAX_LIMIT = 1000;
const MAX_OPTIONS = 1000;
const MAX_CARTESIAN = 10000;
const MAX_SERIALIZED_INPUT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
const WORKER_STARTUP_TIMEOUT_MS = 30000;

const modelSchema = {
  type: 'object',
  properties: {
    version: { oneOf: [{ type: 'integer', const: 1 }, { type: 'string', const: '1' }] },
    schema_version: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string', minLength: 1 }] },
    variables: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_VARIABLES,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_-]*$' },
          domain: { type: 'array', minItems: 1, maxItems: MAX_DOMAIN },
        },
        required: ['name', 'domain'],
        additionalProperties: false,
      },
    },
    constraints: { type: 'array' },
    objectives: { type: 'array' },
    assumptions: { type: 'array' },
    criteria: { type: 'array' },
    evidence: { type: 'array' },
  },
  required: ['variables'],
  additionalProperties: true,
};

const toolSchemas = {
  decision_model_validate: {
    type: 'object',
    properties: { model: modelSchema },
    required: ['model'],
    additionalProperties: false,
  },
  decision_space_explore: {
    type: 'object',
    properties: {
      model: modelSchema,
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 100 },
      cursor: { type: 'string', minLength: 1, description: 'Continuation cursors are not currently supported.' },
    },
    required: ['model'],
    additionalProperties: false,
  },
  decision_options_compare: {
    type: 'object',
    properties: {
      model: modelSchema,
      options: { type: 'array', maxItems: MAX_OPTIONS, items: { type: 'object' } },
    },
    required: ['model', 'options'],
    additionalProperties: false,
  },
};

const text = (value, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

function structuredError(code, path, message, extra = {}) {
  return { code, path, message, ...extra };
}

function result(status, message, extra = {}) {
  const details = message && typeof message === 'object' ? message : {};
  const textMessage = typeof message === 'string' ? message : details.message;
  return {
    status,
    ...(textMessage ? { error: textMessage } : {}),
    ...details,
    ...extra,
  };
}

function invalidInput(code, path, message, extra = {}) {
  return result('invalid_input', structuredError(code, path, message, extra));
}

function serializedSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function cartesianSize(model) {
  let total = 1;
  for (const variable of model.variables ?? []) {
    total *= variable.domain.length;
    if (total > MAX_CARTESIAN) return total;
  }
  return total;
}

function validateModel(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return structuredError('invalid_model', ['model'], 'model must be an object');
  if (model.version !== undefined && model.version !== 1 && model.version !== '1') return structuredError('unsupported_model_version', ['model', 'version'], 'unsupported model version; use 1');
  if (!Array.isArray(model.variables) || model.variables.length === 0) return structuredError('invalid_variables', ['model', 'variables'], 'variables must be a non-empty array');
  if (model.variables.length > MAX_VARIABLES) return structuredError('variable_bound_exceeded', ['model', 'variables'], `variables exceed bound ${MAX_VARIABLES}`);
  const names = new Set();
  for (const [variableIndex, variable] of model.variables.entries()) {
    if (!variable || typeof variable.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(variable.name)) return structuredError('invalid_variable_name', ['variables', variableIndex, 'name'], 'variable name must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens');
    if (names.has(variable.name)) return structuredError('duplicate_variable_name', ['variables', variableIndex, 'name'], `duplicate variable name ${variable.name}`);
    names.add(variable.name);
    if (!Array.isArray(variable.domain) || variable.domain.length === 0 || variable.domain.length > MAX_DOMAIN) return structuredError('invalid_domain', ['variables', variableIndex, 'domain'], `variable domain must be non-empty and no larger than ${MAX_DOMAIN}`);
    if (variable.domain.some((value) => value === undefined || typeof value === 'function')) return structuredError('unsupported_domain_value', ['variables', variableIndex, 'domain'], 'domain contains an unsupported value');
  }
  if (cartesianSize(model) > MAX_CARTESIAN) return structuredError('cartesian_bound_exceeded', ['variables'], `cartesian product exceeds bound ${MAX_CARTESIAN}`);
  if (model.constraints !== undefined && !Array.isArray(model.constraints)) return structuredError('invalid_constraints', ['constraints'], 'constraints must be an array');
  if (model.objectives !== undefined && !Array.isArray(model.objectives)) return structuredError('invalid_objectives', ['objectives'], 'objectives must be an array');
  for (const [constraintIndex, constraint] of (model.constraints ?? []).entries()) {
    if (!constraint || !['eq', 'neq', 'gte', 'lte', 'gt', 'lt'].includes(constraint.op)) {
      return structuredError(
        'unsupported_constraint_operation',
        ['constraints', constraintIndex, 'op'],
        'unsupported constraint operation; use one of the supported relations',
        { supported: ['eq', 'neq', 'gte', 'lte', 'gt', 'lt'] },
      );
    }
    for (const side of ['left', 'right']) {
      const expr = constraint[side];
      if (!expr || (expr.var === undefined && expr.const === undefined)) return structuredError('invalid_constraint_expression', ['constraints', constraintIndex, side], 'constraint expression must contain a variable or constant');
      if (expr.var !== undefined && !names.has(expr.var)) return structuredError('unknown_constraint_variable', ['constraints', constraintIndex, side, 'var'], `unknown variable ${expr.var}`);
    }
  }
  for (const [objectiveIndex, objective] of (model.objectives ?? []).entries()) {
    if (!objective || !['maximize', 'minimize'].includes(objective.direction)) return structuredError('invalid_objective', ['objectives', objectiveIndex], 'objective must specify direction maximize or minimize');
    if (!objective.expr || (objective.expr.var === undefined && objective.expr.const === undefined)) {
      return structuredError(
        'invalid_objective_expression',
        ['objectives', objectiveIndex, 'expr'],
        'objective expression is unsupported; use a variable or constant relation',
      );
    }
    if (objective.expr.var !== undefined && !names.has(objective.expr.var)) return structuredError('unknown_objective_variable', ['objectives', objectiveIndex, 'expr', 'var'], `unknown variable ${objective.expr.var}`);
  }
  if (model.schema_version !== undefined
      && !((Number.isInteger(model.schema_version) && model.schema_version >= 1)
        || (typeof model.schema_version === 'string' && model.schema_version.length > 0))) return structuredError('invalid_schema_version', ['schema_version'], 'schema_version must be a positive integer or non-empty string');
  for (const field of ['assumptions', 'criteria', 'evidence']) {
    if (model[field] !== undefined && !Array.isArray(model[field])) return structuredError('invalid_metadata_field', [field], `${field} must be an array`);
  }
  return null;
}

function jsonEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
  }
  return false;
}

function validateOptions(model, options) {
  if (!Array.isArray(options)) return structuredError('invalid_options', ['options'], 'options must be an array');
  if (options.length > MAX_OPTIONS) return structuredError('option_bound_exceeded', ['options'], `options exceed bound ${MAX_OPTIONS}`);
  const variables = new Map(model.variables.map(({ name, domain }) => [name, domain]));
  const errors = [];
  options.forEach((option, optionIndex) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      errors.push({ option_index: optionIndex, code: 'invalid_option', path: ['options', optionIndex], message: 'option must be an object' });
      return;
    }
    for (const field of Object.keys(option)) {
      if (!variables.has(field)) errors.push({ option_index: optionIndex, field, code: 'unknown_field', path: ['options', optionIndex, field], message: `unknown option field ${field}` });
      else if (!variables.get(field).some((value) => jsonEqual(value, option[field]))) errors.push({ option_index: optionIndex, field, code: 'out_of_domain', path: ['options', optionIndex, field], message: `option value for ${field} is outside its domain` });
    }
    for (const field of variables.keys()) {
      if (!Object.hasOwn(option, field)) errors.push({ option_index: optionIndex, field, code: 'missing_field', path: ['options', optionIndex, field], message: `option is missing variable ${field}` });
    }
  });
  return errors.length ? structuredError('invalid_option_fields', ['options'], 'one or more options contain invalid fields; inspect errors for each option', { errors }) : null;
}

class Worker {
  constructor() {
    this.closed = false;
    this.readySettled = false;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(() => {});
    this.child = spawn('clj', ['-Sdeps', '{:deps {org.clojure/core.logic {:mvn/version "1.1.0"} org.clojure/data.json {:mvn/version "2.5.0"}}}', '-M', workerPath], {
      cwd: dirname(workerPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    this.pending = [];
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.lines.on('line', (line) => {
      const next = this.pending.shift();
      if (!next) return;
      try {
        next.resolve(JSON.parse(line));
      } catch (error) {
        next.reject(error);
      }
    });
    this.child.stderr.on('data', (chunk) => process.stderr.write(`[decision-worker] ${chunk}`));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      if (!this.closed && (code !== 0 || signal)) this.fail(new Error(`decision worker exited with ${signal ?? code}`));
    });
    this._request({
      op: 'decision_model_validate',
      model: { variables: [{ name: '__startup__', domain: [true] }] },
    }, WORKER_STARTUP_TIMEOUT_MS).then(() => {
      this.readySettled = true;
      this.resolveReady();
    }).catch((error) => {
      if (!this.readySettled) {
        this.readySettled = true;
        this.rejectReady(error);
      }
      if (!this.closed) this.close(error);
    });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(error);
    }
    while (this.pending.length) this.pending.shift().reject(error);
  }
  close(error = new Error('decision worker closed')) {
    if (this.closed) return;
    this.closed = true;
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(error);
    }
    while (this.pending.length) this.pending.shift().reject(error);
    this.lines.close();
    this.child.kill('SIGTERM');
  }
  _request(payload, timeoutMs) {
    if (this.closed) return Promise.reject(new Error('decision worker is closed'));
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(pending);
        if (index >= 0) this.pending.splice(index, 1);
        reject(new Error(`decision worker timed out after ${timeoutMs}ms`));
        this.close(new Error('decision worker request cancelled'));
      }, timeoutMs);
      this.pending.push({
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { this.child.stdin.write(`${JSON.stringify(payload)}\n`); }
      catch (error) { this.fail(error); }
    });
  }
  request(payload, timeoutMs = REQUEST_TIMEOUT_MS) {
    return this.ready.then(() => this._request(payload, timeoutMs));
  }
}

export function createServer() {
  let worker = new Worker();
  let closed = false;
  return {
    async handle(request) {
      if (closed) return { jsonrpc: '2.0', id: request?.id ?? null, result: text(result('server_closed', 'server is closed'), true) };
      if (!request || request.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'invalid JSON-RPC request' } };
      if (request.method === 'initialize') return { jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'decision-support', version: '1.1.0' } } };
      if (request.method === 'notifications/initialized') return undefined;
      if (request.method === 'tools/list') return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: toolNames.map((name) => ({
            name,
            description: name.replaceAll('_', ' '),
            inputSchema: toolSchemas[name],
          })),
        },
      };
      if (request.method !== 'tools/call') return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } };
      const { name, arguments: args = {} } = request.params ?? {};
      if (!toolNames.includes(name)) return { jsonrpc: '2.0', id: request.id, result: text(invalidInput('unknown_tool', ['params', 'name'], 'unknown tool; use one of the advertised decision-support tools'), true) };
      const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
      let payload;
      const modelError = validateModel(input.model);
      if (serializedSize(request) > MAX_SERIALIZED_INPUT_BYTES) payload = invalidInput('serialized_input_too_large', ['request'], `serialized input exceeds bound ${MAX_SERIALIZED_INPUT_BYTES}`);
      else if (modelError) payload = invalidInput(modelError.code, modelError.path, modelError.message, Object.fromEntries(Object.entries(modelError).filter(([key]) => !['code', 'path', 'message'].includes(key))));
      else if (name === 'decision_options_compare' && input.options === undefined) {
        payload = invalidInput(
          'missing_options',
          ['options'],
          'options must be an array; comparison requires explicit candidate options; provide an options array',
        );
      } else if (name === 'decision_options_compare') {
        const optionError = validateOptions(input.model, input.options);
        payload = optionError ? invalidInput(optionError.code, optionError.path, optionError.message, { errors: optionError.errors }) : undefined;
      }
      if (!payload && name === 'decision_space_explore' && input.cursor !== undefined) payload = invalidInput('unsupported_cursor', ['cursor'], 'cursor is not a valid continuation cursor');
      if (!payload && name === 'decision_space_explore' && (!Number.isInteger(input.limit ?? 100) || input.limit < 1 || input.limit > MAX_LIMIT)) payload = invalidInput('invalid_limit', ['limit'], `limit must be an integer from 1 to ${MAX_LIMIT}`);
      if (!payload) {
        try { payload = await worker.request({ op: name, model: input.model, limit: input.limit ?? 100, options: input.options }); }
        catch (error) {
          payload = result(error.message.includes('timed out') ? 'timeout' : 'worker_error', error.message);
          if (worker.closed && !closed) worker = new Worker();
        }
      }
      return { jsonrpc: '2.0', id: request.id, result: text(payload, payload.status !== 'ok') };
    },
    close() {
      if (closed) return;
      closed = true;
      worker.close();
    },
  };
}
