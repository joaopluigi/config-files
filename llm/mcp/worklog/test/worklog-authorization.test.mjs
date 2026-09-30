import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'worklog-auth-'));
process.env.WORKLOG_DIR = root;
const {
  createSession,
  createSubagent,
  replaceSubagent,
  authorized,
  authorizedPeerMutation,
  appendEntry,
  appendEntries,
  closeWorklog,
  withLock,
} = await import('../server.mjs');

test('session lineage rejects incomplete metadata before creating artifacts', async () => {
  const before = await readdir(root);
  await assert.rejects(
    () => createSession('orchestrator', 'follow-up', 'done', ['step'], undefined, 'reason'),
    /predecessor orchestration id is required with continuation reason/,
  );
  await assert.rejects(
    () => createSession('orchestrator', 'follow-up', 'done', ['step'], 'deadbeef', 'reason'),
    /unknown predecessor orchestration id/,
  );
  assert.deepEqual(await readdir(root), before);

  const predecessor = await createSession('orchestrator', 'first', 'done', ['step']);
  const followup = await createSession(
    'orchestrator',
    'follow-up',
    'done',
    ['step'],
    predecessor.orchestrationId,
    'continue open work',
  );
  assert.notEqual(followup.orchestrationId, predecessor.orchestrationId);
  assert.notEqual(followup.capabilityToken, predecessor.capabilityToken);
  assert.equal(followup.predecessorOrchestrationId, predecessor.orchestrationId);
  assert.equal(followup.continuationReason, 'continue open work');
  assert.doesNotMatch(JSON.stringify(followup), new RegExp(predecessor.capabilityToken));
});

test('session and peer capabilities enforce ownership and registered peers', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['step']);
  const peerA = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['step'],
  );
  const peerB = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'tester',
    'peer',
    'done',
    ['step'],
  );
  const registry = await authorized(
    session.orchestrationId,
    session.capabilityToken,
    peerA.peerId,
    'session-inspect',
  );
  assert.equal(registry.peers.length, 2);
  await assert.rejects(
    () => createSession('executor', 'bad', 'bad', ['step']),
    /only orchestrator/,
  );
  await assert.rejects(
    () =>
      authorized(session.orchestrationId, peerA.capabilityToken, peerB.peerId, 'peer', 'executor'),
    /invalid peer capability token/,
  );
  await assert.rejects(
    () =>
      authorized(session.orchestrationId, session.capabilityToken, 'deadbeef', 'session-inspect'),
    /unknown peer/,
  );
  await assert.rejects(
    () =>
      authorized(session.orchestrationId, peerA.capabilityToken, peerA.peerId, 'peer', 'tester'),
    /actor does not own peer/,
  );
});

test('main, child, and replacement headers preserve distinct goal and done values', async () => {
  const session = await createSession('orchestrator', 'main goal', 'main done', ['step']);
  const child = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'child goal',
    'child done',
    ['step'],
  );
  const replacement = await replaceSubagent(
    session.orchestrationId,
    session.capabilityToken,
    child.peerId,
    'tester',
    'replacement goal',
    'replacement done',
    ['step'],
    'continue interrupted work',
  );

  assert.match(await readFile(session.path, 'utf8'), /\ngoal: main goal\ndone: main done\n/);
  assert.match(await readFile(child.path, 'utf8'), /\ngoal: child goal\ndone: child done\n/);
  assert.match(
    await readFile(replacement.path, 'utf8'),
    /\ngoal: replacement goal\ndone: replacement done\n/,
  );
});

