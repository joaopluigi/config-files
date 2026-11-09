import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJsonPath = join(packageRoot, 'package.json');
const readmePath = join(packageRoot, 'README.md');
const serverEntrypoint = join(packageRoot, 'server.mjs');
const launcherCommand = 'npm run start:http';
const token = 'browser-launcher-test-token';

function waitForStream(stream, child, pattern, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${pattern}; output was: ${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(pattern);
      if (!match) return;
      cleanup();
      resolve({ match, output });
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(
        new Error(
          `child exited before emitting ${pattern}: code=${code} signal=${signal}; output was: ${output}`,
        ),
      );
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    stream.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function waitForExit(child, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('launcher did not exit')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function initializeRequest() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'browser-launcher-contract-test', version: '1.0.0' },
    },
  };
}

test('the documented browser launcher contract names one command and its endpoint/token variables', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const readme = await readFile(readmePath, 'utf8');

  assert.equal(packageJson.scripts?.['start:http'], launcherCommand.slice('npm run '.length));
  assert.match(readme, /npm run start:http/);
  assert.match(readme, /always binds to loopback at `127\.0\.0\.1`/);
  assert.doesNotMatch(readme, /WORKLOG_HTTP_HOST/);
  assert.match(readme, /WORKLOG_HTTP_PORT/);
  assert.match(readme, /WORKLOG_MCP_TOKEN/);
  assert.match(readme, /\/mcp/);
});

test('the launcher emits a usable localhost MCP endpoint and token, then accepts initialize', async () => {
  const worklogDir = await mkdtemp(join(tmpdir(), 'browser-launcher-worklog-'));
  const child = spawn('npm', ['run', 'start:http'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      WORKLOG_DIR: worklogDir,
      WORKLOG_HTTP_HOST: '127.0.0.1',
      WORKLOG_HTTP_PORT: '0',
      WORKLOG_MCP_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const { match, output } = await waitForStream(
      child.stderr,
      child,
      /WORKLOG_MCP_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+\/mcp)[^\n]*WORKLOG_MCP_TOKEN=([^\s\n]+)/,
    );
    const endpoint = match[1];
    const emittedToken = match[2];
    assert.equal(emittedToken, token, output);

    const response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${emittedToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(initializeRequest()),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, 1);
    assert.equal(body.result.serverInfo.name, 'delegation-worklog');
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => child.kill('SIGKILL'));
    await rm(worklogDir, { recursive: true, force: true });
  }
});

test('terminating the launcher is clean and the existing stdio entrypoint still initializes', async () => {
  const worklogDir = await mkdtemp(join(tmpdir(), 'browser-launcher-shutdown-'));
  const launcher = spawn('npm', ['run', 'start:http'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      WORKLOG_DIR: worklogDir,
      WORKLOG_HTTP_HOST: '127.0.0.1',
      WORKLOG_HTTP_PORT: '0',
      WORKLOG_MCP_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdio = spawn(process.execPath, [serverEntrypoint], {
    env: { ...process.env, WORKLOG_DIR: worklogDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    await waitForStream(launcher.stderr, launcher, /WORKLOG_MCP_ENDPOINT=/);
    launcher.kill('SIGTERM');
    const launcherExit = await waitForExit(launcher);
    assert.deepEqual(launcherExit, { code: 0, signal: null });

    const diagnosticPromise = waitForStream(
      stdio.stderr,
      stdio,
      /delegation-worklog MCP server running on stdio/,
    );
    const responsePromise = waitForStream(stdio.stdout, stdio, /\n/).then(({ output }) =>
      JSON.parse(output.trim()),
    );
    stdio.stdin.end(`${JSON.stringify(initializeRequest())}\n`);
    const [diagnostic, response] = await Promise.all([diagnosticPromise, responsePromise]);
    assert.match(diagnostic.output, /delegation-worklog MCP server running on stdio/);
    assert.equal(response.id, 1);
    assert.equal(response.result.serverInfo.name, 'delegation-worklog');
  } finally {
    if (!launcher.killed) launcher.kill('SIGKILL');
    if (!stdio.killed) stdio.kill('SIGTERM');
    await Promise.all([waitForExit(launcher).catch(() => {}), waitForExit(stdio).catch(() => {})]);
    await rm(worklogDir, { recursive: true, force: true });
  }
});
