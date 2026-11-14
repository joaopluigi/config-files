import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const configPath = fileURLToPath(new URL('../../../../llm/eca/professional.json', import.meta.url));
const serverEntrypoint = join(packageRoot, 'server.mjs');
const expectedSupervisorEntrypoint = join(packageRoot, 'supervisor.mjs');
const token = 'supervisor-contract-test-token';

function waitForPattern(stream, child, pattern, timeoutMs = 10_000) {
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
          `child exited before ${pattern}: code=${code} signal=${signal}; output=${output}`,
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

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => reject(new Error('child did not exit')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function initializeRequest(id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'supervisor-contract-test', version: '1.0.0' },
    },
  };
}

function spawnSupervisor(worklogDir, extraEnv = {}, stdio = ['ignore', 'pipe', 'pipe']) {
  const child = spawn(process.execPath, [expectedSupervisorEntrypoint], {
    cwd: packageRoot,
    env: {
      ...process.env,
      WORKLOG_DIR: worklogDir,
      WORKLOG_HTTP_HOST: '127.0.0.1',
      WORKLOG_HTTP_PORT: '0',
      WORKLOG_VITE_HOST: '127.0.0.1',
      WORKLOG_MCP_TOKEN: token,
      ...extraEnv,
    },
    stdio,
  });
  return child;
}

function listenOnPreferredPort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(null);
        return;
      }
      reject(error);
    });
    server.listen(5173, '127.0.0.1', () => resolve(server));
  });
}

async function assertSupervisorExists() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const configured = config.mcpServers?.worklog;
  assert.ok(configured, 'professional.json must configure the worklog MCP server');
  assert.equal(
    configured.command,
    'node',
    'professional.json must point at the supervisor with node',
  );
  assert.ok(
    configured.args?.some((arg) => arg.endsWith('/supervisor.mjs')),
    'professional.json must point to a supervisor.mjs entrypoint',
  );
}

test('professional config points to a supervisor whose stdio child emits clean MCP JSON stdout', async () => {
  await assertSupervisorExists();
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-stdio-'));
  const child = spawnSupervisor(worklogDir, {}, ['pipe', 'pipe', 'pipe']);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    const responseLine = waitForPattern(child.stdout, child, /\n/);
    child.stdin.write(`${JSON.stringify(initializeRequest())}\n`);
    await responseLine;
    const firstLine = stdout.slice(0, stdout.indexOf('\n')).trim();
    const response = JSON.parse(firstLine);
    assert.equal(response.id, 1);
    assert.equal(response.result.serverInfo.name, 'delegation-worklog');
    assert.doesNotMatch(firstLine, /WORKLOG_|vite|MCP server running/);
    assert.match(stderr, /WORKLOG_|supervisor|MCP server running/i);
  } catch (error) {
    if (error.code === 'ENOENT' || /supervisor\.mjs/.test(error.message)) {
      assert.fail(`supervisor implementation is absent: ${error.message}`);
    }
    throw error;
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => child.kill('SIGKILL'));
    await rm(worklogDir, { recursive: true, force: true });
  }
});

test('supervisor exposes HTTP MCP and Vite proxy readiness using one token and worklog directory', async (t) => {
  const preferred = await listenOnPreferredPort();
  if (!preferred) {
    t.skip('127.0.0.1:5173 is already owned by an unrelated process');
    return;
  }
  await new Promise((resolve, reject) =>
    preferred.close((error) => (error ? reject(error) : resolve())),
  );
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-browser-'));
  const child = spawnSupervisor(worklogDir);
  try {
    let readiness;
    try {
      readiness = await waitForPattern(
        child.stderr,
        child,
        /WORKLOG_MCP_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+\/mcp).*WORKLOG_MCP_TOKEN=([^\s\n]+).*WORKLOG_VITE_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+)/,
      );
    } catch (error) {
      assert.fail(`supervisor did not emit HTTP and Vite readiness: ${error.message}`);
    }
    const endpoint = readiness.match[1];
    const emittedToken = readiness.match[2];
    const viteEndpoint = readiness.match[3];
    assert.equal(emittedToken, token, readiness.output);

    const response = await globalThis.fetch(`${viteEndpoint}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${emittedToken}`,
        'content-type': 'application/json',
        origin: viteEndpoint,
      },
      body: JSON.stringify(initializeRequest(2)),
    });
    assert.equal(
      response.status,
      200,
      `browser-origin /mcp proxy failed; direct endpoint was ${endpoint}`,
    );
    const body = await response.json();
    assert.equal(body.id, 2);
    assert.equal(body.result.serverInfo.name, 'delegation-worklog');
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => child.kill('SIGKILL'));
    await rm(worklogDir, { recursive: true, force: true });
  }
});

