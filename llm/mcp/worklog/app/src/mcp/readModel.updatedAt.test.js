import { mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = {
  dir: '/tmp/worklog-read-model-updated-at',
  registry: '/tmp/worklog-read-model-updated-at/session.json',
  main: '/tmp/worklog-read-model-updated-at/abcdef12-main.txt',
  peer: '/tmp/worklog-read-model-updated-at/abcdef12-subagent-peer1234.txt',
};

vi.mock('../../../src/storage/repository.mjs', () => ({
  discoverSessions: async () => ({
    sessions: [
      {
        orchestrationId: 'abcdef12',
        actor: 'orchestrator',
        goal: 'Inspect',
        done: 'Done',
        steps: [],
        complete: false,
        peers: [{ id: 'peer1234', actor: 'executor', complete: false }],
      },
    ],
  }),
  mainPath: () => paths.main,
  subagentPath: () => paths.peer,
  registryPath: () => paths.registry,
}));

const { readWorklogs } = await import('./readModel.js');

describe('read model updatedAt', () => {
  beforeEach(async () => {
    await mkdir(paths.dir, { recursive: true });
    await writeFile(paths.registry, JSON.stringify({ createdAt: '2026-09-30T10:00:00Z' }));
    await writeFile(paths.main, '# worklog\n\n── log ──\n');
    await writeFile(paths.peer, '# worklog\n\n── log ──\n');
    await utimes(paths.main, new Date('2026-09-30T11:00:00Z'), new Date('2026-09-30T11:00:00Z'));
    await utimes(paths.peer, new Date('2026-09-30T12:00:00Z'), new Date('2026-09-30T12:00:00Z'));
  });

  it('uses the main log mtime and ignores a newer peer log mtime', async () => {
    const [session] = (await readWorklogs()).sessions;
    expect(session.updatedAt).toBe('2026-09-30T11:00:00.000Z');
  });

  it('changes updatedAt when the main log mtime is newer', async () => {
    await utimes(paths.main, new Date('2026-09-30T13:00:00Z'), new Date('2026-09-30T13:00:00Z'));
    const [session] = (await readWorklogs()).sessions;
    expect(session.updatedAt).toBe('2026-09-30T13:00:00.000Z');
  });

  afterAll(async () => {
    await rm(paths.dir, { recursive: true, force: true });
  });
});
