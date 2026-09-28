import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project = fileURLToPath(new URL('..', import.meta.url));
const server = join(project, 'server.mjs');
function resultText(response) { assert.equal(response.error, undefined, JSON.stringify(response)); return JSON.parse(response.result.content[0].text); }
async function startClient(dir) {
  const child = spawn(process.execPath, [server], { env: { ...process.env, WORKLOG_DIR: dir } });
  let buffer = ''; const pending = new Map(); let nextId = 1;
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { buffer += chunk; for (;;) { const n = buffer.indexOf('\n'); if (n < 0) break; const line = buffer.slice(0, n).trim(); buffer = buffer.slice(n + 1); if (line) { const msg = JSON.parse(line); if (pending.has(msg.id)) pending.get(msg.id)(msg); } } });
  const request = (method, params) => new Promise((resolve, reject) => { const id = nextId++; const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 3000); pending.set(id, (msg) => { clearTimeout(timer); pending.delete(id); resolve(msg); }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n');
  return { child, request };
}
async function call(client, name, args) { return client.request('tools/call', { name, arguments: args }); }

test('MCP recovers a stale file lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const client = await startClient(dir);
  try {
    const session = resultText(await call(client, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['append'] }));
    const lock = `${session.path}.lock`;
    await writeFile(lock, 'stale');
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    const appended = await call(client, 'worklog_append', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, item: 1, actor: 'orchestrator', tag: 'note', message: 'recovered' });
    assert.equal(appended.result.isError, undefined, JSON.stringify(appended));
    assert.match(appended.result.content[0].text, /recovered/);
  } finally { client.child.kill('SIGTERM'); }
});

test('stale recovery does not let an old owner remove a replacement lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const a = await startClient(dir); const b = await startClient(dir);
  try {
    const session = resultText(await call(a, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['lock', 'append'] }));
    const lock = `${session.path}.lock`;
    await writeFile(lock, 'old-owner');
    const old = new Date(Date.now() - 60_000); await utimes(lock, old, old);
    const results = await Promise.all([
      call(a, 'worklog_append', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, item: 1, actor: 'orchestrator', tag: 'note', message: 'first' }),
      call(b, 'worklog_append', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, item: 2, actor: 'orchestrator', tag: 'note', message: 'second' }),
    ]);
    assert.equal(results.filter((response) => response.result?.isError !== true).length, 2);
    assert.doesNotMatch(await readFile(session.path, 'utf8'), /concurrent corruption/);
    await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' });
  } finally { a.child.kill('SIGTERM'); b.child.kill('SIGTERM'); }
});

test('MCP registers peers, authenticates sessions, and links one answer to one question', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const a = await startClient(dir); const b = await startClient(dir);
  try {
    const session = resultText(await call(a, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['ask'] }));
    const peer = resultText(await call(a, 'worklog_subagent_create', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, actor: 'executor', goal: 'answer', done: 'done', steps: ['answer'] }));
    const unknown = await call(a, 'worklog_read', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, peerId: 'aaaaaaaa' });
    assert.equal(unknown.result.isError, true);
    const wrongToken = await call(b, 'worklog_read', { orchestrationId: session.orchestrationId, capabilityToken: '0'.repeat(64) });
    assert.equal(wrongToken.result.isError, true);
    const asked = resultText(await call(a, 'worklog_ask', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, targetPeerId: peer.peerId, item: 1, actor: 'orchestrator', question: 'Can you answer?' }));
    assert.match(asked.questionId, /^[a-f0-9]{8}$/);
    const race = await Promise.all([
      call(a, 'worklog_answer', { orchestrationId: session.orchestrationId, capabilityToken: peer.capabilityToken, peerId: peer.peerId, questionId: asked.questionId, item: 1, actor: 'executor', answer: 'First.' }),
      call(b, 'worklog_answer', { orchestrationId: session.orchestrationId, capabilityToken: peer.capabilityToken, peerId: peer.peerId, questionId: asked.questionId, item: 1, actor: 'executor', answer: 'Second.' }),
    ]);
    assert.equal(race.filter((response) => response.result?.isError !== true).length, 1);
    assert.equal(race.filter((response) => response.result?.isError === true).length, 1);
    const child = await readFile(peer.path, 'utf8');
    assert.equal((child.match(new RegExp(`answer:${asked.questionId}`, 'g')) || []).length, 1);
    assert.equal((child.match(/First\.|Second\./g) || []).length, 1);
    const duplicate = await call(a, 'worklog_answer', { orchestrationId: session.orchestrationId, capabilityToken: peer.capabilityToken, peerId: peer.peerId, questionId: asked.questionId, item: 1, actor: 'executor', answer: 'Again.' });
    assert.equal(duplicate.result.isError, true);
    assert.doesNotMatch(child, /Again/);
  } finally { a.child.kill('SIGTERM'); b.child.kill('SIGTERM'); }
});

