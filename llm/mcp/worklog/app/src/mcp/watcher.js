import { watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { root } from '../../../src/storage/repository.mjs';

const debounceMs = 75;
const reconcileMs = 2000;
let revision = 0;
let watcher;
let reconcileTimer;
let debounceTimer;
let listeners = new Set();
let snapshot;

const sessionDirectoryPattern = /^[a-f0-9]{8}$/;
const sessionFilePattern = /^[a-f0-9]{8}-(?:main|subagent-[^/]+)\.txt$/;

async function fingerprint() {
  const values = [];
  let sessions;
  try {
    sessions = await readdir(root, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const session of sessions) {
    if (!session.isDirectory() || !sessionDirectoryPattern.test(session.name)) continue;
    const sessionPath = `${root}/${session.name}`;
    try {
      await stat(sessionPath);
      values.push(`${session.name}:d`);
      const entries = await readdir(sessionPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() ||
          (entry.name !== 'session.json' && !sessionFilePattern.test(entry.name))
        )
          continue;
        const path = `${sessionPath}/${entry.name}`;
        try {
          const info = await stat(path);
          values.push(
            `${session.name}/${entry.name}:f:${info.mtimeMs}:${info.ctimeMs}:${info.size}`,
          );
        } catch {
          // A concurrent file creation/removal is reconciled on the next pass.
        }
      }
    } catch {
      // A concurrent session creation/removal is reconciled on the next pass.
    }
  }
  return values.sort().join('|');
}
function notify() {
  revision += 1;
  for (const listener of listeners) listener(revision);
}
async function reconcile() {
  const next = await fingerprint();
  if (snapshot !== undefined && next !== snapshot) notify();
  snapshot = next;
}
function schedule() {
  globalThis.clearTimeout(debounceTimer);
  debounceTimer = globalThis.setTimeout(() => reconcile().catch(() => {}), debounceMs);
  debounceTimer.unref?.();
}
export function startWorklogWatcher() {
  if (watcher) return;
  watcher = watch(root, { recursive: true }, schedule);
  watcher.on('error', () => {});
  reconcile().catch(() => {});
  reconcileTimer = globalThis.setInterval(() => reconcile().catch(() => {}), reconcileMs);
  reconcileTimer.unref?.();
}
export function currentRevision() {
  startWorklogWatcher();
  return revision;
}
export function subscribeRevision(listener) {
  startWorklogWatcher();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function disposeWorklogWatcher() {
  watcher?.close();
  watcher = undefined;
  globalThis.clearInterval(reconcileTimer);
  globalThis.clearTimeout(debounceTimer);
  reconcileTimer = undefined;
  debounceTimer = undefined;
  listeners.clear();
  snapshot = undefined;
  revision = 0;
}
