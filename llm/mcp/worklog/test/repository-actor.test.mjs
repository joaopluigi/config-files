import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'worklog-actor-'));
process.env.WORKLOG_DIR = root;
const { createSession, discoverSessions, registryPath } =
  await import('../src/storage/repository.mjs');

test('createSession persists the main actor and discoverSessions exposes it', async () => {
  const created = await createSession('orchestrator', 'goal', 'done', ['step']);
  const registry = JSON.parse(await readFile(registryPath(created.orchestrationId), 'utf8'));
  assert.equal(registry.actor, 'orchestrator');
  assert.equal((await discoverSessions('orchestrator')).sessions[0].actor, 'orchestrator');
});

test('discoverSessions falls back to orchestrator for missing or non-string main actors', async () => {
  for (const actor of [undefined, 42]) {
    const created = await createSession('orchestrator', `goal-${String(actor)}`, 'done', ['step']);
    const path = registryPath(created.orchestrationId);
    const registry = JSON.parse(await readFile(path, 'utf8'));
    if (actor === undefined) delete registry.actor;
    else registry.actor = actor;
    await writeFile(path, JSON.stringify(registry));
    const session = (await discoverSessions('orchestrator')).sessions.find(
      ({ orchestrationId }) => orchestrationId === created.orchestrationId,
    );
    assert.equal(session.actor, 'orchestrator');
  }
});
