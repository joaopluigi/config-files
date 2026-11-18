import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const worklogDir = await mkdtemp(join(tmpdir(), 'worklog-timing-'));
process.env.WORKLOG_DIR = worklogDir;
const repository = await import('../src/storage/repository.mjs');

const create = (steps = ['step']) =>
  repository.createSession('orchestrator', 'goal', 'done', steps);

test('create exposes server-owned timing metadata without starting activity', async () => {
  const session = await create();
  assert.match(session.timing.created_at, /^\d{4}-/);
  assert.equal(session.timing.started_at, undefined);
  assert.equal(session.timing.last_activity_at, undefined);
  assert.equal(session.timing.closed_at, undefined);
  assert.ok(session.timing.elapsed_ms >= 0);
});

test('successful append updates activity monotonically and reads do not', async () => {
  const session = await create();
  const path = repository.mainPath(session.orchestrationId);
  const before = await repository.readRegistry(session.orchestrationId);
  await repository.appendEntries(path, 'orchestrator', [
    { item: 1, tag: 'progress', message: 'progress' },
  ]);
  const afterAppend = await repository.recordActivity(session.orchestrationId);
  const afterRead = await repository.readRegistry(session.orchestrationId);
  assert.equal(afterAppend.started_at, afterAppend.last_activity_at);
  assert.ok(Date.parse(afterAppend.last_activity_at) >= Date.parse(before.timing.created_at));
  assert.deepEqual(afterRead.timing, {
    created_at: afterAppend.created_at,
    started_at: afterAppend.started_at,
    last_activity_at: afterAppend.last_activity_at,
  });
  assert.equal(repository.timingMetadata(afterRead).last_activity_at, afterAppend.last_activity_at);
});

test('failed validation and incomplete close do not update activity or log content', async () => {
  const session = await create(['first', 'second']);
  const path = repository.mainPath(session.orchestrationId);
  await repository.appendEntries(path, 'orchestrator', [
    { item: 1, tag: 'think', message: 'reason' },
  ]);
  await repository.recordActivity(session.orchestrationId);
  const beforeContent = await readFile(path, 'utf8');
  const before = await repository.readRegistry(session.orchestrationId);
  await assert.rejects(
    repository.appendEntries(path, 'orchestrator', [
      { item: 99, tag: 'progress', message: 'invalid' },
    ]),
  );
  const failed = await repository.readRegistry(session.orchestrationId);
  assert.deepEqual(failed.timing, before.timing);
  assert.equal(await readFile(path, 'utf8'), beforeContent);
  const incomplete = await repository.closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'not complete',
  );
  assert.equal(incomplete.closed, false);
  const afterClose = await repository.readRegistry(session.orchestrationId);
  assert.deepEqual(afterClose.timing, before.timing);
  assert.equal(await readFile(path, 'utf8'), beforeContent);
});

test('continuation completion updates predecessor activity timing', async () => {
  const predecessor = await create();
  await repository.appendEntries(repository.mainPath(predecessor.orchestrationId), 'orchestrator', [
    { item: 1, tag: 'progress', message: 'incomplete' },
  ]);
  const before = await repository.readRegistry(predecessor.orchestrationId);
  assert.equal(before.timing.last_activity_at, undefined);

  await repository.createSession(
    'orchestrator',
    'continued goal',
    'continued done',
    ['continued step'],
    predecessor.orchestrationId,
    'continuing incomplete work',
  );

  const after = await repository.readRegistry(predecessor.orchestrationId);
  assert.ok(after.timing.started_at);
  assert.ok(after.timing.last_activity_at);
  assert.ok(Date.parse(after.timing.last_activity_at) >= Date.parse(after.timing.created_at));
  assert.match(
    await readFile(repository.mainPath(predecessor.orchestrationId), 'utf8'),
    /#1 orchestrator done continuing incomplete work/,
  );
});

test('successful close records closed activity and elapsed time', async () => {
  const session = await create();
  const path = repository.mainPath(session.orchestrationId);
  await repository.appendEntries(path, 'orchestrator', [
    { item: 1, tag: 'think', message: 'reason' },
  ]);
  await repository.recordActivity(session.orchestrationId);
  const result = await repository.closeWorklog(
    session.orchestrationId,
    session.capabilityToken,
    undefined,
    1,
    'orchestrator',
    'complete',
  );
  assert.equal(result.closed, true);
  assert.ok(result.timing.closed_at);
  assert.equal(result.timing.idle_ms, undefined);
  assert.ok(result.timing.elapsed_ms >= 0);
});
