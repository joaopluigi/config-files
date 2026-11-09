/* global Response, process */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

async function loadClient() {
  try {
    const clientPath = './client.js';
    return { module: await import(/* @vite-ignore */ clientPath), error: null };
  } catch (error) {
    return { module: null, error };
  }
}

test('MCP viewer client uses HTTP JSON-RPC for list/detail and parses sanitized results', async () => {
  const { module, error } = await loadClient();
  expect(error, 'frontend MCP client module must exist').toBeNull();
  if (error) return;

  const calls = [];
  const fetchImpl = vi.fn(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    const result =
      body.params?.name === 'worklog_session_status'
        ? { sessions: [{ orchestrationId: 'session-1', goal: 'viewer', token: undefined }] }
        : { orchestrationId: 'session-1', entries: [{ item: 1, message: 'safe' }] };
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  const client = module.createViewerClient({
    endpoint: 'http://127.0.0.1:43123/mcp',
    token: 'loopback-token',
    fetchImpl,
    actor: 'viewer',
  });

  await expect(client.listSessions()).resolves.toEqual({
    sessions: [{ orchestrationId: 'session-1', goal: 'viewer' }],
  });
  await expect(client.getSession('session-1', 'session-token')).resolves.toEqual({
    orchestrationId: 'session-1',
    entries: [{ item: 1, message: 'safe' }],
  });

  expect(calls).toHaveLength(2);
  expect(calls.map(({ url }) => url)).toEqual([
    'http://127.0.0.1:43123/mcp',
    'http://127.0.0.1:43123/mcp',
  ]);
  expect(calls.every(({ options }) => options.method === 'POST')).toBe(true);
  expect(
    calls.every(({ options }) => options.headers.Authorization === 'Bearer loopback-token'),
  ).toBe(true);
  expect(calls.map(({ body }) => body.method)).toEqual(['tools/call', 'tools/call']);
  expect(calls[0].body.params).toMatchObject({
    name: 'worklog_session_status',
    arguments: { actor: 'viewer' },
  });
  expect(calls[1].body.params).toMatchObject({
    name: 'worklog_read',
    arguments: { orchestrationId: 'session-1', token: 'session-token' },
  });
});

test('viewer refresh and error states use the MCP client seam', async () => {
  const { WorklogViewerScreen } = await import('../viewer/screens/WorklogViewerScreen.jsx');
  const client = {
    listSessions: vi.fn().mockRejectedValue(new Error('MCP unavailable')),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('legacy fetch must not run'))),
  );

  render(React.createElement(WorklogViewerScreen, { client, refreshInterval: 60_000 }));

  await waitFor(() => expect(client.listSessions).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('alert')).toHaveTextContent('MCP unavailable');
});

test('migrated viewer source has no repository/filesystem or legacy REST/SSE data path', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/viewer/screens/WorklogViewerScreen.jsx'),
    'utf8',
  );
  expect(source).toContain('client');
  expect(source).not.toMatch(/from ['"].*\/src\/(repository|storage|service)\//);
  expect(source).not.toMatch(/fetch\s*\(/);
  expect(source).not.toContain('/api/worklogs');
  expect(source).not.toContain('EventSource');
  expect(source).not.toContain('text/event-stream');
});
