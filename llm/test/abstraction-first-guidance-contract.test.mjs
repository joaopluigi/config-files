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

const solverTools = [
  'decision_model_validate',
  'decision_space_explore',
  'decision_options_compare',
];

function toolPattern(tool) {
  return new RegExp(`\\b${tool}\\b`, 'g');
}

test('orchestrator keeps solver names in allowed-tools and explains the abstraction-first behavior', async () => {
  const document = await readUtf8(join(llmRoot, 'agents', 'orchestrator.md'));
  const { frontmatter, prose } = splitFrontmatter(document);

  for (const tool of solverTools) {
    assert.equal((frontmatter.match(toolPattern(tool)) ?? []).length, 1, `${tool} must be listed once in the allowed-tools surface`);
    assert.equal((prose.match(toolPattern(tool)) ?? []).length, 0, `${tool} must not appear in orchestrator prose`);
  }

  for (const abstraction of ['model', 'validate', 'explore', 'compare', 'certainty']) {
    assert.match(prose, new RegExp(`\\b${abstraction}\\b`, 'i'), `prose must describe solver behavior through ${abstraction}`);
  }
});

test('orchestrator has a traffic-light gate for finite closed constraint problems and vague subjective open problems', async () => {
  const document = await readUtf8(join(llmRoot, 'agents', 'orchestrator.md'));

  assert.match(document, /traffic[- ]light|green\b[\s\S]*amber\b[\s\S]*red\b/i);
  assert.match(document, /finite[\s-]+closed[\s\S]*constraint|closed[\s-]+constraint[\s\S]*finite/i);
  assert.match(document, /vague[\s,/-]+subjective[\s,/-]+open|vague[\s\S]*subjective[\s\S]*open/i);
  assert.match(document, /gate|fallback|do not force|ordinary reasoning|ask the user/i);
});

test('planning uses the same behavior-first workflow and fallback without implementation names', async () => {
  const document = await readUtf8(join(llmRoot, 'skills', 'planning', 'SKILL.md'));

  for (const abstraction of ['model', 'validate', 'explore', 'compare', 'certainty']) {
    assert.match(document, new RegExp(`\\b${abstraction}\\b`, 'i'), `planning must describe ${abstraction} as behavior`);
  }
  assert.match(document, /finite[\s-]+closed[\s\S]*constraint|closed[\s-]+constraint[\s\S]*finite/i);
  assert.match(document, /vague[\s,/-]+subjective[\s,/-]+open|vague[\s\S]*subjective[\s\S]*open/i);
  assert.match(document, /fallback|ordinary reasoning|do not force|ask the user|state uncertainty/i);

  for (const tool of solverTools) {
    assert.doesNotMatch(document, toolPattern(tool), `planning must not depend on direct MCP name ${tool}`);
  }
  assert.doesNotMatch(document, /core\.logic|\b(?:run\*|lvar|fresh|conde|membero|featurec)\b/i);
});
