import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const serverEntrypoint = join(packageRoot, 'supervisor.mjs');
const expectedTools = [
  'decision_model_validate',
  'decision_space_explore',
  'decision_options_compare',
];

const finiteModel = {
  variables: [
    { name: 'capacity', domain: [1, 2, 3] },
    { name: 'mode', domain: ['safe', 'fast'] },
  ],
  constraints: [
    { op: 'gte', left: { var: 'capacity' }, right: { const: 2 } },
    { op: 'eq', left: { var: 'mode' }, right: { const: 'safe' } },
  ],
  objectives: [{ direction: 'maximize', expr: { var: 'capacity' } }],
};

const invalidModel = {
  variables: [{ name: 'unbounded', domain: [] }],
  constraints: [],
};

const objectDomainModel = {
  variables: [{ name: 'profile', domain: [{ tier: 'standard', limits: { cpu: 2, memory: 8 } }] }],
  constraints: [],
};

const oversizedModel = {
  variables: Array.from({ length: 101 }, (_, index) => ({
    name: `v${index}`,
    domain: [0, 1],
  })),
  constraints: [],
};

function requestLine(child, request) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      child.stdout.off('data', onData);
      const line = buffer.slice(0, newline);
      try {
        const response = JSON.parse(line);
        resolve({ line, response });
      } catch (error) {
        reject(new Error(`stdout was not one JSON object per line: ${line}`, { cause: error }));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

async function startServer() {
  try {
    await access(serverEntrypoint, constants.R_OK);
  } catch (error) {
    assert.fail(
      `approved Unit A target is not implemented: expected executable ${serverEntrypoint}; ${error.message}`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), 'decision-support-stdio-'));
  const child = spawn(process.execPath, [serverEntrypoint], {
    cwd: dirname(serverEntrypoint),
    env: { ...process.env, DECISION_SUPPORT_WORK_DIR: workDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return { child, stderr: () => stderr, workDir };
}

async function stopServer(server) {
  server.child.kill('SIGTERM');
  await new Promise((resolve) => server.child.once('close', resolve));
  await rm(server.workDir, { recursive: true, force: true });
}

async function initialize(server) {
  const { response } = await requestLine(server.child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'decision-support-unit-a-test', version: '1.0.0' },
    },
  });
  assert.equal(response.id, 1);
  assert.ok(response.result, JSON.stringify(response));
  return response;
}

function toolText(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result, JSON.stringify(response));
  const text = response.result.content?.find((item) => item.type === 'text')?.text;
  assert.equal(typeof text, 'string', JSON.stringify(response));
  return JSON.parse(text);
}

test('real stdio initialization lists exactly the decision tools and keeps stdout protocol-clean', async () => {
  const server = await startServer();
  try {
    const initializeResponse = await initialize(server);
    assert.equal(initializeResponse.result.serverInfo.name, 'decision-support');

    const { line, response } = await requestLine(server.child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.equal(response.id, 2);
    assert.deepEqual(
      response.result.tools.map(({ name }) => name),
      expectedTools,
    );
    const schemas = Object.fromEntries(response.result.tools.map(({ name, inputSchema }) => [name, inputSchema]));
    assert.notDeepEqual(schemas.decision_model_validate, schemas.decision_space_explore);
    assert.notDeepEqual(schemas.decision_space_explore, schemas.decision_options_compare);
    assert.deepEqual(Object.keys(schemas.decision_model_validate.properties), ['model']);
    assert.equal(schemas.decision_model_validate.required[0], 'model');
    assert.equal(schemas.decision_space_explore.properties.limit.minimum, 1);
    assert.equal(schemas.decision_space_explore.properties.limit.maximum, 1000);
    assert.equal(schemas.decision_space_explore.properties.cursor.type, 'string');
    assert.equal(schemas.decision_options_compare.properties.options.type, 'array');
    assert.equal(schemas.decision_options_compare.properties.options.maxItems, 1000);
    assert.deepEqual(schemas.decision_options_compare.required, ['model', 'options']);
    assert.doesNotMatch(line, /^(?!\{).*$/);
    assert.doesNotMatch(server.stderr(), /stdout|console\.log|protocol/i);
  } finally {
    await stopServer(server);
  }
});

test('finite models produce known feasible solutions and comparison/frontier output through tools', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const validation = toolText(
      (await requestLine(server.child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'decision_model_validate', arguments: { model: finiteModel } },
      })).response,
    );
    assert.equal(validation.status, 'ok');
    assert.equal(validation.feasible, true);

    const exploration = toolText(
      (await requestLine(server.child, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'decision_space_explore',
          arguments: { model: finiteModel, limit: 10 },
        },
      })).response,
    );
    assert.equal(exploration.status, 'ok');
    assert.deepEqual(exploration.solutions, [
      { capacity: 2, mode: 'safe' },
      { capacity: 3, mode: 'safe' },
    ]);

    const comparison = toolText(
      (await requestLine(server.child, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'decision_options_compare',
          arguments: {
            model: finiteModel,
            options: [
              { capacity: 2, mode: 'safe' },
              { capacity: 3, mode: 'safe' },
            ],
          },
        },
      })).response,
    );
    assert.equal(comparison.status, 'ok');
    assert.deepEqual(comparison.frontier, [{ capacity: 3, mode: 'safe' }]);
  } finally {
    await stopServer(server);
  }
});

