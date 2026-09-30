import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { actors } from '../src/domain/worklog.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const server = join(project, 'server.mjs');
function resultText(response) {
  assert.equal(response.error, undefined, JSON.stringify(response));
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
        const msg = JSON.parse(line);
        if (pending.has(msg.id)) pending.get(msg.id)(msg);
      }
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 3000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(msg);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n');
  return { child, request };
}
async function call(client, name, args) {
  const arguments_ =
    name === 'worklog_append' && args.item !== undefined
      ? {
          orchestrationId: args.orchestrationId,
          capabilityToken: args.capabilityToken,
          peerId: args.peerId,
          actor: args.actor,
          entries: [{ item: args.item, tag: args.tag, message: args.message }],
        }
      : args;
  return client.request('tools/call', { name, arguments: arguments_ });
}

test('MCP session creation reports available actors for non-orchestrators', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const response = await call(client, 'worklog_session_create', {
      actor: 'executor',
      goal: 'test',
      done: 'done',
      steps: ['create'],
    });
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.content[0].text,
      'only orchestrator may create a session; available actors: orchestrator, investigator, ideator, executor, tester, reviewer, critic, maintainer, researcher',
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP session creation reports available tags on success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['create'],
      }),
    );
    assert.deepEqual(session.available_tags, [
      'think',
      'find',
      'decide',
      'done',
      'plan',
      'question',
      'answer',
      'note',
    ]);
    assert.deepEqual(session.available_actors, [...actors]);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP append reports invalid actors and available actors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['append'],
      }),
    );
    const response = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      item: 1,
      actor: 'unknown',
      tag: 'note',
      message: 'invalid',
    });
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.content[0].text,
      'invalid actor "unknown"; available actors: orchestrator, investigator, ideator, executor, tester, reviewer, critic, maintainer, researcher',
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP append reports invalid tags and available tags without appending', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['append'],
      }),
    );
    const response = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      item: 1,
      actor: 'orchestrator',
      tag: 'invalid',
      message: 'invalid',
    });
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.content[0].text,
      'invalid tag: invalid; available tags: think, find, decide, done, plan, question, answer, note',
    );
    assert.doesNotMatch(await readFile(session.path, 'utf8'), /invalid/);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP peer creation reports invalid actors and available actors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['peer'],
      }),
    );
    const response = await call(client, 'worklog_peer_create', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      actor: 'unknown',
      goal: 'peer',
      done: 'done',
      steps: ['create'],
    });
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.content[0].text,
      'invalid actor "unknown"; available actors: orchestrator, investigator, ideator, executor, tester, reviewer, critic, maintainer, researcher',
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP recovers a stale file lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['append'],
      }),
    );
    const lock = `${session.path}.lock`;
    await writeFile(lock, 'stale');
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    const appended = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      item: 1,
      actor: 'orchestrator',
      tag: 'note',
      message: 'recovered',
    });
    assert.equal(appended.result.isError, undefined, JSON.stringify(appended));
    assert.match(appended.result.content[0].text, /recovered/);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('stale recovery does not let an old owner remove a replacement lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const a = await startClient(dir);
  const b = await startClient(dir);
  try {
    const session = resultText(
      await call(a, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['lock', 'append'],
      }),
    );
    const lock = `${session.path}.lock`;
    await writeFile(lock, 'old-owner');
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    const results = await Promise.all([
      call(a, 'worklog_append', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        item: 1,
        actor: 'orchestrator',
        tag: 'note',
        message: 'first',
      }),
      call(b, 'worklog_append', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        item: 2,
        actor: 'orchestrator',
        tag: 'note',
        message: 'second',
      }),
    ]);
    assert.equal(results.filter((response) => response.result?.isError !== true).length, 2);
    assert.doesNotMatch(await readFile(session.path, 'utf8'), /concurrent corruption/);
    await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' });
  } finally {
    a.child.kill('SIGTERM');
    b.child.kill('SIGTERM');
  }
});

