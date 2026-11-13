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

function assertStructuredInputError(result) {
  assert.equal(result.status, 'invalid_input');
  assert.equal(typeof result.code, 'string');
  assert.ok(Array.isArray(result.path), JSON.stringify(result));
  assert.equal(typeof result.message, 'string');
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

    assertStructuredInputError(result);
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

    assertStructuredInputError(result);
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

    assertStructuredInputError(result);
    assert.equal(result.code, 'missing_options');
    assert.deepEqual(result.path, ['options']);
    assert.match(result.message, /options|candidate|provide|required/i);
  } finally {
    server.close();
  }
});

test('previously inconsistent validation failures share the same top-level shape', async () => {
  const server = createServer();
  try {
    const cases = [
      {
        name: 'decision_model_validate',
        args: { model: { ...model, constraints: [{ op: 'eq', left: { expression: 'capacity + 1' }, right: { const: 2 } }] } },
        code: 'invalid_constraint_expression',
        path: ['constraints', 0, 'left'],
      },
      {
        name: 'decision_model_validate',
        args: { model: { ...model, constraints: [{ op: 'eq', left: { var: 'missing' }, right: { const: 2 } }] } },
        code: 'unknown_constraint_variable',
        path: ['constraints', 0, 'left', 'var'],
      },
      {
        name: 'decision_space_explore',
        args: { model, limit: 0 },
        code: 'invalid_limit',
        path: ['limit'],
      },
      {
        name: 'decision_options_compare',
        args: { model, options: [{ capacity: 99 }] },
        code: 'invalid_option_fields',
        path: ['options'],
      },
    ];

    for (const item of cases) {
      const result = await call(server, item.name, item.args);
      assertStructuredInputError(result);
      assert.equal(result.code, item.code);
      assert.deepEqual(result.path, item.path);
      assert.ok(result.message.length > 0);
    }
  } finally {
    server.close();
  }
});
