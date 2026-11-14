import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const supervisorEntrypoint = join(packageRoot, 'supervisor.mjs');

function waitForMessage(child, id, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for MCP response ${id}; output was: ${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      const lines = output.split('\n');
      output = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id !== id) continue;
        cleanup();
        resolve(message);
        return;
      }
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(
        new Error(`supervisor exited before MCP response ${id}: code=${code} signal=${signal}`),
      );
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function waitForExit(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => reject(new Error('supervisor did not exit')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('supervisor records the temporary caller cwd for a real stdio MCP session', async () => {
  const callerCwd = await mkdtemp(join(tmpdir(), 'supervisor-caller-'));
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-worklog-'));
  const expectedCwd = await realpath(callerCwd);
  const child = spawn(process.execPath, [supervisorEntrypoint], {
    cwd: callerCwd,
    env: {
      ...process.env,
      WORKLOG_DIR: worklogDir,
      WORKLOG_MCP_TOKEN: 'supervisor-caller-cwd-test-token',
      WORKLOG_HTTP_PORT: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'supervisor-caller-cwd-test', version: '1.0.0' },
        },
      })}\n`,
    );
    const initialize = await waitForMessage(child, 1);
    assert.equal(initialize.result.serverInfo.name, 'delegation-worklog', 'runtime still starts');

    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'worklog_session_create',
          arguments: {
            actor: 'orchestrator',
            goal: 'caller cwd regression',
            done: 'session created',
            steps: ['create a session'],
          },
        },
      })}\n`,
    );
    const created = await waitForMessage(child, 2);
    const session = JSON.parse(created.result.content[0].text);
    const header = await readFile(
      join(worklogDir, session.orchestrationId, `${session.orchestrationId}-main.txt`),
      'utf8',
    );
    assert.match(
      header,
      new RegExp(
        `^working directory: ${expectedCwd.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`,
        'm',
      ),
      'session header records caller cwd',
    );

    child.stdin.end();
    const exit = await waitForExit(child);
    assert.equal(exit.code, 0, `clean shutdown: ${JSON.stringify(exit)}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await waitForExit(child).catch(() => {});
    await Promise.all([
      rm(callerCwd, { recursive: true, force: true }),
      rm(worklogDir, { recursive: true, force: true }),
    ]);
  }
});
