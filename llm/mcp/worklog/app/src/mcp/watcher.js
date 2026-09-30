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
let snapshot = '';

async function fingerprint() {
  let names = [];
  try {
    names = await readdir(root, { withFileTypes: true });
  } catch {
    return '';
  }
  const values = [];
  for (const entry of names) {
    if (!entry.isDirectory() || !/^[a-f0-9]{8}$/.test(entry.name)) continue;
    try {
      const info = await stat(`${root}/${entry.name}`);
      values.push(`${entry.name}:${info.mtimeMs}:${info.size}`);
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
  if (snapshot && next !== snapshot) notify();
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
  snapshot = '';
  revision = 0;
}
