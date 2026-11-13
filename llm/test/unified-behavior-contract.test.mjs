import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const skillsRoot = join(llmRoot, 'skills');
const workflowSkills = ['discovery', 'planning', 'repairing', 'realizing', 'reviewing'];

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

test('agent constitution states the universal evidence-bounded decision loop and presents meaningful alternatives with trade-offs', async () => {
  const document = await readUtf8(join(llmRoot, 'rules', 'agent.md'));

  for (const step of [
    /clarify the task/i,
    /break (?:work|the task) into steps/i,
    /evidence first/i,
    /(?:run|execute) the smallest useful check/i,
    /reproduce failures/i,
    /verify changes/i,
  ]) {
    assert.match(document, step, `universal decision loop must include ${step}`);
  }
  assert.match(document, /meaningful alternatives must always be presented with trade-offs/i);
});

test('the five workflow skill packages and their stale gitignore allow-list entries are absent', async () => {
  for (const skill of workflowSkills) {
    await assert.rejects(
      access(join(skillsRoot, skill), constants.F_OK),
      (error) => error?.code === 'ENOENT',
      `${skill} workflow skill package must be absent`,
    );
  }

  const gitignore = await readUtf8(join(repoRoot, '.gitignore'));
  for (const skill of workflowSkills) {
    assert.doesNotMatch(
      gitignore,
      new RegExp(`^!/llm/skills/${skill}(?:/|$)`, 'm'),
      `.gitignore must not allow-list deleted ${skill} workflow skill`,
    );
  }
});

test('pr-review is self-contained while install.sh keeps generic skills linking', async () => {
  const prReview = await readUtf8(join(skillsRoot, 'pr-review', 'SKILL.md'));
  const install = await readUtf8(join(repoRoot, 'install.sh'));

  assert.doesNotMatch(prReview, /\breviewing\b/i, 'pr-review must not depend on the deleted reviewing skill');
  assert.match(install, /link "\$REPO\/llm\/skills" "\$CONFIG_ECA\/skills"/);
  assert.match(install, /link "\$REPO\/llm\/skills" "\$CLAUDE\/skills"/);
});
