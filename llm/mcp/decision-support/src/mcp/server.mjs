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

function result(status, message, extra = {}) {
  return { status, ...(message ? { error: message } : {}), ...extra };
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
  if (!model || typeof model !== 'object' || Array.isArray(model)) return 'model must be an object';
  if (model.version !== undefined && model.version !== 1 && model.version !== '1') return 'unsupported model version';
  if (!Array.isArray(model.variables) || model.variables.length === 0) return 'variables must be a non-empty array';
  if (model.variables.length > MAX_VARIABLES) return `variables exceed bound ${MAX_VARIABLES}`;
  const names = new Set();
  for (const variable of model.variables) {
    if (!variable || typeof variable.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(variable.name)) return 'invalid variable name';
    if (names.has(variable.name)) return 'duplicate variable name';
    names.add(variable.name);
    if (!Array.isArray(variable.domain) || variable.domain.length === 0 || variable.domain.length > MAX_DOMAIN) return 'variable domains must be bounded and non-empty';
    if (variable.domain.some((value) => value === undefined || typeof value === 'function')) return 'domain contains unsupported value';
  }
  if (cartesianSize(model) > MAX_CARTESIAN) return `cartesian product exceeds bound ${MAX_CARTESIAN}`;
  if (model.constraints !== undefined && !Array.isArray(model.constraints)) return 'constraints must be an array';
  if (model.objectives !== undefined && !Array.isArray(model.objectives)) return 'objectives must be an array';
  for (const constraint of model.constraints ?? []) {
    if (!constraint || !['eq', 'neq', 'gte', 'lte', 'gt', 'lt'].includes(constraint.op)) return 'unsupported constraint operation';
    for (const side of ['left', 'right']) {
      const expr = constraint[side];
      if (!expr || (expr.var === undefined && expr.const === undefined)) return 'invalid constraint expression';
      if (expr.var !== undefined && !names.has(expr.var)) return 'unknown variable';
    }
  }
  for (const objective of model.objectives ?? []) {
    if (!objective || !['maximize', 'minimize'].includes(objective.direction)) return 'invalid objective';
    if (!objective.expr || (objective.expr.var === undefined && objective.expr.const === undefined)) return 'invalid objective expression';
    if (objective.expr.var !== undefined && !names.has(objective.expr.var)) return 'unknown objective variable';
  }
  if (model.schema_version !== undefined
      && !((Number.isInteger(model.schema_version) && model.schema_version >= 1)
        || (typeof model.schema_version === 'string' && model.schema_version.length > 0))) return 'schema_version must be a positive integer or non-empty string';
  for (const field of ['assumptions', 'criteria', 'evidence']) {
    if (model[field] !== undefined && !Array.isArray(model[field])) return `${field} must be an array`;
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
  if (!Array.isArray(options)) return { message: 'options must be an array' };
  if (options.length > MAX_OPTIONS) return { message: `options exceed bound ${MAX_OPTIONS}` };
  const variables = new Map(model.variables.map(({ name, domain }) => [name, domain]));
  const errors = [];
  options.forEach((option, optionIndex) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      errors.push({ option_index: optionIndex, code: 'invalid_option', message: 'option must be an object' });
      return;
    }
    for (const field of Object.keys(option)) {
      if (!variables.has(field)) errors.push({ option_index: optionIndex, field, code: 'unknown_field', message: `unknown option field ${field}` });
      else if (!variables.get(field).some((value) => jsonEqual(value, option[field]))) errors.push({ option_index: optionIndex, field, code: 'out_of_domain', message: `option value for ${field} is outside its domain` });
    }
    for (const field of variables.keys()) {
      if (!Object.hasOwn(option, field)) errors.push({ option_index: optionIndex, field, code: 'missing_field', message: `option is missing variable ${field}` });
    }
  });
  return errors.length ? { errors } : null;
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
      if (!toolNames.includes(name)) return { jsonrpc: '2.0', id: request.id, result: text(result('error', 'unknown tool'), true) };
      let payload;
      const modelError = validateModel(args.model);
      if (serializedSize(request) > MAX_SERIALIZED_INPUT_BYTES) payload = result('invalid_input', `serialized input exceeds bound ${MAX_SERIALIZED_INPUT_BYTES}`);
      else if (modelError) payload = result('invalid_input', modelError);
      else if (name === 'decision_options_compare') {
        const optionError = validateOptions(args.model, args.options);
        payload = optionError ? result('invalid_input', optionError.message, { errors: optionError.errors }) : undefined;
      }
      if (!payload && name === 'decision_space_explore' && args.cursor !== undefined) payload = result('invalid_input', 'cursor is not a valid continuation cursor');
      if (!payload && name === 'decision_space_explore' && (!Number.isInteger(args.limit ?? 100) || args.limit < 1 || args.limit > MAX_LIMIT)) payload = result('invalid_input', `limit must be an integer from 1 to ${MAX_LIMIT}`);
      if (!payload) {
        try { payload = await worker.request({ op: name, model: args.model, limit: args.limit ?? 100, options: args.options }); }
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
