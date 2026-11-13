import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/mcp/server.mjs';

const model = {
  variables: [{ name: 'capacity', domain: [1, 2, 3] }],
};

function toolResult(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result, JSON.stringify(response));
  const text = response.result.content?.find((item) => item.type === 'text')?.text;
  assert.equal(typeof text, 'string', JSON.stringify(response));
  return JSON.parse(text);
}

async function call(server, name, args) {
  return toolResult(await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }));
}

test('unsupported constraint operations return actionable structured errors', async () => {
  const server = createServer();
  try {
    const result = await call(server, 'decision_model_validate', {
      model: {
        ...model,
        constraints: [{ op: 'all-of', left: { var: 'capacity' }, right: { const: 2 } }],
      },
    });

    assert.equal(result.status, 'invalid_input');
    assert.equal(result.code, 'unsupported_constraint_operation');
    assert.deepEqual(result.path, ['constraints', 0, 'op']);
    assert.deepEqual(result.supported, ['eq', 'neq', 'gte', 'lte', 'gt', 'lt']);
    assert.match(result.message, /unsupported|supported|use/i);
  } finally {
    server.close();
  }
});

test('invalid objective expressions return actionable structured errors', async () => {
  const server = createServer();
  try {
    const result = await call(server, 'decision_model_validate', {
      model: {
        ...model,
        objectives: [{ direction: 'maximize', expr: { expression: 'capacity * weight' } }],
      },
    });

    assert.equal(result.status, 'invalid_input');
    assert.equal(result.code, 'invalid_objective_expression');
    assert.deepEqual(result.path, ['objectives', 0, 'expr']);
    assert.match(result.message, /objective|expression|supported|use/i);
  } finally {
    server.close();
  }
});

test('omitted comparison options return an actionable structured error', async () => {
  const server = createServer();
  try {
    const result = await call(server, 'decision_options_compare', { model });

    assert.equal(result.status, 'invalid_input');
    assert.equal(result.code, 'missing_options');
    assert.deepEqual(result.path, ['options']);
    assert.match(result.message, /options|candidate|provide|required/i);
  } finally {
    server.close();
  }
});
