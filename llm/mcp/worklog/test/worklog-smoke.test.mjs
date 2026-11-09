import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const server = fileURLToPath(new URL('../server.mjs', import.meta.url));

function waitForStderr(child, getStderr, pattern, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timer;
    const finish = (callback, value) => {
      clearTimeout(timer);
      child.off('exit', onExit);
      callback(value);
    };
    const check = () => {
      const stderr = getStderr();
      if (pattern.test(stderr)) {
        finish(resolve);
      } else if (child.exitCode !== null) {
        finish(reject, new Error(`server exited before readiness: ${stderr}`));
      } else if (Date.now() - startedAt >= timeoutMs) {
        finish(reject, new Error(`timed out waiting for stderr readiness: ${stderr}`));
      } else {
        timer = setTimeout(check, 25);
      }
    };
    const onExit = () => check();
    child.once('exit', onExit);
    check();
  });
}

test('server starts without writing protocol data to stderr/stdout until input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const child = spawn(process.execPath, [server], { env: { ...process.env, WORKLOG_DIR: dir } });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  await waitForStderr(child, () => stderr, /running on stdio/);
  child.kill('SIGTERM');
  assert.match(stderr, /running on stdio/);
  assert.equal(
    (await readFile(join(dir, '..', 'missing'), { encoding: 'utf8' }).catch(() => '')).length,
    0,
  );
});
