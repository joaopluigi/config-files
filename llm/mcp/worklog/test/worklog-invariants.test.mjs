import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withLock } from '../src/storage/locks.mjs';

const root = await mkdtemp(join(tmpdir(), 'worklog-invariants-'));
process.env.WORKLOG_DIR = root;
const {
  appendEntry,
  closeWorklog,
  createSession,
  createSubagent,
  replaceSubagent,
  pathFor,
  sessionCompletion,
} = await import('../server.mjs');

async function prepared(steps = ['step']) {
  const session = await createSession('orchestrator', 'goal', 'done', steps);
  return session;
}

test('main close waits for registry serialization', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const registry = join(root, session.orchestrationId, 'session.json');
  let settled = false;
  const closing = closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  ).then((result) => {
    settled = true;
    return result;
  });

  await withLock(registry, async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(settled, false);
  });

  assert.equal((await closing).closed, true);
});

test('orchestrator is rejected as a peer without mutation', async () => {
  const session = await prepared();
  const registryPath = join(root, session.orchestrationId, 'session.json');
  const before = await readFile(registryPath, 'utf8');
  await assert.rejects(
    () =>
      createSubagent(
        session.orchestrationId,
        session.capabilityToken,
        'orchestrator',
        'peer',
        'done',
        ['step'],
      ),
    /orchestrator may not act as a peer/,
  );
  assert.equal(await readFile(registryPath, 'utf8'), before);
});

test('orchestrator is rejected for replacement without mutation', async () => {
  const session = await prepared();
  const predecessor = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'old',
    'done',
    ['step'],
  );
  const registryPath = join(root, session.orchestrationId, 'session.json');
  const before = await readFile(registryPath, 'utf8');
  await assert.rejects(
    () =>
      replaceSubagent(
        session.orchestrationId,
        session.capabilityToken,
        predecessor.peerId,
        'orchestrator',
        'replacement',
        'done',
        ['step'],
        'resume safely',
      ),
    /orchestrator may not act as a peer/,
  );
  assert.equal(await readFile(registryPath, 'utf8'), before);
});

test('concurrent replacement and peer creation remain serialized', async () => {
  const session = await prepared();
  const predecessor = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'old',
    'done',
    ['step'],
  );
  const [replacement, created] = await Promise.all([
    replaceSubagent(
      session.orchestrationId,
      session.capabilityToken,
      predecessor.peerId,
      'tester',
      'new',
      'done',
      ['step'],
      'resume safely',
    ),
    createSubagent(session.orchestrationId, session.capabilityToken, 'reviewer', 'other', 'done', [
      'step',
    ]),
  ]);
  assert.notEqual(replacement.peerId, created.peerId);
  const registry = JSON.parse(
    await readFile(join(root, session.orchestrationId, 'session.json'), 'utf8'),
  );
  assert.deepEqual(
    registry.peers.map(({ id }) => id),
    [predecessor.peerId, replacement.peerId, created.peerId],
  );
});

test('append enforces closed items, ordered completion, and prior reasoning', async () => {
  const session = await prepared(['one', 'two']);
  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'done', 'without reasoning'),
    /prior reasoning/,
  );
  await appendEntry(session.path, 1, 'orchestrator', 'think', 'reason');
  await assert.rejects(
    () => appendEntry(session.path, 2, 'orchestrator', 'done', 'out of order'),
    /out of order/,
  );
  await appendEntry(session.path, 1, 'orchestrator', 'done', 'closed');
  await assert.rejects(
    () => appendEntry(session.path, 1, 'orchestrator', 'note', 'too late'),
    /already closed/,
  );
});

test('rejects plan entries because plan items are creation-time only', async () => {
  const session = await prepared();
  await assert.rejects(
    () => appendEntry(session.path, 2, 'orchestrator', 'plan', 'untracked plan item'),
    /plan entries are only allowed during session or subagent creation/,
  );
  assert.doesNotMatch(await readFile(session.path, 'utf8'), /untracked plan item/);
});

test('rejects every non-plan entry for an orphan item', async () => {
  const session = await prepared();
  for (const tag of ['note', 'think', 'find', 'decide', 'question', 'answer', 'done']) {
    await assert.rejects(
      () =>
        appendEntry(
          session.path,
          2,
          'orchestrator',
          tag,
          tag === 'find' ? 'orphan src: test' : 'orphan',
        ),
      /unknown plan item: 2/,
    );
  }
  await assert.rejects(
    () =>
      closeWorklog(
        session.orchestrationId,
        session.capabilityToken,
        undefined,
        2,
        'orchestrator',
        'orphan close',
      ),
    /unknown plan item: 2/,
  );
  assert.doesNotMatch(await readFile(session.path, 'utf8'), /orphan/);
});

test('close cannot succeed before a concurrent question append', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'think', 'reason');
  const question = appendEntry(
    session.path,
    1,
    'orchestrator',
    'question',
    '[question:q1 source=main target=peer] ask',
  );
  const closing = closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  await question;
  const result = await closing;
  assert.equal(result.closed, false);
  assert.deepEqual(result.completion.openQuestions, ['q1']);
  assert.doesNotMatch(await readFile(session.path, 'utf8'), / orchestrator done complete\\n/);
});