test('child actor ownership protects append and close and preserves failed mutations', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['append']);
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['append'],
  );
  const before = await readFile(peer.path, 'utf8');
  await assert.rejects(
    () =>
      authorized(
        session.orchestrationId,
        peer.capabilityToken,
        peer.peerId,
        'peer',
        'orchestrator',
      ),
    /actor does not own peer/,
  );
  assert.equal(await readFile(peer.path, 'utf8'), before);
  await authorized(session.orchestrationId, peer.capabilityToken, peer.peerId, 'peer', 'executor');
  await appendEntry(peer.path, 1, 'executor', 'think', 'owned');
  const afterAppend = await readFile(peer.path, 'utf8');
  await assert.rejects(
    () =>
      authorized(
        session.orchestrationId,
        peer.capabilityToken,
        peer.peerId,
        'peer',
        'orchestrator',
      ),
    /actor does not own peer/,
  );
  assert.equal(await readFile(peer.path, 'utf8'), afterAppend);
  const closed = await closeWorklog(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    1,
    'executor',
    'complete',
  );
  assert.equal(closed.closed, true);
  const content = await readFile(peer.path, 'utf8');
  assert.match(content, /actor: executor/);
  assert.match(content, /executor think owned/);
  assert.match(content, /executor done complete/);
  assert.doesNotMatch(content, /orchestrator (think|done) wrong/);
});

test('replacement creates isolated linked credentials and preserves predecessor', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['step']);
  const predecessor = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'old',
    'done',
    ['step'],
  );
  const replacement = await replaceSubagent(
    session.orchestrationId,
    session.capabilityToken,
    predecessor.peerId,
    'tester',
    'new',
    'done',
    ['step'],
    'continue interrupted work',
  );
  assert.notEqual(replacement.peerId, predecessor.peerId);
  assert.notEqual(replacement.capabilityToken, predecessor.capabilityToken);
  assert.equal(replacement.actor, 'tester');
  assert.equal(replacement.predecessorPeerId, predecessor.peerId);
  const predecessorContent = await readFile(predecessor.path, 'utf8');
  assert.match(predecessorContent, /#1 orchestrator done continuation moved to peer/);
  const registry = await authorized(
    session.orchestrationId,
    session.capabilityToken,
    replacement.peerId,
    'session-inspect',
  );
  const linked = registry.peers.find((peer) => peer.id === replacement.peerId);
  assert.equal(linked.predecessorPeerId, predecessor.peerId);
  assert.equal(linked.continuationReason, 'continue interrupted work');
  await assert.rejects(
    () =>
      authorized(
        session.orchestrationId,
        replacement.capabilityToken,
        replacement.peerId,
        'peer',
        'executor',
      ),
    /actor/,
  );
  await assert.rejects(
    () =>
      authorized(
        session.orchestrationId,
        predecessor.capabilityToken,
        predecessor.peerId,
        'peer',
        'tester',
      ),
    /actor/,
  );
  await authorized(
    session.orchestrationId,
    replacement.capabilityToken,
    replacement.peerId,
    'peer',
    'tester',
  );
  await appendEntry(replacement.path, 1, 'tester', 'think', 'owned by replacement');
});

test('replacement requires an existing incomplete predecessor and orchestrator capability', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['step']);
  const predecessor = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'old',
    'done',
    ['step'],
  );
  await assert.rejects(
    () =>
      replaceSubagent(
        session.orchestrationId,
        'bad-token',
        predecessor.peerId,
        'tester',
        'new',
        'done',
        ['step'],
        'reason',
      ),
    /invalid session capability token/,
  );
  await assert.rejects(
    () =>
      replaceSubagent(
        session.orchestrationId,
        session.capabilityToken,
        'deadbeef',
        'tester',
        'new',
        'done',
        ['step'],
        'reason',
      ),
    /unknown predecessor peer/,
  );
  await appendEntry(predecessor.path, 1, 'executor', 'think', 'reason');
  await closeWorklog(
    session.orchestrationId,
    predecessor.capabilityToken,
    predecessor.peerId,
    1,
    'executor',
    'complete',
  );
  await assert.rejects(
    () =>
      replaceSubagent(
        session.orchestrationId,
        session.capabilityToken,
        predecessor.peerId,
        'tester',
        'new',
        'done',
        ['step'],
        'reason',
      ),
    /already complete/,
  );
});

