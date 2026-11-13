import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));
const skillPath = join(llmRoot, 'skills', 'decision-support', 'SKILL.md');

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

function splitFrontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(match, 'expected conceptual YAML frontmatter followed by guidance prose');
  return { frontmatter: match[1], prose: match[2] };
}

test('decision-support skill exists and defines when structured support is and is not appropriate', async () => {
  await access(skillPath, constants.F_OK);
  const { frontmatter, prose } = splitFrontmatter(await readUtf8(skillPath));

  assert.match(frontmatter, /^name:\s*decision-support\s*$/m);
  assert.match(frontmatter, /^description:\s*\S[\s\S]*$/m);
  assert.match(prose, /when to use structured decision support/i);
  assert.match(prose, /when not to use structured decision support/i);
});

test('decision-support skill explains its conceptual model and certainty levels', async () => {
  const { prose } = splitFrontmatter(await readUtf8(skillPath));

  for (const concept of [
    'variables',
    'domains',
    'hard constraints',
    'objectives',
    'assumptions',
    'evidence',
    'limits',
    'trade-offs',
    'options',
    'exact',
    'bounded',
    'heuristic',
    'unresolved',
  ]) {
    assert.match(prose, new RegExp(`\\b${concept.replace('-', '\\-')}\\b`, 'i'), `guidance must explain ${concept}`);
  }
});

test('decision-support skill explains fallback and approval without implementation details', async () => {
  const { prose } = splitFrontmatter(await readUtf8(skillPath));

  assert.match(prose, /fallback/i);
  assert.match(prose, /approval/i);
  assert.match(prose, /authorized|permission|human/i);

  for (const implementationTerm of [
    /\bmcp\b/i,
    /json-rpc/i,
    /\bclojure\b/i,
    /core\.logic/i,
    /\bmembero\b/i,
    /\brun\*/i,
    /\bdecision_model_validate\b/i,
    /\bdecision_space_explore\b/i,
    /\bdecision_options_compare\b/i,
    /llm\/rules\/agent\.md/i,
  ]) {
    assert.doesNotMatch(prose, implementationTerm, `guidance must not expose ${implementationTerm}`);
  }
});