test('preferred Vite port remains 5173 when it is free', async (t) => {
  const preferred = await listenOnPreferredPort();
  if (!preferred) {
    t.skip('127.0.0.1:5173 is already owned by an unrelated process');
    return;
  }
  await new Promise((resolve, reject) =>
    preferred.close((error) => (error ? reject(error) : resolve())),
  );

  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-preferred-'));
  const child = spawnSupervisor(worklogDir, { WORKLOG_MCP_TOKEN: 'preferred-port-token' });
  try {
    const readiness = await waitForPattern(
      child.stderr,
      child,
      /WORKLOG_MCP_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+\/mcp).*WORKLOG_VITE_ENDPOINT=(http:\/\/127\.0\.0\.1:5173)/,
    );
    assert.equal(readiness.match[2], 'http://127.0.0.1:5173');
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => child.kill('SIGKILL'));
    await rm(worklogDir, { recursive: true, force: true });
  }
});

test('occupied preferred Vite port leaves HTTP and stdio usable without an alternate endpoint', async (t) => {
  const preferred = await listenOnPreferredPort();
  if (!preferred) {
    t.skip('127.0.0.1:5173 is already owned by an unrelated process');
    return;
  }
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-occupied-'));
  const child = spawnSupervisor(worklogDir, { WORKLOG_MCP_TOKEN: 'occupied-port-token' }, [
    'pipe',
    'pipe',
    'pipe',
  ]);
  try {
    const readiness = await waitForPattern(
      child.stderr,
      child,
      /frontend unavailable: Vite could not start on 127\.0\.0\.1:5173[\s\S]*WORKLOG_MCP_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+\/mcp) WORKLOG_MCP_TOKEN=([^\s\n]+)/,
    );
    const endpoint = readiness.match[1];
    const emittedToken = readiness.match[2];
    assert.doesNotMatch(readiness.output, /WORKLOG_VITE_ENDPOINT=/);
    assert.equal(preferred.listening, true);

    const httpResponse = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${emittedToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(initializeRequest(2)),
    });
    assert.equal(httpResponse.status, 200);
    const httpBody = await httpResponse.json();
    assert.equal(httpBody.result.serverInfo.name, 'delegation-worklog');

    const stdioResponse = waitForPattern(child.stdout, child, /\n/);
    child.stdin.write(`${JSON.stringify(initializeRequest(3))}\n`);
    const stdioBody = JSON.parse((await stdioResponse).output.trim());
    assert.equal(stdioBody.result.serverInfo.name, 'delegation-worklog');
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => child.kill('SIGKILL'));
    assert.equal(preferred.listening, true);
    await new Promise((resolve, reject) =>
      preferred.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(worklogDir, { recursive: true, force: true });
  }
});

test('EOF and SIGTERM shut down supervisor children while direct server.mjs stdio remains intact', async () => {
  const worklogDir = await mkdtemp(join(tmpdir(), 'supervisor-shutdown-'));
  const eofChild = spawnSupervisor(worklogDir, {}, ['pipe', 'pipe', 'pipe']);
  const termChild = spawnSupervisor(worklogDir);
  const direct = spawn(process.execPath, [serverEntrypoint], {
    cwd: packageRoot,
    env: { ...process.env, WORKLOG_DIR: worklogDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let directStdout = '';
  direct.stdout.on('data', (chunk) => {
    directStdout += chunk;
  });
  try {
    const directResponse = waitForPattern(direct.stdout, direct, /\n/);
    direct.stdin.write(`${JSON.stringify(initializeRequest(3))}\n`);
    await directResponse;
    const response = JSON.parse(directStdout.slice(0, directStdout.indexOf('\n')).trim());
    assert.equal(response.id, 3);
    assert.equal(response.result.serverInfo.name, 'delegation-worklog');

    eofChild.stdin.end();
    const eofExit = await waitForExit(eofChild);
    assert.equal(eofExit.code, 0, `EOF shutdown was not clean: ${JSON.stringify(eofExit)}`);

    await waitForPattern(termChild.stderr, termChild, /WORKLOG_MCP_ENDPOINT=/);
    termChild.kill('SIGTERM');
    const termExit = await waitForExit(termChild);
    assert.equal(termExit.code, 0, `SIGTERM shutdown was not clean: ${JSON.stringify(termExit)}`);
  } finally {
    if (!eofChild.killed) eofChild.kill('SIGKILL');
    if (!termChild.killed) termChild.kill('SIGKILL');
    if (!direct.killed) direct.kill('SIGTERM');
    await Promise.all([
      waitForExit(eofChild).catch(() => {}),
      waitForExit(termChild).catch(() => {}),
      waitForExit(direct).catch(() => {}),
    ]);
    await rm(worklogDir, { recursive: true, force: true });
  }
});
