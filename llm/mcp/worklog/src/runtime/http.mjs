import { createServer as createNodeServer } from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function writeResponse(response, reply, sanitizeInitialize = false) {
  reply.statusCode = response.status;
  for (const [name, value] of response.headers) reply.setHeader(name, value);
  if (!response.body) {
    reply.end();
    return;
  }
  const reader = response.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  let body = Buffer.concat(chunks);
  if (sanitizeInitialize && response.headers.get('content-type')?.includes('application/json')) {
    const payload = JSON.parse(body.toString('utf8'));
    if (payload.result?.capabilities?.tools) delete payload.result.capabilities.tools.listChanged;
    body = Buffer.from(JSON.stringify(payload));
  }
  reply.end(body);
}

function rejected(status, message) {
  return new globalThis.Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function startHttp({ host = '127.0.0.1', port = 0, token } = {}) {
  if (typeof token !== 'string' || token.length === 0)
    throw new Error('HTTP bearer token is required');
  if (host !== '127.0.0.1') throw new Error('HTTP server must bind to 127.0.0.1');

  const nodeServer = createNodeServer(async (request, reply) => {
    const address = nodeServer.address();
    const expectedHost = `${host}:${address.port}`;
    const requestHost = request.headers.host;
    const requestOrigin = request.headers.origin;
    if (requestHost !== expectedHost) {
      await writeResponse(rejected(403, 'disallowed host'), reply);
      return;
    }
    if (requestOrigin && requestOrigin !== `http://${expectedHost}`) {
      await writeResponse(rejected(403, 'disallowed origin'), reply);
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      await writeResponse(rejected(401, 'authorization required'), reply);
      return;
    }
    if (request.url !== '/mcp') {
      await writeResponse(rejected(404, 'not found'), reply);
      return;
    }

    try {
      const body = await readBody(request);
      const headers = new globalThis.Headers(request.headers);
      const webRequest = new globalThis.Request(`http://${expectedHost}${request.url}`, {
        method: request.method,
        headers,
        body:
          body.length === 0 || request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : body,
      });
      const { createViewerServer } = await import('../mcp/tools.mjs');
      const server = createViewerServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      try {
        await writeResponse(
          await transport.handleRequest(webRequest),
          reply,
          body.toString('utf8').includes('"method":"initialize"'),
        );
      } finally {
        await transport.close();
        await server.close();
      }
    } catch (error) {
      await writeResponse(rejected(500, error.message), reply);
    }
  });

  await new Promise((resolve, reject) => {
    nodeServer.once('error', reject);
    nodeServer.listen(port, host, resolve);
  });
  const address = nodeServer.address();
  return {
    port: address.port,
    address,
    close: async () => {
      await new Promise((resolve, reject) =>
        nodeServer.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
