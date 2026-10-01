import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntries } from '../src/storage/repository.mjs';

test('appendEntries preserves input order and validates against progressive content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-batch-'));
  const path = join(dir, 'log.txt');
  await writeFile(path, 'plan\n  1. first\n  2. second\n\n');

  const result = await appendEntries(path, 'executor', [
    { item: 1, tag: 'progress', message: 'first' },
    { item: 2, tag: 'progress', message: 'second' },
  ]);

  assert.equal(result.length, 2);
  assert.match(result[0], /#1 executor progress first$/);
  assert.match(result[1], /#2 executor progress second$/);
  assert.match(
    await readFile(path, 'utf8'),
    /\n\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z #1 executor progress first\n\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z #2 executor progress second\n$/,
  );
});

test('appendEntries rejects a later invalid entry without changing the file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-batch-'));
  const path = join(dir, 'log.txt');
  const before = 'plan\n  1. first\n\n';
  await writeFile(path, before);

  await assert.rejects(
    appendEntries(path, 'executor', [
      { item: 1, tag: 'progress', message: 'valid first' },
      { item: 99, tag: 'progress', message: 'invalid second' },
    ]),
    /unknown plan item: 99/,
  );
  assert.equal(await readFile(path, 'utf8'), before);
});

test('appendEntries requires one shared actor and a non-empty batch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-batch-'));
  const path = join(dir, 'log.txt');
  await writeFile(path, 'plan\n  1. first\n\n');

  await assert.rejects(appendEntries(path, 'executor', []), /entries must not be empty/);
  await assert.rejects(
    appendEntries(path, 'not-an-actor', [{ item: 1, tag: 'progress', message: 'x' }]),
    /invalid actor/,
  );
});
