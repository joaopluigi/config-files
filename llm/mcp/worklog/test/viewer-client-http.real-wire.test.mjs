import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const completedId = 'a1b2c3d4';
const incompleteId = 'e5f6a7b8';
const completedToken = 'completed-fixture-token';
const incompleteToken = 'incomplete-fixture-token';

const completedSession = {
  orchestrationId: completedId,
  token: completedToken,
  actor: 'orchestrator',
  goal: 'exercise completed viewer metadata',
  done: 'the completed viewer model is safe to render',
  steps: ['collect evidence', 'close session'],
  peers: [
    {
      id: 'peer001a',
      actor: 'tester',
      token: 'peer-fixture-token',
      createdAt: '2026-11-09T00:00:10.000Z',
      completedAt: '2026-11-09T00:01:10.000Z',
    },
  ],
  questions: {},
  createdAt: '2026-11-09T00:00:00.000Z',
  completedAt: '2026-11-09T00:02:03.000Z',
};

const incompleteSession = {
  orchestrationId: incompleteId,
  token: incompleteToken,
  actor: 'orchestrator',
  goal: 'exercise incomplete viewer metadata',
  done: 'the incomplete viewer model is safe to render',
  steps: ['leave session open'],
  peers: [],
  questions: {},
  createdAt: '2026-11-09T00:03:00.000Z',
};

function mainContent({ workingDirectory, goal, done, steps, entries }) {
  return [
    '# worklog — fixture',
    '',
    `working directory: ${workingDirectory}`,
    '',
    `goal: ${goal}`,
    `done: ${done}`,
    '',
    'orchestration id: fixture',
    '',
    'plan items',
    ...steps.map((step, index) => `  ${index + 1}. ${step}`),
    '',
    '── log ──',
    '',
    ...entries,
    '',
  ].join('\n');
}

async function installFixture(root, session, { workingDirectory, entries, peerContent } = {}) {
  const sessionRoot = join(root, session.orchestrationId);
  await mkdir(sessionRoot, { recursive: true });
  await writeFile(join(sessionRoot, 'session.json'), JSON.stringify(session));
  await writeFile(
    join(sessionRoot, `${session.orchestrationId}-main.txt`),
    mainContent({
      workingDirectory,
      goal: session.goal,
      done: session.done,
      steps: session.steps,
      entries,
    }),
  );
  if (peerContent)
    await writeFile(
      join(sessionRoot, `${session.orchestrationId}-subagent-peer001a.txt`),
      peerContent,
    );
}

function assertNoSecretsOrPaths(value) {
  assert.doesNotMatch(JSON.stringify(value), /token|path/i);
}

