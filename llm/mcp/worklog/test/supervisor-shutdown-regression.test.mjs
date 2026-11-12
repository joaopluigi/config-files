import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const supervisorEntrypoint = join(packageRoot, 'supervisor.mjs');

function waitForExit(child, stderr, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error(`supervisor did not exit within ${timeoutMs}ms; stderr=${stderr}`));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('child failure exits the supervisor with stdin still open after child cleanup', async () => {
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-shutdown-regression-'));
  const child = spawn(process.execPath, [supervisorEntrypoint], {
    cwd: packageRoot,
    env: {
      ...process.env,
      WORKLOG_DIR: worklogDir,
      WORKLOG_HTTP_HOST: '127.0.0.1',
      WORKLOG_HTTP_PORT: 'not-a-port',
      WORKLOG_MCP_TOKEN: 'supervisor-shutdown-regression-token',
    },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    const exit = await waitForExit(child, stderr);
    assert.equal(exit.signal, null, `supervisor was terminated by ${exit.signal}`);
    assert.equal(exit.code, 1, `supervisor did not report child failure; stderr=${stderr}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await waitForExit(child, stderr).catch(() => {});
    await rm(worklogDir, { recursive: true, force: true });
  }
});
