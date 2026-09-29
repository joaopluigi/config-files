import { mkdir, readFile, writeFile, rm, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const queues = new Map();
const staleLockMs = Number(process.env.WORKLOG_LOCK_STALE_MS || 30_000);
const lockWaitMs = Number(process.env.WORKLOG_LOCK_WAIT_MS || 10_000);
const token = () => randomBytes(32).toString('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lockPath = (path) => `${path}.lock`;
async function lockOwner(path) {
  try {
    return (await readFile(join(lockPath(path), 'owner'), 'utf8')).trim();
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw e;
  }
}

export async function withLock(key, fn) {
  const hadLocalQueue = queues.has(key);
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  queues.set(key, queued);
  await previous;
  const lock = lockPath(key);
  const owner = token();
  const started = Date.now();
  let acquired = false;
  try {
    for (;;) {
      try {
        await mkdir(lock);
        await writeFile(join(lock, 'owner'), owner, { flag: 'wx' });
        acquired = true;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let stale = false;
        try {
          stale = Date.now() - (await stat(lock)).mtimeMs > staleLockMs;
        } catch (statError) {
          if (statError.code !== 'ENOENT') throw statError;
        }
        if (stale && !hadLocalQueue) {
          const replacement = `${lock}.stale-${token()}`;
          try {
            await rename(lock, replacement);
            await rm(replacement, { recursive: true, force: true });
          } catch (renameError) {
            if (!['ENOENT', 'EEXIST'].includes(renameError.code)) throw renameError;
          }
          continue;
        }
        if (Date.now() - started >= lockWaitMs)
          throw new Error(`timed out waiting for lock: ${key}`);
        await sleep(10);
      }
    }
    return await fn();
  } finally {
    if (acquired && (await lockOwner(key)) === owner)
      await rm(lock, { recursive: true, force: true });
    release();
    if (queues.get(key) === queued) queues.delete(key);
  }
}
