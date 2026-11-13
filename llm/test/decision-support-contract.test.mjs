import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillPath = join(fileURLToPath(new URL('..', import.meta.url)), 'skills', 'decision-support', 'SKILL.md');

async function readSkill() {
  return readFile(skillPath, 'utf8');
}

test('decision-support guidance translates natural-language rules into supported explicit relations', async () => {
  const guidance = await readSkill();

  assert.match(guidance, /natural[- ]language|plain[- ]language|written rule/i);
  assert.match(guidance, /translat|map|convert|normaliz/i);
  assert.match(guidance, /equal|not equal|at least|at most|greater than|less than/i);
  assert.match(guidance, /explicit relation|supported relation|relation.*constraint/i);
});

test('decision-support guidance rejects unsupported all-of, weighted, and objective concepts', async () => {
  const guidance = await readSkill();

  for (const unsupported of [/all[- ]of/i, /weighted?/i, /objective/i]) {
    assert.match(guidance, unsupported, `guidance must name ${unsupported}`);
  }
  assert.match(guidance, /unsupported|not supported|reject|cannot represent/i);
  assert.match(guidance, /do not|not.*use|not.*accept|reject|unsupported/i);
});

test('decision-support guidance requires explicit candidate options for comparison without implementation details', async () => {
  const guidance = await readSkill();

  assert.match(guidance, /compare|comparison/i);
  assert.match(guidance, /candidate options|explicit options|options.*provided|provide.*options/i);
  assert.match(guidance, /must|required|need|cannot compare/i);

  for (const implementationTerm of [
    /\bmcp\b/i,
    /json-rpc/i,
    /\bclojure\b/i,
    /core\.logic/i,
    /decision_model_validate/i,
    /decision_space_explore/i,
    /decision_options_compare/i,
  ]) {
    assert.doesNotMatch(guidance, implementationTerm, `guidance must not expose ${implementationTerm}`);
  }
});
