import { readWorklog, readWorklogs, redactSecrets } from './readModel.js';
import { currentRevision, subscribeRevision } from './watcher.js';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(redactSecrets(payload)));
}

export async function worklogApiHandler(req, res) {
  const rawPathname = new globalThis.URL(req.url, 'http://127.0.0.1').pathname;
  if (rawPathname === '/api/worklogs/revision' || rawPathname === '/revision') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    return sendJson(res, 200, { revision: currentRevision() });
  }
  if (rawPathname === '/api/worklogs/events' || rawPathname === '/events') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (value) =>
      res.write(`event: revision\ndata: ${JSON.stringify({ revision: value })}\n\n`);
    send(currentRevision());
    const unsubscribe = subscribeRevision(send);
    req.on?.('close', unsubscribe);
    return;
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
  const pathname =
    rawPathname === '/'
      ? '/api/worklogs'
      : rawPathname.startsWith('/api/worklogs')
        ? rawPathname
        : `/api/worklogs${rawPathname}`;
  const idMatch = pathname.match(/^\/api\/worklogs\/([^/]+)$/);
  try {
    if (idMatch) return sendJson(res, 200, await readWorklog(decodeURIComponent(idMatch[1])));
    if (pathname === '/api/worklogs') return sendJson(res, 200, await readWorklogs());
    return sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const statusCode = message.includes('invalid orchestration id')
      ? 400
      : message.includes('unknown orchestration id')
        ? 404
        : 500;
    return sendJson(res, statusCode, {
      error: statusCode === 500 ? 'internal server error' : message,
    });
  }
}
