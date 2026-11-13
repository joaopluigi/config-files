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
  assert.match(document, /meaningful alternatives visible/i);
  assert.match(document, /trade-offs/i);
  assert.match(document, /do not silently choose the easiest or smallest option/i);
  assert.match(document, /facts, inferences, assumptions, and uncertainty/i);
  assert.match(document, /authority, approval, scope, isolation, evidence, verification, and stop conditions/i);
  assert.match(document, /smallest authorized next step only after that comparison/i);
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
  for (const skill of ['git-commit', 'git-worktree', 'pr-review', 'rewrite-text', 'worklog', 'writing-clojure']) {
    assert.match(gitignore, new RegExp(`^!/llm/skills/${skill}(?:/|$)`, 'm'), `${skill} must remain allow-listed`);
  }
});

test('orchestrator and pr-review point to universal behavior without duplicating workflow guidance', async () => {
  const orchestrator = await readUtf8(join(llmRoot, 'agents', 'orchestrator.md'));
  const prReview = await readUtf8(join(skillsRoot, 'pr-review', 'SKILL.md'));
  const worktreeReference = await readUtf8(join(skillsRoot, 'pr-review', 'references', 'worktree-and-snapshot.md'));

  assert.match(orchestrator, /llm\/rules\/agent\.md/);
  assert.doesNotMatch(orchestrator, /DecisionModel\s+v1|traffic[- ]light gate/i);
  assert.doesNotMatch(prReview, /\breviewing\b/i, 'pr-review must not depend on the deleted reviewing skill');
  assert.doesNotMatch(worktreeReference, /\bprocedure\b/i);
  assert.match(prReview, /llm\/rules\/agent\.md/);
  assert.match(worktreeReference, /llm\/rules\/agent\.md/);
});

test('install.sh keeps generic skills linking', async () => {
  const install = await readUtf8(join(repoRoot, 'install.sh'));
  assert.match(install, /link "\$REPO\/llm\/skills" "\$CONFIG_ECA\/skills"/);
  assert.match(install, /link "\$REPO\/llm\/skills" "\$CLAUDE\/skills"/);
});
