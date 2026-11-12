import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));
const agentsRoot = join(llmRoot, 'agents');
const skillsRoot = join(llmRoot, 'skills');
const ecaRoot = join(llmRoot, 'eca');

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

test('orchestrator keeps delegation-first behavior and documents DecisionModel v1 tools', async () => {
  const document = await readUtf8(join(agentsRoot, 'orchestrator.md'));

  assert.match(document, /^mode: primary$/m);
  assert.match(document, /never execute operational actions directly/i);
  assert.match(document, /delegate every task to specialized sub-agents/i);
  assert.match(document, /DecisionModel\s+v1/i);
  for (const tool of [
    'decision_model_validate',
    'decision_space_explore',
    'decision_options_compare',
  ]) {
    assert.match(document, new RegExp(`\\b${tool}\\b`));
  }
});

test('planning makes synthesis orchestrator-owned after ideators return', async () => {
  const document = await readUtf8(join(skillsRoot, 'planning', 'SKILL.md'));

  assert.match(document, /Once all ideators have returned/i);
  assert.match(document, /the orchestrator synthesizes/i);
  assert.doesNotMatch(document, /Spawn a `synthesizer`/i);
  assert.doesNotMatch(document, /synthesizer agent/i);
});

test('synthesizer is removed and both ECA profiles use the same decision-support command', async () => {
  await assert.rejects(
    access(join(agentsRoot, 'synthesizer.md'), constants.F_OK),
    (error) => error?.code === 'ENOENT',
  );

  const [personal, professional] = await Promise.all([
    readUtf8(join(ecaRoot, 'personal.json')),
    readUtf8(join(ecaRoot, 'professional.json')),
  ]);
  const personalConfig = JSON.parse(personal);
  const professionalConfig = JSON.parse(professional);
  const personalServer = personalConfig.mcpServers?.['decision-support'];
  const professionalServer = professionalConfig.mcpServers?.['decision-support'];

  assert.deepEqual(personalServer, professionalServer);
  assert.deepEqual(personalServer, {
    command: 'node',
    args: ['$HOME/dev/config-files/llm/mcp/decision-support/supervisor.mjs'],
    env: {},
  });
  assert.notEqual(personalServer.args[0].includes('/llm/mcp/worklog/'), true);
});
