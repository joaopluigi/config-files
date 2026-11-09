import { describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { worklogApiHandler } from './api.js';
import { readWorklogs } from './readModel.js';
import {
  appendEntries,
  createSession,
  pathFor,
  authorized,
  sessionDir,
} from '../../../src/storage/repository.mjs';

function responseFor(url) {
  const headers = {};
  let body = '';
  const response = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    end: (value) => {
      body = value;
    },
  };
  return {
    response,
    headers,
    body: () => body,
    run: (options) => worklogApiHandler({ method: 'GET', url }, response, options),
  };
}

describe('service and storage boundary', () => {
  it('allows MCP service behavior to use an injected storage dependency', async () => {
    let calls = 0;
    const storage = {
      listWorklogs: async () => {
        calls += 1;
        return { sessions: [{ orchestrationId: 'fixture', goal: 'from storage' }] };
      },
    };
    const result = responseFor('/api/worklogs');

    await result.run({ storage });

    expect(calls).toBe(1);
    expect(JSON.parse(result.body())).toEqual({
      sessions: [{ orchestrationId: 'fixture', goal: 'from storage' }],
    });
  });

  it('lets the viewer read model obtain redacted data through the storage seam', async () => {
    let calls = 0;
    const storage = {
      listWorklogs: async () => {
        calls += 1;
        return { sessions: [{ orchestrationId: 'fixture', capabilityToken: 'must-not-leak' }] };
      },
    };

    const model = await readWorklogs({ storage });

    expect(calls).toBe(1);
    expect(model).toEqual({
      sessions: [{ orchestrationId: 'fixture' }],
    });
    expect(JSON.stringify(model)).not.toMatch(/capabilityToken|must-not-leak/);
  });

  it('keeps authorization and append behavior represented at the storage boundary', async () => {
    const session = await createSession('orchestrator', 'focused contract', 'done', ['append']);
    try {
      await expect(
        authorized(session.orchestrationId, 'wrong-token', undefined, 'session', 'orchestrator'),
      ).rejects.toThrow('invalid session capability token');

      await appendEntries(
        pathFor(session.orchestrationId),
        'orchestrator',
        [{ item: 1, tag: 'progress', message: 'authorized append' }],
        await authorized(
          session.orchestrationId,
          session.capabilityToken,
          undefined,
          'session',
          'orchestrator',
        ),
      );

      expect(await readFile(pathFor(session.orchestrationId), 'utf8')).toMatch(
        /#1 orchestrator progress authorized append/,
      );
    } finally {
      await rm(sessionDir(session.orchestrationId), { recursive: true, force: true });
    }
  });
});
