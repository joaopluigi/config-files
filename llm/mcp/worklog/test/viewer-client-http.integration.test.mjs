import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createViewerClient } from '../app/src/mcp/client.js';
import { startHttp } from '../src/runtime/http.mjs';

const orchestrationId = 'a1b2c3d4';
const fixtureRoot = '/tmp/worklogs';
const fixtureDir = join(fixtureRoot, orchestrationId);
const capabilityToken = 'fixture-session-capability-token';

async function installFixture() {
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(
    join(fixtureDir, 'session.json'),
    JSON.stringify({
      orchestrationId,
      token: capabilityToken,
      actor: 'orchestrator',
      goal: 'browser integration fixture',
      done: 'the viewer can inspect it',
      steps: ['list it', 'read it'],
      peers: [],
      questions: {},
      createdAt: '2026-11-09T00:00:00.000Z',
    }),
  );
  await writeFile(
    join(fixtureDir, `${orchestrationId}-main.txt`),
    '# worklog — browser integration fixture\n\nworking directory: /tmp\n\ngoal: browser integration fixture\ndone: the viewer can inspect it\n\norchestration id: a1b2c3d4\n\nplan items\n  1. list it\n  2. read it\n\n── log ──\n\n2026-11-09T00:00:01.000Z #1 orchestrator progress fixture entry\n',
  );
}

test('real viewer client performs MCP initialize/list/detail with required Accept headers and redacted detail', async () => {
  await installFixture();
  const started = await startHttp({ host: '127.0.0.1', port: 0, token: 'viewer-http-token' });
  try {
    const client = createViewerClient({
      endpoint: `http://127.0.0.1:${started.port}/mcp`,
      token: 'viewer-http-token',
      actor: 'orchestrator',
    });
    const listed = await client.listSessions();
    assert.equal(listed.sessions[0].orchestrationId, orchestrationId);
    const detail = await client.getSession(orchestrationId, capabilityToken);
    assert.equal(detail.orchestrationId, orchestrationId);
    assert.ok(detail.entries.some((entry) => entry.message === 'fixture entry'));
    assert.doesNotMatch(JSON.stringify(detail), /capabilityToken|token|secret/i);
  } finally {
    await started.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