test('MCP registers peers, authenticates sessions, and links one answer to one question', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const a = await startClient(dir);
  const b = await startClient(dir);
  try {
    const session = resultText(
      await call(a, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['ask'],
      }),
    );
    const peer = resultText(
      await call(a, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'answer',
        done: 'done',
        steps: ['answer'],
      }),
    );
    const unknown = await call(a, 'worklog_read', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      peerId: 'aaaaaaaa',
    });
    assert.equal(unknown.result.isError, true);
    const wrongToken = await call(b, 'worklog_read', {
      orchestrationId: session.orchestrationId,
      capabilityToken: '0'.repeat(64),
    });
    assert.equal(wrongToken.result.isError, true);
    const asked = resultText(
      await call(a, 'worklog_ask', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        targetPeerId: peer.peerId,
        item: 1,
        actor: 'orchestrator',
        question: 'Can you answer?',
      }),
    );
    assert.match(asked.questionId, /^[a-f0-9]{8}$/);
    const race = await Promise.all([
      call(a, 'worklog_answer', {
        orchestrationId: session.orchestrationId,
        capabilityToken: peer.capabilityToken,
        peerId: peer.peerId,
        questionId: asked.questionId,
        item: 1,
        actor: 'executor',
        answer: 'First.',
      }),
      call(b, 'worklog_answer', {
        orchestrationId: session.orchestrationId,
        capabilityToken: peer.capabilityToken,
        peerId: peer.peerId,
        questionId: asked.questionId,
        item: 1,
        actor: 'executor',
        answer: 'Second.',
      }),
    ]);
    assert.equal(race.filter((response) => response.result?.isError !== true).length, 1);
    assert.equal(race.filter((response) => response.result?.isError === true).length, 1);
    const child = await readFile(peer.path, 'utf8');
    assert.equal((child.match(new RegExp(`answer:${asked.questionId}`, 'g')) || []).length, 1);
    assert.equal((child.match(/First\.|Second\./g) || []).length, 1);
    const duplicate = await call(a, 'worklog_answer', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      questionId: asked.questionId,
      item: 1,
      actor: 'executor',
      answer: 'Again.',
    });
    assert.equal(duplicate.result.isError, true);
    assert.doesNotMatch(child, /Again/);
  } finally {
    a.child.kill('SIGTERM');
    b.child.kill('SIGTERM');
  }
});