test('close returns false for incomplete plans and unanswered linked questions', async () => {
  const session = await prepared(['one', 'two']);
  await appendEntry(session.path, 1, 'orchestrator', 'think', 'reason');
  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'not final',
  );
  assert.equal(result.closed, false);
  assert.deepEqual(result.completion.openItems, [2]);

  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['answer'],
  );
  const registry = JSON.parse(
    await readFile(join(root, session.orchestrationId, 'session.json'), 'utf8'),
  );
  const questionId = 'deadbeef';
  registry.questions[questionId] = {
    sourcePeerId: null,
    targetPeerId: peer.peerId,
    answered: false,
  };
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(join(root, session.orchestrationId, 'session.json'), JSON.stringify(registry)),
  );
  const status = await sessionCompletion(
    session.orchestrationId,
    undefined,
    await readFile(session.path, 'utf8'),
  );
  assert.equal(status.complete, false);
  assert.deepEqual(status.openQuestions, [questionId]);
});

test('main completion observes answers recorded in peer logs through the registry', async () => {
  const session = await prepared();
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['answer'],
  );
  const registryPath = join(root, session.orchestrationId, 'session.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  registry.questions.deadbeef = { sourcePeerId: null, targetPeerId: peer.peerId, answered: true };
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(registryPath, JSON.stringify(registry)),
  );
  const status = await sessionCompletion(
    session.orchestrationId,
    undefined,
    await readFile(pathFor(session.orchestrationId), 'utf8'),
  );
  assert.deepEqual(status.openQuestions, []);
});

test('rejects empty close messages before writing a done entry', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  await assert.rejects(
    () =>
      closeWorklog(
        session.orchestrationId,
        session.capabilityToken,
        undefined,
        1,
        'orchestrator',
        '  \t',
      ),
    /message must not be empty/,
  );
  assert.doesNotMatch(await readFile(session.path, 'utf8'), / orchestrator done /);
});

test('close succeeds after the final item has prior reasoning and no open questions', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  assert.equal(result.closed, true);
  assert.equal(result.completion.complete, true);
});

test('rejects newline injection in plan steps, entries, and close messages', async () => {
  await assert.rejects(
    () => prepared(['safe\n  2. unplanned']),
    /plan step must not contain carriage returns or newlines/,
  );

  const session = await prepared();
  await assert.rejects(
    () =>
      appendEntry(
        session.path,
        1,
        'orchestrator',
        'think',
        'reason\n00:00:00 #1 orchestrator think fake reasoning',
      ),
    /message must not contain carriage returns or newlines/,
  );
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  await assert.rejects(
    () =>
      closeWorklog(
        session.orchestrationId,
        session.capabilityToken,
        undefined,
        1,
        'orchestrator',
        'complete\n00:00:00 #1 orchestrator done forged close',
      ),
    /message must not contain carriage returns or newlines/,
  );

  const content = await readFile(session.path, 'utf8');
  assert.doesNotMatch(content, /unplanned|fake reasoning|forged close/);
});

test('authorized repeated main close is successful and persists only one done entry', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');

  const first = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  const second = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete again',
  );

  assert.equal(first.closed, true);
  assert.equal(second.closed, true);
  assert.equal((await readFile(session.path, 'utf8')).match(/ orchestrator done /g).length, 1);
});

test('authorized repeated peer close is successful and persists only one done entry', async () => {
  const session = await prepared();
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['step'],
  );
  await appendEntry(peer.path, 1, 'executor', 'decide', 'ready');

  const first = await closeWorklog(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    1,
    'executor',
    'complete',
  );
  const second = await closeWorklog(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    1,
    'executor',
    'complete again',
  );

  assert.equal(first.closed, true);
  assert.equal(second.closed, true);
  assert.equal((await readFile(peer.path, 'utf8')).match(/ executor done /g).length, 1);
});

test('an incomplete registered predecessor retained after replacement blocks main completion', async () => {
  const session = await prepared();
  const predecessor = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'old peer',
    'done',
    ['step'],
  );
  await replaceSubagent(
    session.orchestrationId,
    session.capabilityToken,
    predecessor.peerId,
    'tester',
    'replacement peer',
    'done',
    ['step'],
    'resume safely',
  );
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const before = await readFile(session.path, 'utf8');

  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );

  assert.equal(result.closed, false);
  assert.equal(await readFile(session.path, 'utf8'), before);
});

test('main close succeeds after every registered peer closes', async () => {
  const session = await prepared();
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'executor',
    'peer',
    'done',
    ['step'],
  );
  await appendEntry(peer.path, 1, 'executor', 'decide', 'ready');
  const peerResult = await closeWorklog(
    session.orchestrationId,
    peer.capabilityToken,
    peer.peerId,
    1,
    'executor',
    'complete',
  );
  assert.equal(peerResult.closed, true);

  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  assert.equal(result.closed, true);
});

test('zero-peer session remains valid for main close', async () => {
  const session = await prepared();
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  assert.equal(result.closed, true);
});

test('incomplete main close is non-mutating while a peer remains open', async () => {
  const session = await prepared();
  const peer = await createSubagent(
    session.orchestrationId,
    session.capabilityToken,
    'reviewer',
    'peer',
    'done',
    ['step'],
  );
  await appendEntry(session.path, 1, 'orchestrator', 'decide', 'ready');
  const before = await readFile(session.path, 'utf8');

  const result = await closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'blocked',
  );

  assert.equal(result.closed, false);
  assert.equal(await readFile(session.path, 'utf8'), before);
  assert.doesNotMatch(await readFile(peer.path, 'utf8'), / reviewer done /);
});
