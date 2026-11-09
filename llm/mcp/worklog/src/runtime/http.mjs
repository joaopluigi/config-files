import { randomBytes } from 'node:crypto';
import { createServer as createNodeServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

export const MAX_BODY_SIZE = 1024 * 1024;

function readBody(request, maxBodySize) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maxBodySize) {
      reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const tooLarge = () => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      request.resume();
      reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
    };
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodySize) return tooLarge();
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    request.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
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

function rejected(status, message, headers = {}) {
  return new globalThis.Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...headers },
  });
}

const SUPPORTED_PROTOCOL_VERSION = '2025-06-18';

function validateProtocolVersion(body, protocolHeader) {
  if (protocolHeader && protocolHeader !== SUPPORTED_PROTOCOL_VERSION) {
    throw Object.assign(new Error(`unsupported MCP protocol version: ${protocolHeader}`), {
      statusCode: 400,
    });
  }
  let message;
  try {
    message = JSON.parse(body.toString('utf8'));
  } catch {
    return;
  }
  if (message.method !== 'initialize') return;
  const requested = message.params?.protocolVersion;
  if (requested !== SUPPORTED_PROTOCOL_VERSION) {
    throw Object.assign(new Error(`unsupported MCP protocol version: ${requested ?? 'missing'}`), {
      statusCode: 400,
    });
  }
}

export async function handleMcpRequest(
  request,
  reply,
  { expectedHost, token, maxBodySize = MAX_BODY_SIZE } = {},
) {
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
  if (token && request.headers.authorization !== `Bearer ${token}`) {
    await writeResponse(rejected(401, 'authorization required'), reply);
    return;
  }
  if (new URL(request.url, `http://${expectedHost}`).pathname !== '/mcp') {
    await writeResponse(rejected(404, 'not found'), reply);
    return;
  }
  if (request.method !== 'POST') {
    await writeResponse(rejected(405, 'method not allowed', { allow: 'POST' }), reply);
    return;
  }

  try {
    const body = await readBody(request, maxBodySize);
    validateProtocolVersion(body, request.headers['mcp-protocol-version']);
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
    await writeResponse(rejected(error.statusCode ?? 500, error.message), reply);
  }
}

export async function startHttp({ host = '127.0.0.1', port = 0, token } = {}) {
  if (typeof token !== 'string' || token.length === 0)
    throw new Error('HTTP bearer token is required');
  if (host !== '127.0.0.1') throw new Error('HTTP server must bind to 127.0.0.1');

  const nodeServer = createNodeServer(async (request, reply) => {
    const address = nodeServer.address();
    await handleMcpRequest(request, reply, {
      expectedHost: `${host}:${address.port}`,
      token,
    });
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

async function startStandalone() {
  const host = process.env.WORKLOG_HTTP_HOST || '127.0.0.1';
  const port = Number(process.env.WORKLOG_HTTP_PORT || 0);
  const token = process.env.WORKLOG_MCP_TOKEN || randomBytes(32).toString('hex');
  const server = await startHttp({ host, port, token });
  const endpoint = `http://${host}:${server.port}/mcp`;
  process.stderr.write(`WORKLOG_MCP_ENDPOINT=${endpoint} WORKLOG_MCP_TOKEN=${token}\n`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      await server.close();
      process.exitCode = 0;
    } catch (error) {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startStandalone().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
