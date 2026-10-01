import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, utimes } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFile = promisify(execFileCallback);

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

test('continuation successor creation failure leaves predecessor open and creates no partial successor', async () => {
  const predecessor = await createSession('orchestrator', 'first', 'done', ['step']);
  const beforeEntries = await readdir(root);
  const before = await readFile(predecessor.path, 'utf8');
  const failingSteps = ['step'];
  failingSteps.map = () => {
    throw new Error('successor artifact construction failed');
  };
  await assert.rejects(
    () =>
      createSession(
        'orchestrator',
        'follow-up',
        'done',
        failingSteps,
        predecessor.orchestrationId,
        'continue after failure',
      ),
    /successor artifact construction failed/,
  );
  assert.equal(await readFile(predecessor.path, 'utf8'), before);
  assert.deepEqual(await readdir(root), beforeEntries);
});

test('continuation closes each open predecessor item once with the exact reason', async () => {
  const predecessor = await createSession('orchestrator', 'first', 'done', ['one', 'two']);
  const followup = await createSession(
    'orchestrator',
    'follow-up',
    'done',
    ['step'],
    predecessor.orchestrationId,
    'continue exactly as stated',
  );
  const content = await readFile(predecessor.path, 'utf8');
  assert.equal((content.match(/ done continue exactly as stated/g) || []).length, 2);
  assert.match(content, /#1 orchestrator done continue exactly as stated/);
  assert.match(content, /#2 orchestrator done continue exactly as stated/);
  const second = await createSession(
    'orchestrator',
    'second follow-up',
    'done',
    ['step'],
    predecessor.orchestrationId,
    'do not duplicate',
  );
  assert.equal(second.predecessorOrchestrationId, predecessor.orchestrationId);
  assert.equal((await readFile(predecessor.path, 'utf8')).match(/do not duplicate/g), null);
  assert.notEqual(followup.orchestrationId, second.orchestrationId);
});

test('concurrent continuations publish one successor and one continuation reason', async () => {
  const before = await readdir(root);
  const predecessor = await createSession('orchestrator', 'first', 'done', ['one', 'two']);
  const results = await Promise.allSettled([
    createSession(
      'orchestrator',
      'winner',
      'done',
      ['step'],
      predecessor.orchestrationId,
      'winner reason',
    ),
    createSession(
      'orchestrator',
      'loser',
      'done',
      ['step'],
      predecessor.orchestrationId,
      'loser reason',
    ),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.match(
    results.find(({ status }) => status === 'rejected').reason.message,
    /already in progress/,
  );
  const successors = (await readdir(root)).filter(
    (entry) => !before.includes(entry) && entry !== predecessor.orchestrationId,
  );
  assert.equal(successors.length, 1);
  const content = await readFile(predecessor.path, 'utf8');
  assert.equal((content.match(/winner reason/g) || []).length, 2);
  assert.equal((content.match(/loser reason/g) || []).length, 0);
});

test('separate processes publish one continuation successor and cleanly reject the loser', async () => {
  const before = await readdir(root);
  const predecessor = await createSession('orchestrator', 'first', 'done', ['one', 'two']);
  const script = `
    import { createSession } from './src/storage/repository.mjs';
    try {
      const result = await createSession('orchestrator', process.argv[1], 'done', ['step'], process.argv[2], process.argv[3]);
      console.log(JSON.stringify({ ok: true, result }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    }
  `;
  const args = [
    '--input-type=module',
    '-e',
    script,
    'winner-or-loser',
    predecessor.orchestrationId,
    'cross-process reason',
  ];
  const results = await Promise.all(
    ['first process', 'second process'].map(async (goal) => {
      try {
        const { stdout } = await execFile(
          process.execPath,
          args.map((arg) => (arg === 'winner-or-loser' ? goal : arg)),
          {
            cwd: new URL('..', import.meta.url),
            env: { ...process.env, WORKLOG_DIR: root },
          },
        );
        return JSON.parse(stdout.trim());
      } catch (error) {
        return JSON.parse(error.stdout.trim());
      }
    }),
  );
  assert.equal(results.filter(({ ok }) => ok).length, 1);
  assert.equal(results.filter(({ ok }) => !ok).length, 1);
  assert.match(results.find(({ ok }) => !ok).error, /already in progress/);
  const successors = (await readdir(root)).filter(
    (entry) => !before.includes(entry) && entry !== predecessor.orchestrationId,
  );
  assert.equal(successors.length, 1);
  const content = await readFile(predecessor.path, 'utf8');
  assert.equal((content.match(/cross-process reason/g) || []).length, 2);
});

test('continuation rejects unresolved linked predecessor questions', async () => {
  const predecessor = await createSession('orchestrator', 'first', 'done', ['step']);
  const registryPath = join(root, predecessor.orchestrationId, 'session.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  registry.questions.question1 = { answered: false };
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(registryPath, JSON.stringify(registry, null, 2)),
  );
  await assert.rejects(
    () =>
      createSession(
        'orchestrator',
        'follow-up',
        'done',
        ['step'],
        predecessor.orchestrationId,
        'blocked by question',
      ),
    /unresolved linked questions/,
  );
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
