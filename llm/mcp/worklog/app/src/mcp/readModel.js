import { readFile, stat } from 'node:fs/promises';
import {
  discoverSessions,
  mainPath,
  subagentPath,
  registryPath,
  sessionDir,
} from '../../../src/storage/repository.mjs';
import { validateId } from '../../../src/domain/worklog.mjs';

export function parseEntries(content) {
  return content
    .split('\n')
    .filter((line) => /^\S+ #\d+ \S+ \S+ /.test(line))
    .map((line) => {
      const [, time, item, actor, tag, ...message] = line.match(/^(\S+) #(\d+) (\S+) (\S+) (.*)$/);
      return { time, item: Number(item), actor, tag, message: message.join(' ') };
    });
}

export function parsePlan(content) {
  return content
    .split('\n')
    .map((line) => line.match(/^( {2})\d+\. (.*)$/)?.[2])
    .filter((step) => step !== undefined);
}

export function parsePeerWorklog(content) {
  return { plan: parsePlan(content), entries: parseEntries(content) };
}

export function createdAtValue(session, birthtime) {
  if (typeof session.createdAt === 'string' && Number.isFinite(Date.parse(session.createdAt))) {
    return { createdAt: session.createdAt, createdAtSource: 'recorded session.json.createdAt' };
  }
  const fallback = birthtime instanceof Date ? birthtime : new Date(birthtime);
  if (Number.isFinite(fallback.getTime())) {
    return { createdAt: fallback.toISOString(), createdAtSource: 'filesystem birthtime fallback' };
  }
  return { createdAt: '', createdAtSource: 'filesystem birthtime fallback' };
}

export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    const openOrder = Number(a.complete) - Number(b.complete);
    if (openOrder) return openOrder;
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && aTime !== bTime) return bTime - aTime;
    return a.orchestrationId.localeCompare(b.orchestrationId);
  });
}

export function updatedAtValue(directoryMtime) {
  const value = directoryMtime instanceof Date ? directoryMtime : new Date(directoryMtime);
  return Number.isFinite(value.getTime()) ? value.toISOString() : '';
}

function entryTimeValue(time, createdAt) {
  if (typeof time !== 'string' || typeof createdAt !== 'string') return NaN;
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const [, hours, minutes, seconds] = match;
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return NaN;
  const started = new Date(createdAt);
  if (!Number.isFinite(started.getTime())) return NaN;
  const entryClock = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  const startedClock =
    started.getUTCHours() * 3600 + started.getUTCMinutes() * 60 + started.getUTCSeconds();
  const rollover = entryClock < startedClock ? 1 : 0;
  return Date.UTC(
    started.getUTCFullYear(),
    started.getUTCMonth(),
    started.getUTCDate() + rollover,
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
}

export function durationValue(createdAt, entries = [], peers = [], completedAt) {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return 'unavailable (log timestamps are time-only)';
  const completed = Date.parse(completedAt);
  const allEntries = [
    ...(Array.isArray(entries) ? entries : []),
    ...(Array.isArray(peers)
      ? peers.flatMap((peer) => (Array.isArray(peer.entries) ? peer.entries : []))
      : []),
  ];
  const latest = allEntries
    .map((entry) => entryTimeValue(entry?.time, createdAt))
    .filter(Number.isFinite)
    .reduce((latestTime, entryTime) => Math.max(latestTime, entryTime), -Infinity);
  const end = Number.isFinite(completed) ? completed : latest;
  if (!Number.isFinite(end)) return 'unavailable (log timestamps are time-only)';
  const seconds = Math.max(0, Math.floor((end - started) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

export function peerDuration(peer) {
  if (typeof peer.createdAt === 'string' && Number.isFinite(Date.parse(peer.createdAt))) {
    return {};
  }
  return {
    duration: 'unavailable',
    durationSource: 'legacy peer timing unavailable',
  };
}

export async function readWorklogs() {
  const { sessions } = await discoverSessions('orchestrator');
  const enriched = await Promise.all(
    sessions.map(async (session) => {
      let birthtime;
      let directoryMtime;
      try {
        directoryMtime = (await stat(sessionDir(session.orchestrationId))).mtime;
      } catch {
        directoryMtime = undefined;
      }
      try {
        const registryFile = registryPath(session.orchestrationId);
        const registry = JSON.parse(await readFile(registryFile, 'utf8'));
        birthtime = (await stat(registryFile)).birthtime;
        Object.assign(session, {
          createdAt: registry.createdAt,
          completedAt: registry.completedAt,
        });
      } catch {
        try {
          birthtime = (await stat(registryPath(session.orchestrationId))).birthtime;
        } catch {
          birthtime = undefined;
        }
      }
      const { createdAt, createdAtSource } = createdAtValue(session, birthtime);
      const peers = await Promise.all(
        session.peers.map(async (peer) => {
          const content = await readFile(subagentPath(session.orchestrationId, peer.id), 'utf8');
          const worklog = parsePeerWorklog(content);
          return {
            ...peer,
            complete: peer.complete,
            ...worklog,
            ...peerDuration({ ...peer, ...worklog }),
          };
        }),
      );
      const entries = parseEntries(await readFile(mainPath(session.orchestrationId), 'utf8'));
      return {
        orchestrationId: session.orchestrationId,
        actor: session.actor,
        goal: session.goal,
        done: session.done,
        steps: session.steps,
        complete: session.complete,
        createdAt,
        createdAtSource,
        updatedAt: updatedAtValue(directoryMtime),
        duration: session.complete
          ? durationValue(createdAt, entries, peers, session.completedAt)
          : 'unavailable (log timestamps are time-only)',
        peers,
        entries,
      };
    }),
  );
  const ordered = sortSessions(enriched);
  return redactSecrets({ sessions: ordered });
}

export async function readWorklog(orchestrationId) {
  validateId(orchestrationId, 'orchestration id');
  const model = await readWorklogs();
  const result = model.sessions.find((session) => session.orchestrationId === orchestrationId);
  if (!result) throw new Error('unknown orchestration id');
  return result;
}

export function redactSecrets(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => (/token|secret|password/i.test(key) ? undefined : item)),
  );
}

export function statusLabel(complete) {
  return complete ? 'Closed' : 'Open';
}
