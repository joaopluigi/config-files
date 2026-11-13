import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

function splitFrontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, 'expected YAML frontmatter followed by prose');
  return { frontmatter: match[1], prose: match[2] };
}

const allowedTools = [
  'eca__spawn_agent',
  'decision_model_validate',
  'decision_space_explore',
  'decision_options_compare',
  'worklog__worklog_session_create',
  'worklog__worklog_peer_create',
  'worklog__worklog_append',
  'worklog__worklog_read',
  'worklog__worklog_ask',
  'worklog__worklog_answer',
  'worklog__worklog_status',
  'worklog__worklog_close',
];

function toolPattern(tool) {
  return new RegExp(`\\b${tool}\\b`, 'g');
}

test('orchestrator keeps direct tool names only in allowed-tools and points to universal behavior', async () => {
  const document = await readUtf8(join(llmRoot, 'agents', 'orchestrator.md'));
  const { frontmatter, prose } = splitFrontmatter(document);

  for (const tool of allowedTools) {
    assert.equal((frontmatter.match(toolPattern(tool)) ?? []).length, 1, `${tool} must be listed once in the allowed-tools surface`);
    assert.equal((prose.match(toolPattern(tool)) ?? []).length, 0, `${tool} must not appear in orchestrator prose`);
  }
  assert.match(prose, /llm\/rules\/agent\.md/);
  assert.match(prose, /delegate every task to specialized sub-agents/i);
});

test('universal guidance owns the behavior loop and decision invariants', async () => {
  const document = await readUtf8(join(llmRoot, 'rules', 'agent.md'));

  for (const phrase of [
    /meaningful alternatives visible/i,
    /trade-offs/i,
    /facts, inferences, assumptions, and uncertainty/i,
    /smallest authorized next step/i,
    /authority, approval, scope, isolation, evidence, verification, and stop conditions/i,
  ]) {
    assert.match(document, phrase);
  }
  assert.doesNotMatch(document, /decisionmodel|traffic[- ]light|finite closed constraint/i);
});
