import { describe, expect, it } from 'vitest';
import {
  createdAtValue,
  durationValue,
  peerDuration,
  updatedAtValue,
  parseEntries,
  parsePeerWorklog,
  redactSecrets,
  sortSessions,
  statusLabel,
} from './readModel.js';
describe('read model', () => {
  it('parses safe entries', () =>
    expect(parseEntries('12:00:01 #1 executor progress hello')).toEqual([
      { time: '12:00:01', item: 1, actor: 'executor', tag: 'progress', message: 'hello' },
    ]));
  it('parses ISO-8601 entries and preserves mixed-format input order', () =>
    expect(
      parseEntries(
        '2026-09-30T23:59:59.900Z #1 executor progress legacy-compatible\n00:00:01 #2 executor progress time-only',
      ),
    ).toEqual([
      {
        time: '2026-09-30T23:59:59.900Z',
        item: 1,
        actor: 'executor',
        tag: 'progress',
        message: 'legacy-compatible',
      },
      { time: '00:00:01', item: 2, actor: 'executor', tag: 'progress', message: 'time-only' },
    ]));
  it('parses persisted peer plan and log entries', () => {
    expect(
      parsePeerWorklog(
        'goal: inspect persisted worklog text\n\n  1. read the peer log\n  2. parse its plan and entries\n\n── log ──\n12:00:01 #1 executor progress parsed peer log',
      ),
    ).toEqual({
      plan: ['read the peer log', 'parse its plan and entries'],
      entries: [
        {
          time: '12:00:01',
          item: 1,
          actor: 'executor',
          tag: 'progress',
          message: 'parsed peer log',
        },
      ],
    });
  });
  it('redacts secret-shaped fields', () =>
    expect(redactSecrets({ token: 'x', nested: { capabilityToken: 'y', ok: 1 } })).toEqual({
      nested: { ok: 1 },
    }));
  it('labels completion', () => expect(statusLabel(false)).toBe('Open'));
  it('derives updatedAt from directory mtime with an empty invalid fallback', () => {
    expect(updatedAtValue(new Date('2026-09-30T12:00:00Z'))).toBe('2026-09-30T12:00:00.000Z');
    expect(updatedAtValue('not-a-date')).toBe('');
  });
  it('derives closed duration from the latest main or peer entry', () => {
    expect(
      durationValue(
        '2026-09-30T10:00:00Z',
        [{ time: '10:03:04' }],
        [{ entries: [{ time: '10:12:05' }] }],
      ),
    ).toBe('0h 12m 5s');
  });
  it('ends closed duration at the latest meaningful entry, not later completedAt', () => {
    expect(
      durationValue(
        '2026-09-30T11:20:00Z',
        [{ time: '11:28:04', tag: 'progress' }],
        [],
        '2026-09-30T11:40:00Z',
      ),
    ).toBe('0h 8m 4s');
  });
  it('does not let a close or lifecycle marker extend closed duration', () => {
    expect(
      durationValue('2026-09-30T11:20:00Z', [
        { time: '11:28:04', tag: 'progress' },
        { time: '11:40:00', tag: 'done' },
      ]),
    ).toBe('0h 8m 4s');
  });
  it('ignores invalid entries before the latest valid main or peer entry', () => {
    expect(
      durationValue(
        '2026-09-30T10:00:00Z',
        [{ time: 'invalid' }],
        [{ entries: [{ time: '10:12:05' }] }],
      ),
    ).toBe('0h 12m 5s');
  });
  it('preserves unavailable fallback for missing or invalid data and clamps negative duration', () => {
    expect(durationValue('not-a-date', [{ time: '10:00:00' }])).toBe(
      'unavailable (log timestamps are time-only)',
    );
    expect(durationValue('2026-09-30T10:00:00Z', [{ time: 'invalid' }])).toBe(
      'unavailable (log timestamps are time-only)',
    );
    expect(durationValue('2026-09-30T10:00:00Z', [{ time: '09:59:59' }])).toBe('23h 59m 59s');
  });
  it('anchors earlier time-only entries to the next date across midnight', () => {
    expect(durationValue('2026-09-30T23:59:00Z', [{ time: '00:01:00' }])).toBe('0h 2m 0s');
  });
  it('calculates exact duration from ISO timestamps across timezone and midnight boundaries', () => {
    expect(
      durationValue('2026-09-30T23:59:30.000Z', [{ time: '2026-10-01T01:00:00.250+01:00' }]),
    ).toBe('0h 0m 30s');
  });
  it('does not infer legacy peer duration from birthtime and time-only entries', () => {
    expect(
      peerDuration({ birthtime: '2026-09-30T19:15:57.145Z', entries: [{ time: '16:16:31' }] }),
    ).toEqual({ duration: 'unavailable', durationSource: 'legacy peer timing unavailable' });
    expect(peerDuration({ entries: [{ time: '10:12:05' }] })).toEqual({
      duration: 'unavailable',
      durationSource: 'legacy peer timing unavailable',
    });
  });
  it('preserves persisted peer timing precedence over birthtime', () => {
    expect(
      peerDuration({
        createdAt: '2026-09-30T10:00:00Z',
        completedAt: '2026-09-30T10:12:05Z',
        birthtime: '2026-01-01T00:00:00Z',
        entries: [{ time: '10:12:05' }],
      }),
    ).toEqual({});
  });
  it('derives closed peer duration from the latest meaningful entry, not completedAt', () => {
    expect(
      peerDuration({
        createdAt: '2026-09-30T10:00:00Z',
        completedAt: '2026-09-30T10:20:00Z',
        complete: true,
        entries: [
          { time: '10:12:05', tag: 'progress' },
          { time: '10:12:06', tag: 'done' },
        ],
      }),
    ).toEqual({ duration: '0h 12m 5s' });
  });
  it('prefers valid recorded createdAt and labels fallback sources', () => {
    expect(createdAtValue({ createdAt: '2026-09-30T10:00:00Z' }, new Date('2026-01-01'))).toEqual({
      createdAt: '2026-09-30T10:00:00Z',
      createdAtSource: 'recorded session.json.createdAt',
    });
    expect(createdAtValue({ createdAt: 'not-a-time' }, new Date('2026-01-01'))).toEqual({
      createdAt: '2026-01-01T00:00:00.000Z',
      createdAtSource: 'filesystem birthtime fallback',
    });
    expect(createdAtValue({ createdAt: 'not-a-time' })).toEqual({
      createdAt: '',
      createdAtSource: 'filesystem birthtime fallback',
    });
  });
  it('orders open sessions first, then newest, with stable ties', () => {
    const sessions = [
      { orchestrationId: 'closed', complete: true, createdAt: '2026-09-30T12:00:00Z' },
      { orchestrationId: 'open-old', complete: false, createdAt: '2026-09-29T12:00:00Z' },
      { orchestrationId: 'open-new', complete: false, createdAt: '2026-09-30T12:00:00Z' },
      { orchestrationId: 'invalid', complete: false, createdAt: 'invalid' },
      { orchestrationId: 'tie-b', complete: false, createdAt: '2026-09-28T12:00:00Z' },
      { orchestrationId: 'tie-a', complete: false, createdAt: '2026-09-28T12:00:00Z' },
    ];
    expect(sortSessions(sessions).map(({ orchestrationId }) => orchestrationId)).toEqual([
      'open-new',
      'open-old',
      'tie-a',
      'tie-b',
      'invalid',
      'closed',
    ]);
  });
});
