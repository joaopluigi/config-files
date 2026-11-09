import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const httpEntrypoint = new URL('../src/runtime/http.mjs', import.meta.url);
const serverEntrypoint = fileURLToPath(new URL('../server.mjs', import.meta.url));
const token = 'http-viewer-test-token';

function waitForStderr(child, getStderr, pattern, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timer;
    let onExit;
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
    onExit = () => check();
    child.once('exit', onExit);
    check();
  });
}

async function loadHttpEntrypoint() {
  try {
    return await import(httpEntrypoint);
  } catch (error) {
    assert.fail(
      `HTTP MCP composition root is required at src/runtime/http.mjs; import failed: ${error.message}`,
    );
  }
}

async function startHttp() {
  const http = await loadHttpEntrypoint();
  assert.equal(typeof http.startHttp, 'function', 'HTTP entrypoint must export startHttp');
  const started = await http.startHttp({
    host: '127.0.0.1',
    port: 0,
    token,
  });
  assert.ok(started && typeof started.close === 'function', 'startHttp must return close()');
  const port = started.port ?? started.address?.port;
  assert.ok(Number.isInteger(port) && port > 0, 'startHttp must expose its bound port');
  return { started, baseUrl: `http://127.0.0.1:${port}` };
}

function mcpRequest(method, id, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

async function post(baseUrl, body, headers = {}) {
  return globalThis.fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      host: new URL(baseUrl).host,
      origin: baseUrl,
      ...headers,
    },
    body,
  });
}

async function rawGet(baseUrl) {
  const url = new URL(`${baseUrl}/mcp`);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${token}`,
          host: url.host,
          origin: baseUrl,
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve({ timedOut: false, status: response.statusCode }));
      },
    );
    request.setTimeout(500, () => {
      request.destroy();
      resolve({ timedOut: true });
    });
    request.on('error', (error) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    request.end();
  });
}

async function rawPost(baseUrl, body, headers = {}) {
  const url = new URL(`${baseUrl}/mcp`);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          host: url.host,
          origin: baseUrl,
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve({ status: response.statusCode }));
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

test('HTTP MCP serves initialize and tools/list with only sanitized read-only viewer capabilities', async () => {
  const { started, baseUrl } = await startHttp();
  try {
    const initialize = await post(
      baseUrl,
      mcpRequest('initialize', 1, {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'http-test', version: '1.0.0' },
      }),
    );
    assert.equal(initialize.status, 200);
    const initializeBody = await initialize.json();
    assert.equal(initializeBody.jsonrpc, '2.0');
    assert.equal(initializeBody.id, 1);
    assert.equal(initializeBody.result.serverInfo.name, 'delegation-worklog');
    assert.deepEqual(initializeBody.result.capabilities, { tools: {} });

    const session = initialize.headers.get('mcp-session-id');
    const listed = await post(
      baseUrl,
      mcpRequest('tools/list', 2),
      session ? { 'mcp-session-id': session } : {},
    );
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.jsonrpc, '2.0');
    assert.equal(listedBody.id, 2);
    const tools = listedBody.result.tools;
    assert.deepEqual(tools.map(({ name }) => name).sort(), [
      'worklog_read',
      'worklog_session_status',
    ]);
    assert.ok(tools.every((tool) => !/append|create|replace|close|ask|answer/i.test(tool.name)));
    assert.ok(
      tools.every((tool) => !/capabilityToken|secret|credential/i.test(JSON.stringify(tool))),
    );
  } finally {
    await started.close();
  }
});

test('HTTP MCP rejects missing or invalid authorization and disallowed Host or Origin', async () => {
  const { started, baseUrl } = await startHttp();
  try {
    const body = mcpRequest('initialize', 1, {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'http-test', version: '1.0.0' },
    });
    const missingAuth = await post(baseUrl, body, { authorization: '' });
    assert.ok([401, 403].includes(missingAuth.status));

    const invalidAuth = await post(baseUrl, body, { authorization: 'Bearer wrong-token' });
    assert.ok([401, 403].includes(invalidAuth.status));

    const disallowedHost = await rawPost(baseUrl, body, { host: 'attacker.example' });
    assert.ok([400, 403].includes(disallowedHost.status));

    const disallowedOrigin = await post(baseUrl, body, { origin: 'https://attacker.example' });
    assert.ok([400, 403].includes(disallowedOrigin.status));
  } finally {
    await started.close();
  }
});

test('HTTP MCP requires a supported protocol version and answers authenticated GET promptly', async () => {
  const { started, baseUrl } = await startHttp();
  try {
    const unsupported = await post(
      baseUrl,
      mcpRequest('initialize', 1, {
        protocolVersion: '1999-01-01',
        capabilities: {},
        clientInfo: { name: 'http-test', version: '1.0.0' },
      }),
    );

    const getResponse = await rawGet(baseUrl);
    assert.deepEqual(
      {
        unsupportedRejected: [400, 406].includes(unsupported.status),
        getPrompt: getResponse.timedOut === false,
        getStatusDefined: [200, 400, 405].includes(getResponse.status),
      },
      { unsupportedRejected: true, getPrompt: true, getStatusDefined: true },
    );
  } finally {
    await assert.doesNotReject(started.close());
  }
});

test('HTTP close works and the existing stdio startup remains available', async () => {
  const { started, baseUrl } = await startHttp();
  await started.close();
  await assert.rejects(globalThis.fetch(`${baseUrl}/mcp`));

  const child = spawn(process.execPath, [serverEntrypoint], {
    env: { ...process.env, WORKLOG_DIR: '/tmp/http-mcp-stdio-test-missing-dir' },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  await waitForStderr(child, () => stderr, /running on stdio/);
  child.kill('SIGTERM');
  assert.match(stderr, /running on stdio/);
});