test('DecisionModel metadata is validated and preserved in tool results', async () => {
  const server = await startServer();
  const metadata = {
    schema_version: '2025-01',
    assumptions: ['capacity values are measured in GiB'],
    criteria: [{ name: 'capacity', direction: 'maximize' }],
    evidence: [{ source: 'benchmark-1', confidence: 'medium' }],
  };
  try {
    await initialize(server);
    const validation = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'metadata', method: 'tools/call',
      params: { name: 'decision_model_validate', arguments: { model: { ...finiteModel, ...metadata } } },
    })).response);
    assert.equal(validation.status, 'ok');
    assert.deepEqual(validation.metadata, metadata);

    const invalid = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'invalid-metadata', method: 'tools/call',
      params: { name: 'decision_model_validate', arguments: { model: { ...finiteModel, criteria: 'not-an-array' } } },
    })).response);
    assert.equal(invalid.status, 'invalid_input');
    assert.match(invalid.error, /criteria must be an array/);
  } finally {
    await stopServer(server);
  }
});

test('aggregate bounds reject serialized input, Cartesian products, and option counts before execution', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const cases = [
      {
        id: 'cartesian',
        arguments: {
          model: {
            variables: Array.from({ length: 5 }, (_, index) => ({ name: `v${index}`, domain: Array.from({ length: 10 }, (_, value) => value) })),
          },
        },
        expected: /cartesian product exceeds bound/,
      },
      {
        id: 'options',
        arguments: { model: finiteModel, options: Array.from({ length: 1001 }, () => ({ capacity: 2, mode: 'safe' })) },
        expected: /options exceed bound/,
      },
      {
        id: 'serialized',
        arguments: { model: { ...finiteModel, note: 'x'.repeat(300000) } },
        expected: /serialized input exceeds bound/,
      },
    ];
    for (const item of cases) {
      const payload = toolText((await requestLine(server.child, {
        jsonrpc: '2.0', id: item.id, method: 'tools/call',
        params: { name: item.id === 'options' ? 'decision_options_compare' : 'decision_model_validate', arguments: item.arguments },
      })).response);
      assert.equal(payload.status, 'invalid_input');
      assert.match(payload.error, item.expected);
    }
  } finally {
    await stopServer(server);
  }
});

test('compare rejects omitted options while accepting an explicitly empty array', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const omitted = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'omitted-options', method: 'tools/call',
      params: { name: 'decision_options_compare', arguments: { model: finiteModel } },
    })).response);
    assert.equal(omitted.status, 'invalid_input');
    assert.match(omitted.error, /options must be an array/);

    const empty = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'empty-options', method: 'tools/call',
      params: { name: 'decision_options_compare', arguments: { model: finiteModel, options: [] } },
    })).response);
    assert.equal(empty.status, 'ok');
    assert.deepEqual(empty.feasible, []);
    assert.deepEqual(empty.frontier, []);
  } finally {
    await stopServer(server);
  }
});

test('compare uses deep structural equality for JSON object domain values', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const payload = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'object-domain', method: 'tools/call',
      params: {
        name: 'decision_options_compare',
        arguments: {
          model: objectDomainModel,
          options: [{ profile: { limits: { memory: 8, cpu: 2 }, tier: 'standard' } }],
        },
      },
    })).response);
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.feasible, [{ profile: { limits: { memory: 8, cpu: 2 }, tier: 'standard' } }]);
    assert.deepEqual(payload.frontier, payload.feasible);
  } finally {
    await stopServer(server);
  }
});

test('compare rejects unknown and out-of-domain option fields with machine-readable errors', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const payload = toolText((await requestLine(server.child, {
      jsonrpc: '2.0', id: 'invalid-options', method: 'tools/call',
      params: {
        name: 'decision_options_compare',
        arguments: { model: finiteModel, options: [{ capacity: 99, mode: 'safe', extra: true }] },
      },
    })).response);
    assert.equal(payload.status, 'invalid_input');
    assert.deepEqual(payload.errors.map(({ code, field }) => ({ code, field })), [
      { code: 'out_of_domain', field: 'capacity' },
      { code: 'unknown_field', field: 'extra' },
    ]);
  } finally {
    await stopServer(server);
  }
});

test('stdin close cleans up the worker and exits without leaving a child process', async () => {
  const server = await startServer();
  server.child.stdin.end();
  const exit = await new Promise((resolve) => server.child.once('close', (code, signal) => resolve({ code, signal })));
  assert.equal(exit.signal, null);
});

test('invalid or oversized models and truncated exploration return machine-readable statuses without eval', async () => {
  const server = await startServer();
  try {
    await initialize(server);
    const evalSentinel = join(server.workDir, 'eval-sentinel');
    const calls = [
      ['invalid', invalidModel, undefined],
      ['oversized', oversizedModel, undefined],
      ['truncated', finiteModel, { limit: 1, cursor: 'not-a-real-cursor' }],
      [
        'arbitrary-eval',
        {
          ...finiteModel,
          constraints: [{ op: 'eval', code: `require('node:fs').writeFileSync(${JSON.stringify(evalSentinel)}, 'executed')` }],
        },
        undefined,
      ],
    ];

    for (const [label, model, extra] of calls) {
      const result = toolText(
        (await requestLine(server.child, {
          jsonrpc: '2.0',
          id: label,
          method: 'tools/call',
          params: {
            name: label === 'truncated' ? 'decision_space_explore' : 'decision_model_validate',
            arguments: { model, ...(extra ?? {}) },
          },
        })).response,
      );
      assert.equal(typeof result.status, 'string', `${label} must return a machine-readable status`);
      assert.notEqual(result.status, 'ok', `${label} must not be accepted as a successful model/run`);
    }
    await assert.rejects(access(evalSentinel), /ENOENT/);
  } finally {
    await stopServer(server);
  }
});
