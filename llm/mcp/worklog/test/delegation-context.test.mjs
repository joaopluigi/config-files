import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project = fileURLToPath(new URL('..', import.meta.url));
const server = join(project, 'server.mjs');

function resultText(response) {
  assert.equal(response.error, undefined, JSON.stringify(response));
  assert.equal(response.result.isError, undefined, JSON.stringify(response));
  return JSON.parse(response.result.content[0].text);
}

async function startClient(dir) {
  const child = spawn(process.execPath, [server], { env: { ...process.env, WORKLOG_DIR: dir } });
  let buffer = '';
  const pending = new Map();
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const n = buffer.indexOf('\n');
      if (n < 0) break;
      const line = buffer.slice(0, n).trim();
      buffer = buffer.slice(n + 1);
      if (line) {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
      }
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 3000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'delegation-context-test', version: '1' },
  });
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n');
  return { child, request };
}

async function call(client, name, arguments_) {
  return client.request('tools/call', { name, arguments: arguments_ });
}

function expectedDelegationContext({ orchestrationId, peerId, capabilityToken, path, actor }) {
  return `## Server-created peer worklog context (use verbatim)\n- orchestrationId: ${orchestrationId}\n- peerId: ${peerId}\n- capabilityToken: ${capabilityToken}\n- path: ${path}\n- actor: ${actor}\n\nBefore any substantive step, read your peer worklog. Use these five values verbatim for every worklog operation; do not use any other token, create another worklog, or invent identifiers. Start with a progress entry, record progress as you go, add a done entry for each plan item in order, and close your worklog before finishing. If you cannot access or update your worklog, stop immediately and report that.`;
}

test('worklog_peer_create returns a ready-to-paste delegationContext and preserves fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-delegation-context-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'delegation context',
        done: 'create peer',
        steps: ['create peer'],
      }),
    );
    const peer = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'peer goal',
        done: 'peer done',
        steps: ['peer step'],
      }),
    );

    assert.deepEqual(
      {
        orchestrationId: peer.orchestrationId,
        peerId: peer.peerId,
        capabilityToken: peer.capabilityToken,
        path: peer.path,
        actor: peer.actor,
      },
      {
        orchestrationId: session.orchestrationId,
        peerId: peer.peerId,
        capabilityToken: peer.capabilityToken,
        path: peer.path,
        actor: 'executor',
      },
    );
    assert.equal(peer.delegationContext, expectedDelegationContext(peer));
  } finally {
    client.child.kill();
  }
});

test('worklog_peer_replace returns delegationContext for the new peer and preserves fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-delegation-context-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'delegation context replacement',
        done: 'replace peer',
        steps: ['replace peer'],
      }),
    );
    const predecessor = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'interrupted peer',
        done: 'interrupted',
        steps: ['unfinished step'],
      }),
    );
    const replacement = resultText(
      await call(client, 'worklog_peer_replace', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        predecessorPeerId: predecessor.peerId,
        actor: 'tester',
        goal: 'replacement peer',
        done: 'replacement done',
        steps: ['replacement step'],
        continuationReason: 'continue the unfinished step',
      }),
    );

    assert.deepEqual(
      {
        orchestrationId: replacement.orchestrationId,
        peerId: replacement.peerId,
        capabilityToken: replacement.capabilityToken,
        path: replacement.path,
        actor: replacement.actor,
        predecessorPeerId: replacement.predecessorPeerId,
        continuationReason: replacement.continuationReason,
      },
      {
        orchestrationId: session.orchestrationId,
        peerId: replacement.peerId,
        capabilityToken: replacement.capabilityToken,
        path: replacement.path,
        actor: 'tester',
        predecessorPeerId: predecessor.peerId,
        continuationReason: 'continue the unfinished step',
      },
    );
    assert.equal(replacement.delegationContext, expectedDelegationContext(replacement));
  } finally {
    client.child.kill();
  }
});