test('real viewer wire exposes safe metadata for list and detail models', async (t) => {
  const worklogRoot = await mkdtemp(join(tmpdir(), 'real-viewer-wire-'));
  const previousWorklogRoot = process.env.WORKLOG_DIR;
  process.env.WORKLOG_DIR = worklogRoot;
  await installFixture(worklogRoot, completedSession, {
    workingDirectory: '/tmp/completed-project',
    entries: [
      '2026-11-09T00:00:30.000Z #1 orchestrator think prepared evidence',
      '2026-11-09T00:00:40.000Z #1 orchestrator done collected evidence',
      '2026-11-09T00:01:50.000Z #2 orchestrator think ready to close',
      '2026-11-09T00:02:00.000Z #2 orchestrator done closed session',
    ],
    peerContent:
      '# peer fixture\n\nworking directory: /tmp/completed-project\n\nplan items\n  1. peer task\n\n── log ──\n\n2026-11-09T00:00:20.000Z #1 tester think started\n2026-11-09T00:01:00.000Z #1 tester done finished\n',
  });
  await installFixture(worklogRoot, incompleteSession, {
    workingDirectory: '/tmp/incomplete-project',
    entries: ['2026-11-09T00:03:30.000Z #1 orchestrator progress still working'],
  });

  const [{ createViewerClient }, { startHttp }] = await Promise.all([
    import('../app/src/mcp/client.js'),
    import('../src/runtime/http.mjs'),
  ]);
  const started = await startHttp({ host: '127.0.0.1', port: 0, token: 'viewer-http-token' });
  const client = createViewerClient({
    endpoint: `http://127.0.0.1:${started.port}/mcp`,
    token: 'viewer-http-token',
  });

  try {
    await t.test('session list includes workingDirectory and card-required metadata', async () => {
      const listed = await client.listSessions();
      const session = listed.sessions.find(
        ({ orchestrationId }) => orchestrationId === completedId,
      );
      assert.deepEqual(
        {
          orchestrationId: session?.orchestrationId,
          workingDirectory: session?.workingDirectory,
          actor: session?.actor,
          goal: session?.goal,
          done: session?.done,
          steps: session?.steps,
          complete: session?.complete,
          createdAt: session?.createdAt,
          duration: session?.duration,
          peers: session?.peers,
        },
        {
          orchestrationId: completedId,
          workingDirectory: '/tmp/completed-project',
          actor: 'orchestrator',
          goal: 'exercise completed viewer metadata',
          done: 'the completed viewer model is safe to render',
          steps: ['collect evidence', 'close session'],
          complete: true,
          createdAt: '2026-11-09T00:00:00.000Z',
          duration: '0h 2m 3s',
          peers: [
            {
              id: 'peer001a',
              actor: 'tester',
              createdAt: '2026-11-09T00:00:10.000Z',
              completedAt: '2026-11-09T00:01:10.000Z',
              plan: ['peer task'],
              entries: [
                {
                  time: '2026-11-09T00:00:20.000Z',
                  item: 1,
                  actor: 'tester',
                  tag: 'think',
                  message: 'started',
                },
                {
                  time: '2026-11-09T00:01:00.000Z',
                  item: 1,
                  actor: 'tester',
                  tag: 'done',
                  message: 'finished',
                },
              ],
              complete: true,
              duration: '0h 1m 0s',
            },
          ],
        },
      );
      assertNoSecretsOrPaths(listed);
    });

    await t.test(
      'completed detail includes timestamp-derived duration, peers, and entries',
      async () => {
        const detail = await client.getSession(completedId);
        assert.equal(detail.orchestrationId, completedId);
        assert.equal(detail.workingDirectory, '/tmp/completed-project');
        assert.equal(detail.duration, '0h 2m 3s');
        assert.deepEqual(detail.peers, [
          {
            id: 'peer001a',
            actor: 'tester',
            createdAt: '2026-11-09T00:00:10.000Z',
            completedAt: '2026-11-09T00:01:10.000Z',
            plan: ['peer task'],
            entries: [
              {
                time: '2026-11-09T00:00:20.000Z',
                item: 1,
                actor: 'tester',
                tag: 'think',
                message: 'started',
              },
              {
                time: '2026-11-09T00:01:00.000Z',
                item: 1,
                actor: 'tester',
                tag: 'done',
                message: 'finished',
              },
            ],
            complete: true,
            duration: '0h 1m 0s',
          },
        ]);
        assert.deepEqual(detail.entries, [
          {
            time: '2026-11-09T00:00:30.000Z',
            item: 1,
            actor: 'orchestrator',
            tag: 'think',
            message: 'prepared evidence',
          },
          {
            time: '2026-11-09T00:00:40.000Z',
            item: 1,
            actor: 'orchestrator',
            tag: 'done',
            message: 'collected evidence',
          },
          {
            time: '2026-11-09T00:01:50.000Z',
            item: 2,
            actor: 'orchestrator',
            tag: 'think',
            message: 'ready to close',
          },
          {
            time: '2026-11-09T00:02:00.000Z',
            item: 2,
            actor: 'orchestrator',
            tag: 'done',
            message: 'closed session',
          },
        ]);
        assertNoSecretsOrPaths(detail);
      },
    );

    await t.test(
      'incomplete detail returns null duration and preserves safe metadata',
      async () => {
        const detail = await client.getSession(incompleteId);
        assert.equal(detail.orchestrationId, incompleteId);
        assert.equal(detail.complete, false);
        assert.equal(detail.workingDirectory, '/tmp/incomplete-project');
        assert.equal(detail.duration, null);
        assert.deepEqual(detail.peers, []);
        assert.equal(detail.entries.length, 1);
        assertNoSecretsOrPaths(detail);
      },
    );
  } finally {
    await started.close();
    if (previousWorklogRoot === undefined) delete process.env.WORKLOG_DIR;
    else process.env.WORKLOG_DIR = previousWorklogRoot;
    await rm(worklogRoot, { recursive: true, force: true });
  }
});
