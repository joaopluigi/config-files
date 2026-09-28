import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'worklog-auth-'));
process.env.WORKLOG_DIR = root;
const { createSession, createSubagent, authorized, withLock } = await import('../server.mjs');

test('session and peer capabilities enforce ownership and registered peers', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['step']);
  const peerA = await createSubagent(session.orchestrationId, session.capabilityToken, 'executor', 'peer', 'done', ['step']);
  const peerB = await createSubagent(session.orchestrationId, session.capabilityToken, 'tester', 'peer', 'done', ['step']);
  const registry = await authorized(session.orchestrationId, session.capabilityToken, peerA.peerId, 'session-inspect');
  assert.equal(registry.peers.length, 2);
  await assert.rejects(() => createSession('executor', 'bad', 'bad', ['step']), /only orchestrator/);
  await assert.rejects(() => authorized(session.orchestrationId, peerA.capabilityToken, peerB.peerId, 'peer', 'executor'), /invalid peer capability token/);
  await assert.rejects(() => authorized(session.orchestrationId, session.capabilityToken, 'deadbeef', 'session-inspect'), /unknown peer/);
  await assert.rejects(() => authorized(session.orchestrationId, peerA.capabilityToken, peerA.peerId, 'peer', 'tester'), /actor does not own peer/);
});

test('empty stale lock is recovered and old owner cannot remove a replacement', async () => {
  const key = join(root, 'lock-target');
  const lock = `${key}.lock`;
  await mkdir(lock, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  let entered;
  const result = await withLock(key, async () => { entered = true; return 'ok'; });
  assert.equal(result, 'ok');
  assert.equal(entered, true);
  await mkdir(lock, { recursive: true });
  await import('node:fs/promises').then(({ writeFile }) => writeFile(join(lock, 'owner'), 'replacement'));
  const stillThere = await readFile(join(lock, 'owner'), 'utf8');
  assert.equal(stillThere, 'replacement');
});