test('concurrent peer creation keeps every peer registered and readable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const client = await startClient(dir);
  try {
    const session = resultText(await call(client, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['peers'] }));
    const peers = await Promise.all(Array.from({ length: 20 }, () => call(client, 'worklog_subagent_create', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, actor: 'executor', goal: 'peer', done: 'done', steps: ['read'] }).then(resultText)));
    assert.equal(new Set(peers.map((peer) => peer.peerId)).size, peers.length);
    for (const peer of peers) {
      const read = await call(client, 'worklog_read', { orchestrationId: session.orchestrationId, capabilityToken: peer.capabilityToken, peerId: peer.peerId });
      assert.equal(read.result.isError, undefined, JSON.stringify(read));
    }
  } finally { client.child.kill('SIGTERM'); }
});

test('status rejects random peer tokens and accepts only session or matching peer tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const client = await startClient(dir);
  try {
    const session = resultText(await call(client, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['status'] }));
    const peer = resultText(await call(client, 'worklog_subagent_create', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, actor: 'executor', goal: 'peer', done: 'done', steps: ['read'] }));
    const random = await call(client, 'worklog_status', { orchestrationId: session.orchestrationId, capabilityToken: '0'.repeat(64), peerId: peer.peerId });
    assert.equal(random.result.isError, true);
    const peerStatus = await call(client, 'worklog_status', { orchestrationId: session.orchestrationId, capabilityToken: peer.capabilityToken, peerId: peer.peerId });
    assert.equal(peerStatus.result.isError, undefined, JSON.stringify(peerStatus));
    const sessionStatus = await call(client, 'worklog_status', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, peerId: peer.peerId });
    assert.equal(sessionStatus.result.isError, undefined, JSON.stringify(sessionStatus));
  } finally { client.child.kill('SIGTERM'); }
});

test('questions require an existing target peer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const client = await startClient(dir);
  try {
    const session = resultText(await call(client, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['ask'] }));
    const omitted = await call(client, 'worklog_ask', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, item: 1, actor: 'orchestrator', question: 'No target.' });
    assert.equal(omitted.result.isError, true);
    const unknown = await call(client, 'worklog_ask', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, targetPeerId: 'deadbeef', item: 1, actor: 'orchestrator', question: 'Unknown target.' });
    assert.equal(unknown.result.isError, true);
    assert.doesNotMatch(await readFile(session.path, 'utf8'), /No target\.|Unknown target\./);
  } finally { client.child.kill('SIGTERM'); }
});

test('peer tokens are bound and read cursors use UTF-8 byte offsets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-')); const client = await startClient(dir);
  try {
    const session = resultText(await call(client, 'worklog_session_create', { actor: 'orchestrator', goal: 'test', done: 'done', steps: ['unicode'] }));
    const one = resultText(await call(client, 'worklog_subagent_create', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, actor: 'executor', goal: 'one', done: 'done', steps: ['write'] }));
    const two = resultText(await call(client, 'worklog_subagent_create', { orchestrationId: session.orchestrationId, capabilityToken: session.capabilityToken, actor: 'executor', goal: 'two', done: 'done', steps: ['write'] }));
    const wrong = await call(client, 'worklog_append', { orchestrationId: session.orchestrationId, capabilityToken: one.capabilityToken, peerId: two.peerId, item: 1, actor: 'executor', tag: 'note', message: 'wrong' });
    assert.equal(wrong.result.isError, true);
    await call(client, 'worklog_append', { orchestrationId: session.orchestrationId, capabilityToken: one.capabilityToken, peerId: one.peerId, item: 1, actor: 'executor', tag: 'note', message: 'héllo 🌍' });
    const first = resultText(await call(client, 'worklog_read', { orchestrationId: session.orchestrationId, capabilityToken: one.capabilityToken, peerId: one.peerId }));
    const second = resultText(await call(client, 'worklog_read', { orchestrationId: session.orchestrationId, capabilityToken: one.capabilityToken, peerId: one.peerId, since: Buffer.byteLength(first.content) - Buffer.byteLength('héllo 🌍\n') }));
    assert.equal(Buffer.byteLength(first.content), first.next);
    assert.match(second.content, /héllo 🌍/);
  } finally { client.child.kill('SIGTERM'); }
});
