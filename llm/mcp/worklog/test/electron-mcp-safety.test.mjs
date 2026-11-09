/* global fetch */

import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createElectronServer } from '../electron/server.mjs';

async function oversizedPost(baseUrl) {
  const url = new URL(`${baseUrl}/mcp`);
  const body = Buffer.alloc(16 * 1024 * 1024, 97);
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
          'content-length': body.length,
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

async function start() {
  const server = createElectronServer();
  await new Promise((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('Electron composition exposes /mcp safely while preserving legacy routes', async () => {
  const { server, baseUrl } = await start();
  try {
    const oversizedStatus = await oversizedPost(baseUrl);
    assert.equal(oversizedStatus, 413, 'oversized MCP bodies must be rejected');

    const legacy = await fetch(`${baseUrl}/api/worklogs`);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.headers.get('content-type'), 'application/json');

    const mcp = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'electron-test', version: '1.0.0' },
        },
      }),
    });
    assert.equal(mcp.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
