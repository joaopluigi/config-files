/* global clearTimeout, process, setTimeout */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const worklogRoot = await mkdtemp(join(tmpdir(), 'worklog-watcher-'));
process.env.WORKLOG_DIR = worklogRoot;

const { currentRevision, disposeWorklogWatcher, subscribeRevision } = await import('./watcher.js');

const sessionId = 'a1b2c3d4';
const sessionDir = join(worklogRoot, sessionId);
const registryPath = join(sessionDir, 'session.json');
const mainPath = join(sessionDir, `${sessionId}-main.txt`);
const peerPath = join(sessionDir, `${sessionId}-subagent-deadbeef.txt`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSession() {
  await mkdir(sessionDir, { recursive: true });
  await writeFile(registryPath, '{"revision":1}');
  await writeFile(mainPath, 'main revision 1\n');
  await writeFile(peerPath, 'peer revision 1\n');
}

async function settle() {
  currentRevision();
  await sleep(120);
  return currentRevision();
}

async function waitForRevisionAfter(previous) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`revision did not advance beyond ${previous}`));
    }, 2800);
    const unsubscribe = subscribeRevision((revision) => {
      if (revision > previous) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(revision);
      }
    });
  });
}

describe('worklog watcher reconciliation', () => {
  beforeAll(async () => {
    await rm(worklogRoot, { recursive: true, force: true });
    await mkdir(worklogRoot, { recursive: true });
  });

  beforeEach(async () => {
    disposeWorklogWatcher();
    await rm(sessionDir, { recursive: true, force: true });
    await createSession();
    await settle();
  });

  afterAll(async () => {
    disposeWorklogWatcher();
    await rm(worklogRoot, { recursive: true, force: true });
  });

  test('modifying an existing session.json triggers a newer revision', async () => {
    const before = currentRevision();
    const nextRevision = waitForRevisionAfter(before);
    await writeFile(registryPath, '{"revision":2}');
    expect(await nextRevision).toBeGreaterThan(before);
    expect(JSON.parse(await readFile(registryPath, 'utf8')).revision).toBe(2);
  });

  test('modifying an existing main log triggers a newer revision', async () => {
    const before = currentRevision();
    const nextRevision = waitForRevisionAfter(before);
    await writeFile(mainPath, 'main revision 2\n');
    expect(await nextRevision).toBeGreaterThan(before);
    expect(await readFile(mainPath, 'utf8')).toContain('revision 2');
  });

  test('modifying an existing peer log triggers a newer revision', async () => {
    const before = currentRevision();
    const nextRevision = waitForRevisionAfter(before);
    await writeFile(peerPath, 'peer revision 2\n');
    expect(await nextRevision).toBeGreaterThan(before);
    expect(await readFile(peerPath, 'utf8')).toContain('revision 2');
  });

  test('transient lock artifacts do not trigger a newer revision', async () => {
    const before = currentRevision();
    await mkdir(join(sessionDir, `${sessionId}-main.txt.lock`));
    await writeFile(join(sessionDir, `${sessionId}-main.txt.lock`, 'owner'), 'tester');
    await sleep(260);
    expect(currentRevision()).toBe(before);
  });

  test('uppercase session IDs do not trigger a newer revision', async () => {
    const before = currentRevision();
    const uppercaseSessionId = sessionId.toUpperCase();
    const uppercaseSessionDir = join(worklogRoot, uppercaseSessionId);
    await mkdir(uppercaseSessionDir, { recursive: true });
    const uppercaseMainPath = join(
      uppercaseSessionDir,
      `${uppercaseSessionId}-subagent-unique.txt`,
    );
    await writeFile(uppercaseMainPath, 'uppercase revision 1\\n');
    await writeFile(uppercaseMainPath, 'uppercase revision 2\\n');
    await sleep(260);
    expect(currentRevision()).toBe(before);
  });

  test('unchanged reconciliation emits no new revision', async () => {
    const before = currentRevision();
    await sleep(260);
    expect(currentRevision()).toBe(before);
  });

  test('session creation and deletion still trigger newer revisions', async () => {
    const beforeDeletion = currentRevision();
    const afterDeletion = waitForRevisionAfter(beforeDeletion);
    await rm(sessionDir, { recursive: true, force: true });
    const afterDeleteRevision = await afterDeletion;
    expect(afterDeleteRevision).toBeGreaterThan(beforeDeletion);

    const afterCreation = waitForRevisionAfter(afterDeleteRevision);
    await createSession();
    expect(await afterCreation).toBeGreaterThan(afterDeleteRevision);
  });
});
