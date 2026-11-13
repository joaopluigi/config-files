import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));

async function read(path) {
  return readFile(path, 'utf8');
}

test('orchestrator owns finite explicit decision analysis while subagents supply supporting work', async () => {
  const orchestrator = await read(join(llmRoot, 'agents', 'orchestrator.md'));
  const subagents = await Promise.all([
    'investigator',
    'ideator',
    'executor',
    'tester',
    'reviewer',
    'researcher',
    'critic',
  ].map((name) => read(join(llmRoot, 'agents', `${name}.md`))));

  assert.match(orchestrator, /finite|bounded|explicit/i, 'orchestrator guidance must name finite or bounded explicit decisions');
  assert.match(orchestrator, /decision support|decision model|decision space|compare options/i, 'orchestrator must use decision support directly for decision analysis');
  assert.match(orchestrator, /do not delegate|do not replace|does not replace|orchestrator.*analy/i, 'orchestrator must retain ownership of decision analysis');

  const supportingRoles = [
    /evidence/i,
    /viewpoint|perspective/i,
    /option/i,
    /implement|implementation/i,
    /test|testing/i,
    /review/i,
  ];
  for (const role of supportingRoles) {
    assert.ok(subagents.some((document) => role.test(document)), `subagents must provide ${role} support`);
  }
  assert.ok(
    subagents.some((document) => /do not|never|not.*replace|not.*decid|not.*choose/i.test(document)),
    'subagent guidance must not replace the orchestrator\'s decision analysis',
  );
});