test('MCP child ownership covers append, answer, and close', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['ask'],
      }),
    );
    const peer = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'peer',
        done: 'done',
        steps: ['answer'],
      }),
    );
    const beforeAppend = await readFile(peer.path, 'utf8');
    const wrongAppend = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      item: 1,
      actor: 'orchestrator',
      tag: 'think',
      message: 'wrong',
    });
    assert.equal(wrongAppend.result.isError, true);
    assert.match(wrongAppend.result.content[0].text, /actor does not own peer/);
    assert.equal(await readFile(peer.path, 'utf8'), beforeAppend);
    const thought = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      item: 1,
      actor: 'executor',
      tag: 'think',
      message: 'ready',
    });
    assert.equal(thought.result.isError, undefined, JSON.stringify(thought));
    assert.match(await readFile(peer.path, 'utf8'), /executor think ready/);
    const asked = resultText(
      await call(client, 'worklog_ask', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        targetPeerId: peer.peerId,
        item: 1,
        actor: 'orchestrator',
        question: 'Can you answer?',
      }),
    );
    const beforeAnswer = await readFile(peer.path, 'utf8');
    const wrongAnswer = await call(client, 'worklog_answer', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      questionId: asked.questionId,
      item: 1,
      actor: 'orchestrator',
      answer: 'wrong',
    });
    assert.equal(wrongAnswer.result.isError, true);
    assert.match(wrongAnswer.result.content[0].text, /actor does not own peer/);
    assert.equal(await readFile(peer.path, 'utf8'), beforeAnswer);
    const answer = await call(client, 'worklog_answer', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      questionId: asked.questionId,
      item: 1,
      actor: 'executor',
      answer: 'correct',
    });
    assert.equal(answer.result.isError, undefined, JSON.stringify(answer));
    const beforeClose = await readFile(peer.path, 'utf8');
    const wrongClose = await call(client, 'worklog_close', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      item: 1,
      actor: 'orchestrator',
      message: 'wrong',
    });
    assert.equal(wrongClose.result.isError, true);
    assert.match(wrongClose.result.content[0].text, /actor does not own peer/);
    assert.equal(await readFile(peer.path, 'utf8'), beforeClose);
    const close = await call(client, 'worklog_close', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
      item: 1,
      actor: 'executor',
      message: 'complete',
    });
    assert.equal(close.result.isError, undefined, JSON.stringify(close));
    const content = await readFile(peer.path, 'utf8');
    assert.match(content, /actor: executor/);
    assert.match(content, /executor think ready/);
    assert.match(content, /executor answer \[answer:/);
    assert.match(content, /executor done complete/);
    assert.doesNotMatch(content, /orchestrator (think|answer|done) wrong/);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('concurrent peer creation keeps every peer registered and readable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['peers'],
      }),
    );
    const peers = await Promise.all(
      Array.from({ length: 20 }, () =>
        call(client, 'worklog_peer_create', {
          orchestrationId: session.orchestrationId,
          capabilityToken: session.capabilityToken,
          actor: 'executor',
          goal: 'peer',
          done: 'done',
          steps: ['read'],
        }).then(resultText),
      ),
    );
    assert.equal(new Set(peers.map((peer) => peer.peerId)).size, peers.length);
    for (const peer of peers) {
      const read = await call(client, 'worklog_read', {
        orchestrationId: session.orchestrationId,
        capabilityToken: peer.capabilityToken,
        peerId: peer.peerId,
      });
      assert.equal(read.result.isError, undefined, JSON.stringify(read));
    }
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('status rejects random peer tokens and accepts only session or matching peer tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['status'],
      }),
    );
    const peer = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'peer',
        done: 'done',
        steps: ['read'],
      }),
    );
    const random = await call(client, 'worklog_status', {
      orchestrationId: session.orchestrationId,
      capabilityToken: '0'.repeat(64),
      peerId: peer.peerId,
    });
    assert.equal(random.result.isError, true);
    const peerStatus = await call(client, 'worklog_status', {
      orchestrationId: session.orchestrationId,
      capabilityToken: peer.capabilityToken,
      peerId: peer.peerId,
    });
    assert.equal(peerStatus.result.isError, undefined, JSON.stringify(peerStatus));
    const sessionStatus = await call(client, 'worklog_status', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      peerId: peer.peerId,
    });
    assert.equal(sessionStatus.result.isError, undefined, JSON.stringify(sessionStatus));
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('questions require an existing target peer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['ask'],
      }),
    );
    const omitted = await call(client, 'worklog_ask', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      item: 1,
      actor: 'orchestrator',
      question: 'No target.',
    });
    assert.equal(omitted.result.isError, true);
    const unknown = await call(client, 'worklog_ask', {
      orchestrationId: session.orchestrationId,
      capabilityToken: session.capabilityToken,
      targetPeerId: 'deadbeef',
      item: 1,
      actor: 'orchestrator',
      question: 'Unknown target.',
    });
    assert.equal(unknown.result.isError, true);
    assert.doesNotMatch(await readFile(session.path, 'utf8'), /No target\.|Unknown target\./);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP session discovery returns metadata without secrets and cannot mutate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'discover',
        done: 'done',
        steps: ['open'],
      }),
    );
    const status = resultText(
      await call(client, 'worklog_session_status', { actor: 'orchestrator' }),
    );
    assert.equal(status.sessions.length, 1);
    assert.equal(status.sessions[0].orchestrationId, session.orchestrationId);
    assert.equal(status.sessions[0].goal, 'discover');
    assert.equal(status.sessions[0].capabilityToken, undefined);
    assert.doesNotMatch(JSON.stringify(status), new RegExp(session.capabilityToken));
    const unauthorized = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      item: 1,
      actor: 'orchestrator',
      tag: 'note',
      message: 'no token',
    });
    assert.equal(unauthorized.result.isError, true);
    assert.equal(
      (await call(client, 'worklog_session_status', { actor: 'executor' })).result.isError,
      true,
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP session discovery reports main and peer completion shapes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'discover main',
        done: 'done',
        steps: ['open'],
      }),
    );
    const incomplete = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'incomplete peer',
        done: 'done',
        steps: ['open'],
      }),
    );
    const complete = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'tester',
        goal: 'complete peer',
        done: 'done',
        steps: ['close'],
      }),
    );
    assert.equal(
      (
        await call(client, 'worklog_append', {
          orchestrationId: session.orchestrationId,
          capabilityToken: complete.capabilityToken,
          peerId: complete.peerId,
          item: 1,
          actor: 'tester',
          tag: 'think',
          message: 'ready to close',
        })
      ).result.isError,
      undefined,
    );
    assert.equal(
      (
        await call(client, 'worklog_close', {
          orchestrationId: session.orchestrationId,
          capabilityToken: complete.capabilityToken,
          peerId: complete.peerId,
          item: 1,
          actor: 'tester',
          message: 'finished',
        })
      ).result.isError,
      undefined,
    );

    const registryFile = join(dir, session.orchestrationId, 'session.json');
    const registry = JSON.parse(await readFile(registryFile, 'utf8'));
    delete registry.peers.find(({ id }) => id === incomplete.peerId).createdAt;
    await writeFile(registryFile, JSON.stringify(registry, null, 2));

    const status = resultText(
      await call(client, 'worklog_session_status', { actor: 'orchestrator' }),
    );
    const discovered = status.sessions.find(
      ({ orchestrationId }) => orchestrationId === session.orchestrationId,
    );
    assert.equal(discovered.goal, 'discover main');
    assert.equal(discovered.complete, false);
    assert.equal(discovered.completion, undefined);
    const legacyPeer = discovered.peers.find(({ id }) => id === incomplete.peerId);
    const persistedPeer = discovered.peers.find(({ id }) => id === complete.peerId);
    assert.equal(legacyPeer.birthtimeSource, 'filesystem birthtime fallback');
    assert.match(legacyPeer.birthtime, /^2026-|^20/);
    assert.equal(persistedPeer.birthtime, undefined);
    assert.equal(persistedPeer.birthtimeSource, undefined);
    assert.deepEqual(
      discovered.peers.map(({ id, actor, goal, complete: isComplete }) => ({
        id,
        actor,
        goal,
        complete: isComplete,
      })),
      [
        { id: incomplete.peerId, actor: 'executor', goal: 'incomplete peer', complete: false },
        { id: complete.peerId, actor: 'tester', goal: 'complete peer', complete: true },
      ],
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP explicit session token reuses an incomplete session after discovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'reuse',
        done: 'done',
        steps: ['continue'],
      }),
    );
    const discovery = resultText(
      await call(client, 'worklog_session_status', { actor: 'orchestrator' }),
    );
    const candidate = discovery.sessions.find(
      ({ orchestrationId }) => orchestrationId === session.orchestrationId,
    );
    assert.deepEqual(candidate, {
      orchestrationId: session.orchestrationId,
      path: session.path,
      goal: 'reuse',
      done: 'done',
      steps: ['continue'],
      plan: ['continue'],
      actor: 'orchestrator',
      complete: false,
      createdAt: candidate.createdAt,
      peers: [],
    });
    assert.equal(candidate.capabilityToken, undefined);
    assert.equal(Object.hasOwn(candidate, 'openItems'), false);
    assert.equal(Object.hasOwn(candidate, 'openQuestions'), false);
    assert.equal(candidate.goal, 'reuse');
    assert.doesNotMatch(JSON.stringify(candidate), new RegExp(session.capabilityToken));

    const withoutToken = await call(client, 'worklog_append', {
      orchestrationId: candidate.orchestrationId,
      item: 1,
      actor: 'orchestrator',
      tag: 'note',
      message: 'missing token',
    });
    assert.equal(withoutToken.result.isError, true);
    const reused = await call(client, 'worklog_append', {
      orchestrationId: candidate.orchestrationId,
      capabilityToken: session.capabilityToken,
      item: 1,
      actor: 'orchestrator',
      tag: 'note',
      message: 'reused after discovery',
    });
    assert.equal(reused.result.isError, undefined, JSON.stringify(reused));
    assert.equal(session.orchestrationId, candidate.orchestrationId);
    assert.match(await readFile(session.path, 'utf8'), /orchestrator note reused after discovery/);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP follow-up sessions receive new credentials and explicit lineage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const predecessor = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'first',
        done: 'done',
        steps: ['open'],
      }),
    );
    const followup = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'follow-up',
        done: 'done',
        steps: ['continue'],
        predecessorOrchestrationId: predecessor.orchestrationId,
        continuationReason: 'continue open work',
      }),
    );
    assert.notEqual(followup.orchestrationId, predecessor.orchestrationId);
    assert.notEqual(followup.capabilityToken, predecessor.capabilityToken);
    assert.equal(followup.predecessorOrchestrationId, predecessor.orchestrationId);
    assert.equal(followup.continuationReason, 'continue open work');
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP follow-up rejects incomplete lineage without creating sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const reasonOnly = await call(client, 'worklog_session_create', {
      actor: 'orchestrator',
      goal: 'follow-up',
      done: 'done',
      steps: ['continue'],
      continuationReason: 'missing predecessor',
    });
    assert.equal(reasonOnly.result.isError, true);
    assert.match(
      reasonOnly.result.content[0].text,
      /predecessor orchestration id is required with continuation reason/,
    );
    const unknown = await call(client, 'worklog_session_create', {
      actor: 'orchestrator',
      goal: 'follow-up',
      done: 'done',
      steps: ['continue'],
      predecessorOrchestrationId: 'deadbeef',
      continuationReason: 'unknown predecessor',
    });
    assert.equal(unknown.result.isError, true);
    assert.match(unknown.result.content[0].text, /unknown predecessor orchestration id/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP follow-up appends remain open until done and reject new plans or closed items', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'append',
        done: 'done',
        steps: ['open'],
      }),
    );
    for (const message of ['one', 'two'])
      assert.equal(
        (
          await call(client, 'worklog_append', {
            orchestrationId: session.orchestrationId,
            capabilityToken: session.capabilityToken,
            item: 1,
            actor: 'orchestrator',
            tag: 'note',
            message,
          })
        ).result.isError,
        undefined,
      );
    assert.equal(
      resultText(
        await call(client, 'worklog_status', {
          orchestrationId: session.orchestrationId,
          capabilityToken: session.capabilityToken,
        }),
      ).completion.complete,
      false,
    );
    assert.equal(
      (
        await call(client, 'worklog_append', {
          orchestrationId: session.orchestrationId,
          capabilityToken: session.capabilityToken,
          item: 2,
          actor: 'orchestrator',
          tag: 'plan',
          message: 'new',
        })
      ).result.isError,
      true,
    );
    assert.equal(
      (
        await call(client, 'worklog_close', {
          orchestrationId: session.orchestrationId,
          capabilityToken: session.capabilityToken,
          item: 1,
          actor: 'orchestrator',
          message: 'complete',
        })
      ).result.isError,
      true,
    );
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('MCP replacement creates isolated linked peers and preserves predecessor history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'replace',
        done: 'done',
        steps: ['replace'],
      }),
    );
    const predecessor = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'old peer',
        done: 'done',
        steps: ['continue'],
      }),
    );
    const history = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: predecessor.capabilityToken,
      peerId: predecessor.peerId,
      item: 1,
      actor: 'executor',
      tag: 'think',
      message: 'predecessor history',
    });
    assert.equal(history.result.isError, undefined, JSON.stringify(history));
    const replacement = resultText(
      await call(client, 'worklog_peer_replace', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        predecessorPeerId: predecessor.peerId,
        actor: 'tester',
        goal: 'replacement peer',
        done: 'done',
        steps: ['continue'],
        continuationReason: 'continue interrupted work',
      }),
    );
    assert.notEqual(replacement.peerId, predecessor.peerId);
    assert.notEqual(replacement.capabilityToken, predecessor.capabilityToken);
    assert.equal(replacement.predecessorPeerId, predecessor.peerId);
    assert.equal(replacement.continuationReason, 'continue interrupted work');

    const discovery = resultText(
      await call(client, 'worklog_session_status', { actor: 'orchestrator' }),
    );
    assert.doesNotMatch(JSON.stringify(discovery), new RegExp(predecessor.capabilityToken));
    assert.doesNotMatch(JSON.stringify(discovery), new RegExp(replacement.capabilityToken));
    const replacementStatus = resultText(
      await call(client, 'worklog_status', {
        orchestrationId: session.orchestrationId,
        capabilityToken: replacement.capabilityToken,
        peerId: replacement.peerId,
      }),
    );
    assert.match(
      replacementStatus.content,
      new RegExp(`predecessor peer id: ${predecessor.peerId}`),
    );
    assert.match(replacementStatus.content, /continuation reason: continue interrupted work/);
    assert.doesNotMatch(JSON.stringify(replacementStatus), new RegExp(predecessor.capabilityToken));
    assert.doesNotMatch(JSON.stringify(replacementStatus), new RegExp(replacement.capabilityToken));

    const crossOperations = [
      [
        'worklog_append',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: predecessor.capabilityToken,
          peerId: replacement.peerId,
          item: 1,
          actor: 'executor',
          tag: 'think',
          message: 'old token',
        },
      ],
      [
        'worklog_answer',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: predecessor.capabilityToken,
          peerId: replacement.peerId,
          questionId: 'deadbeef',
          item: 1,
          actor: 'executor',
          answer: 'old token',
        },
      ],
      [
        'worklog_close',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: predecessor.capabilityToken,
          peerId: replacement.peerId,
          item: 1,
          actor: 'executor',
          message: 'old token',
        },
      ],
      [
        'worklog_append',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: replacement.capabilityToken,
          peerId: predecessor.peerId,
          item: 1,
          actor: 'tester',
          tag: 'think',
          message: 'new token',
        },
      ],
      [
        'worklog_answer',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: replacement.capabilityToken,
          peerId: predecessor.peerId,
          questionId: 'deadbeef',
          item: 1,
          actor: 'tester',
          answer: 'new token',
        },
      ],
      [
        'worklog_close',
        {
          orchestrationId: session.orchestrationId,
          capabilityToken: replacement.capabilityToken,
          peerId: predecessor.peerId,
          item: 1,
          actor: 'tester',
          message: 'new token',
        },
      ],
    ];
    for (const [name, args] of crossOperations)
      assert.equal((await call(client, name, args)).result.isError, true);

    const wrongActor = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: replacement.capabilityToken,
      peerId: replacement.peerId,
      item: 1,
      actor: 'executor',
      tag: 'think',
      message: 'wrong actor',
    });
    assert.equal(wrongActor.result.isError, true);
    const asked = resultText(
      await call(client, 'worklog_ask', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        targetPeerId: replacement.peerId,
        item: 1,
        actor: 'orchestrator',
        question: 'Continue?',
      }),
    );
    const wrongAnswer = await call(client, 'worklog_answer', {
      orchestrationId: session.orchestrationId,
      capabilityToken: replacement.capabilityToken,
      peerId: replacement.peerId,
      questionId: asked.questionId,
      item: 1,
      actor: 'executor',
      answer: 'wrong actor',
    });
    assert.equal(wrongAnswer.result.isError, true);
    const answer = await call(client, 'worklog_answer', {
      orchestrationId: session.orchestrationId,
      capabilityToken: replacement.capabilityToken,
      peerId: replacement.peerId,
      questionId: asked.questionId,
      item: 1,
      actor: 'tester',
      answer: 'continued',
    });
    assert.equal(answer.result.isError, undefined, JSON.stringify(answer));
    const append = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: replacement.capabilityToken,
      peerId: replacement.peerId,
      item: 1,
      actor: 'tester',
      tag: 'think',
      message: 'replacement history',
    });
    assert.equal(append.result.isError, undefined, JSON.stringify(append));
    const close = await call(client, 'worklog_close', {
      orchestrationId: session.orchestrationId,
      capabilityToken: replacement.capabilityToken,
      peerId: replacement.peerId,
      item: 1,
      actor: 'tester',
      message: 'complete',
    });
    assert.equal(close.result.isError, undefined, JSON.stringify(close));

    const predecessorContent = resultText(
      await call(client, 'worklog_read', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        peerId: predecessor.peerId,
      }),
    );
    assert.match(predecessorContent.content, /executor think predecessor history/);
    assert.doesNotMatch(predecessorContent.content, /old token|new token|replacement history/);
    const replacementContent = resultText(
      await call(client, 'worklog_read', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        peerId: replacement.peerId,
      }),
    );
    assert.match(replacementContent.content, /tester answer/);
    assert.match(replacementContent.content, /tester think replacement history/);
    assert.match(replacementContent.content, /tester done complete/);
  } finally {
    client.child.kill('SIGTERM');
  }
});