test('empty stale lock is recovered and old owner cannot remove a replacement', async () => {
  const key = join(root, 'lock-target');
  const lock = `${key}.lock`;
  await mkdir(lock, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  let entered;
  const result = await withLock(key, async () => {
    entered = true;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(entered, true);
  await mkdir(lock, { recursive: true });
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(join(lock, 'owner'), 'replacement'),
  );
  const stillThere = await readFile(join(lock, 'owner'), 'utf8');
  assert.equal(stillThere, 'replacement');
});

test('peer mutation contexts cannot be reused across peer or main logs', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['one']);
  const peerA = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer a',
    'done',
    ['one'],
  );
  const peerB = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'tester',
    'peer b',
    'done',
    ['one'],
  );
  const contextA = await authorizedPeerMutation(
    session.orchestrationId,
    peerA.capabilityToken,
    peerA.peerId,
    'executor',
  );

  await assert.rejects(
    () => appendEntry(peerB.path, 1, 'tester', 'done', 'cross-peer', contextA),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () =>
      appendEntries(
        peerB.path,
        'tester',
        [{ item: 1, tag: 'done', message: 'cross-peer batch' }],
        contextA,
      ),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () =>
      closeWorklog(
        session.orchestrationId,
        peerB.capabilityToken,
        peerB.peerId,
        1,
        'tester',
        'cross-peer close',
        contextA,
      ),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'done', 'peer-to-main', contextA),
    /requires prior reasoning/,
  );
  assert.doesNotMatch(await readFile(peerB.path, 'utf8'), /cross-peer/);
  assert.doesNotMatch(await readFile(session.path, 'utf8'), /peer-to-main/);
});

test('peer mutation contexts resist retargeting and preserve default deny', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['one']);
  const peerA = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer a',
    'done',
    ['one'],
  );
  const peerB = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'tester',
    'peer b',
    'done',
    ['one'],
  );
  const context = await authorizedPeerMutation(
    session.orchestrationId,
    peerA.capabilityToken,
    peerA.peerId,
    'executor',
  );

  for (const [field, value] of [
    ['orchestrationId', 'retargeted'],
    ['peerId', peerB.peerId],
    ['actor', 'tester'],
    ['path', peerB.path],
  ]) {
    assert.throws(() => {
      context[field] = value;
    }, TypeError);
  }

  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'done', 'tampered main', context),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () => appendEntry(peerB.path, 1, 'tester', 'done', 'tampered peer', context),
    /requires prior reasoning/,
  );
  assert.doesNotMatch(await readFile(session.path, 'utf8'), /tampered main/);
  assert.doesNotMatch(await readFile(peerB.path, 'utf8'), /tampered peer/);
});

test('forged peer mutation contexts cannot bypass reasoning for append, batch, or close', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['one']);
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['one'],
  );
  const trusted = await authorizedPeerMutation(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    'executor',
  );
  const forged = { ...trusted };
  assert.notEqual(forged, trusted);
  assert.deepEqual(Object.keys(forged).sort(), Object.keys(trusted).sort());
  const peerBefore = await readFile(peer.path, 'utf8');
  const mainBefore = await readFile(session.path, 'utf8');

  await assert.rejects(
    () => appendEntry(peer.path, 1, 'executor', 'done', 'forged append', forged),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () =>
      appendEntries(
        peer.path,
        'executor',
        [{ item: 1, tag: 'done', message: 'forged batch' }],
        forged,
      ),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () =>
      closeWorklog(
        session.orchestrationId,
        peer.capabilityToken,
        peer.peerId,
        1,
        'executor',
        'forged close',
        forged,
      ),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'done', 'forged main', forged),
    /requires prior reasoning/,
  );
  assert.equal(await readFile(peer.path, 'utf8'), peerBefore);
  assert.equal(await readFile(session.path, 'utf8'), mainBefore);
});

test('authorized peers may complete without reasoning while main and direct calls remain gated', async () => {
  const session = await createSession('orchestrator', 'goal', 'done', ['one', 'two']);
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['one', 'two'],
  );
  const context = await authorizedPeerMutation(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    'executor',
  );
  await appendEntry(peer.path, 1, 'executor', 'done', 'first', context);
  await appendEntries(
    peer.path,
    'executor',
    [{ item: 2, tag: 'done', message: 'second' }],
    context,
  );
  assert.match(await readFile(peer.path, 'utf8'), /executor done first[\s\S]*executor done second/);
  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'done', 'without reasoning'),
    /requires prior reasoning/,
  );
  await assert.rejects(
    () =>
      authorizedPeerMutation(session.orchestrationId, peer.capabilityToken, peer.peerId, 'tester'),
    /actor does not own peer/,
  );
});
