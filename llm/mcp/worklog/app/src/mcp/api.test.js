import { describe, expect, it } from 'vitest';
import { worklogApiHandler } from '../../vite.config.js';

function responseFor(url, method = 'GET') {
  const headers = {};
  let body = '';
  const res = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    end: (value) => {
      body = value;
    },
  };
  return worklogApiHandler({ method, url }, res).then(() => ({
    statusCode: res.statusCode,
    headers,
    body,
  }));
}

describe('worklog API', () => {
  it('returns redacted JSON from the list endpoint', async () => {
    const response = await responseFor('/api/worklogs');
    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/json');
    const payload = JSON.parse(response.body);
    const serializedKeys = JSON.stringify(payload);
    expect(serializedKeys).not.toMatch(/"(?:token|secret|password)[^"]*"\s*:/i);
    expect(payload).toHaveProperty('sessions');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects %s requests without reading worklog data',
    async (method) => {
      const response = await responseFor('/api/worklogs', method);
      expect(response.statusCode).toBe(405);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(response.body)).toEqual({ error: 'method not allowed' });
    },
  );

  it('validates ID-addressed requests and returns safe errors', async () => {
    const invalid = await responseFor('/api/worklogs/not valid');
    const missing = await responseFor('/api/worklogs/00000000');
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toEqual({
      error: expect.stringContaining('invalid orchestration id'),
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body)).toEqual({ error: 'unknown orchestration id' });
    expect(invalid.body).not.toMatch(/"(?:token|secret|password)[^"]*"\s*:/i);
    expect(missing.body).not.toMatch(/"(?:token|secret|password)[^"]*"\s*:/i);
  });

  it('serves the current revision and rejects non-GET revision requests', async () => {
    const get = await responseFor('/api/worklogs/revision');
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).revision).toEqual(expect.any(Number));
    const post = await responseFor('/api/worklogs/revision', 'POST');
    expect(post.statusCode).toBe(405);
  });

  it('opens SSE with an initial revision event and removes the listener on close', async () => {
    const headers = {};
    const chunks = [];
    const listeners = {};
    const response = {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      write: (value) => chunks.push(value),
    };
    await worklogApiHandler(
      {
        method: 'GET',
        url: '/api/worklogs/events',
        on: (event, listener) => {
          listeners[event] = listener;
        },
      },
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(headers).toMatchObject({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatch(/^event: revision\ndata: \{"revision":\d+\}\n\n$/);
    expect(chunks[0]).not.toContain('\\\\n');
    expect(listeners.close).toEqual(expect.any(Function));
    listeners.close();
  });
});