test('peer tokens are bound and read cursors use UTF-8 byte offsets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const client = await startClient(dir);
  try {
    const session = resultText(
      await call(client, 'worklog_session_create', {
        actor: 'orchestrator',
        goal: 'test',
        done: 'done',
        steps: ['unicode'],
      }),
    );
    const one = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'one',
        done: 'done',
        steps: ['write'],
      }),
    );
    const two = resultText(
      await call(client, 'worklog_peer_create', {
        orchestrationId: session.orchestrationId,
        capabilityToken: session.capabilityToken,
        actor: 'executor',
        goal: 'two',
        done: 'done',
        steps: ['write'],
      }),
    );
    const wrong = await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: one.capabilityToken,
      peerId: two.peerId,
      item: 1,
      actor: 'executor',
      tag: 'note',
      message: 'wrong',
    });
    assert.equal(wrong.result.isError, true);
    await call(client, 'worklog_append', {
      orchestrationId: session.orchestrationId,
      capabilityToken: one.capabilityToken,
      peerId: one.peerId,
      item: 1,
      actor: 'executor',
      tag: 'note',
      message: 'héllo 🌍',
    });
    const first = resultText(
      await call(client, 'worklog_read', {
        orchestrationId: session.orchestrationId,
        capabilityToken: one.capabilityToken,
        peerId: one.peerId,
      }),
    );
    const second = resultText(
      await call(client, 'worklog_read', {
        orchestrationId: session.orchestrationId,
        capabilityToken: one.capabilityToken,
        peerId: one.peerId,
        since: Buffer.byteLength(first.content) - Buffer.byteLength('héllo 🌍\n'),
      }),
    );
    assert.equal(Buffer.byteLength(first.content), first.next);
    assert.match(second.content, /héllo 🌍/);
  } finally {
    client.child.kill('SIGTERM');
  }
});
