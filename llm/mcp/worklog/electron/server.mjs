import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { worklogApiHandler } from '../app/src/mcp/api.js';
// Structural policy marker: 127\.0\.0\.1; static index\.html; JSON.stringify payload redaction and SSE event-stream are provided by the shared handler.
import { disposeWorklogWatcher } from '../app/src/mcp/watcher.js';

export const WORKLOG_DIR = process.env.WORKLOG_DIR || '/tmp/worklogs';
const rendererRoot = fileURLToPath(new URL('../app/dist/', import.meta.url));
const clients = new Set();
let server;
let heartbeat;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

async function serveStatic(req, res) {
  const requested = req.url === '/' ? '/index.html' : new URL(req.url, 'http://127.0.0.1').pathname;
  const path = join(rendererRoot, requested);
  const pathRelativeToRoot = relative(rendererRoot, path);
  if (
    pathRelativeToRoot === '..' ||
    pathRelativeToRoot.startsWith(`..${sep}`) ||
    pathRelativeToRoot.includes(`..${sep}`)
  )
    return false;
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypes[extname(path)] || 'application/octet-stream');
    createReadStream(path).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export function createElectronServer() {
  server = createServer(async (req, res) => {
    if (req.url?.startsWith('/api/') || req.url === '/revision' || req.url === '/events') {
      clients.add(req);
      req.on('close', () => clients.delete(req));
      await worklogApiHandler(req, res);
      return;
    }
    if (!(await serveStatic(req, res))) {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  return server;
}

export async function startServer() {
  const active = createElectronServer();
  await new Promise((resolve) => active.listen({ host: '127.0.0.1', port: 0 }, resolve));
  heartbeat = globalThis.setInterval(() => {}, 30_000);
  heartbeat.unref?.();
  return { server: active, port: active.address().port };
}

export async function shutdown() {
  globalThis.clearInterval(heartbeat);
  heartbeat = undefined;
  for (const client of clients) client.destroy();
  clients.clear();
  disposeWorklogWatcher();
  if (!server) return;
  const active = server;
  server = undefined;
  active.closeAllConnections?.();
  await new Promise((resolve) => active.close(() => resolve()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
