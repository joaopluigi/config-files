import { randomBytes } from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { withLock, withClaim } from './locks.mjs';
import {
  actors,
  validateActor,
  validateMainActor,
  validatePeerActor,
  availableActors,
  validateFreeForm,
  validateId,
  validateTag,
  validateAppend,
  completion,
  tags,
} from '../domain/worklog.mjs';

export const root = process.env.WORKLOG_DIR || '/tmp/worklogs';
const id = () => randomBytes(4).toString('hex');
const token = () => randomBytes(32).toString('hex');
export const sessionDir = (orchestrationId) => join(root, orchestrationId);
export const registryPath = (orchestrationId) => join(sessionDir(orchestrationId), 'session.json');
export const mainPath = (orchestrationId) =>
  join(sessionDir(orchestrationId), `${orchestrationId}-main.txt`);
export const subagentPath = (orchestrationId, peerId) =>
  join(sessionDir(orchestrationId), `${orchestrationId}-subagent-${peerId}.txt`);
export function pathFor(orchestrationId, peerId) {
  return peerId === undefined ? mainPath(orchestrationId) : subagentPath(orchestrationId, peerId);
}
export async function readRegistry(orchestrationId) {
  return JSON.parse(await readFile(registryPath(orchestrationId), 'utf8'));
}
function peerFor(registry, peerId) {
  return peerId === undefined ? undefined : registry.peers.find((peer) => peer.id === peerId);
}
const peerMutationContext = Symbol('authorized peer mutation');
const replacementMutationContext = Symbol('authorized replacement mutation');
const trustedPeerMutationContexts = new WeakSet();
const trustedReplacementMutationContexts = new WeakSet();
const activeContinuations = new Set();

function mutationContextFor(orchestrationId, peerId, actor, path, registry) {
  const context = Object.freeze({
    registry,
    orchestrationId,
    peerId,
    actor,
    path,
    [peerMutationContext]: true,
  });
  trustedPeerMutationContexts.add(context);
  return context;
}

function replacementContextFor(orchestrationId, peerId, path, registry) {
  const context = Object.freeze({
    registry,
    orchestrationId,
    peerId,
    actor: 'orchestrator',
    path,
    [replacementMutationContext]: true,
  });
  trustedReplacementMutationContexts.add(context);
  return context;
}

function allowsUnreasonedDone(path, actor, context) {
  return (
    ((trustedPeerMutationContexts.has(context) && context?.[peerMutationContext] === true) ||
      (trustedReplacementMutationContexts.has(context) &&
        context?.[replacementMutationContext] === true)) &&
    context.orchestrationId === path.split('/').at(-2) &&
    context.actor === actor &&
    context.path === path &&
    context.peerId !== undefined
  );
}

export async function authorized(
  orchestrationId,
  capabilityToken,
  peerId,
  kind = 'session',
  actor,
) {
  if (actor !== undefined) validateActor(actor);
  validateId(orchestrationId, 'orchestration id');
  const registry = await readRegistry(orchestrationId);
  if (peerId === undefined) {
    if (registry.token !== capabilityToken) throw new Error('invalid session capability token');
    if (actor !== undefined)
      validateMainActor(actor, 'only orchestrator may use the session capability');
    return registry;
  }
  validateId(peerId, 'peer id');
  const peer = peerFor(registry, peerId);
  if (!peer) throw new Error('unknown peer');
  if (kind === 'session-inspect') {
    if (registry.token !== capabilityToken) throw new Error('invalid session capability token');
    return registry;
  }
  if (kind === 'peer-or-session' && registry.token === capabilityToken) return registry;
  if (kind !== 'peer' && kind !== 'peer-or-session')
    throw new Error('invalid peer capability token');
  if (peer.token !== capabilityToken) throw new Error('invalid peer capability token');
  if (actor !== undefined && peer.actor !== actor) throw new Error('actor does not own peer');
  return registry;
}
export async function authorizedPeerMutation(orchestrationId, capabilityToken, peerId, actor) {
  if (peerId === undefined) throw new Error('peer id is required');
  const registry = await authorized(orchestrationId, capabilityToken, peerId, 'peer', actor);
  return mutationContextFor(
    orchestrationId,
    peerId,
    actor,
    pathFor(orchestrationId, peerId),
    registry,
  );
}
function validateEntryInput(item, actor, tag, message) {
  validateActor(actor);
  validateTag(tag);
  validateFreeForm(message, 'message');
  if (!Number.isInteger(item) || item < 1) throw new Error('item must be a positive integer');
  if (!message.trim()) throw new Error('message must not be empty');
  if (tag === 'find' && !message.includes('src:')) throw new Error('find entries require src:');
}

function renderEntry(item, actor, tag, message) {
  return `${new Date().toISOString()} #${item} ${actor} ${tag} ${message.trim()}\n`;
}

export async function appendEntry(path, item, actor, tag, message, context) {
  validateEntryInput(item, actor, tag, message);
  const line = renderEntry(item, actor, tag, message);
  return withLock(path, async () => {
    const content = await readFile(path, 'utf8');
    validateAppend(content, item, tag, allowsUnreasonedDone(path, actor, context));
    await appendFile(path, line);
    return line.trim();
  });
}

export async function appendEntries(path, actor, entries, context) {
  validateActor(actor);
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('entries must not be empty');
  entries.forEach(({ item, tag, message }) => validateEntryInput(item, actor, tag, message));
  return withLock(path, async () => {
    const before = await readFile(path, 'utf8');
    let content = before;
    const lines = [];
    for (const { item, tag, message } of entries) {
      validateAppend(content, item, tag, allowsUnreasonedDone(path, actor, context));
      const line = renderEntry(item, actor, tag, message);
      lines.push(line.trim());
      content += line;
    }
    await appendFile(path, content.slice(before.length));
    return lines;
  });
}
export async function sessionCompletion(orchestrationId, peerId, content) {
  const registry = await readRegistry(orchestrationId);
  const result = completion(content, peerId === undefined ? registry.questions : {});
  if (peerId !== undefined) return result;

  const openPeers = [];
  for (const peer of registry.peers) {
    const peerContent = await readFile(subagentPath(orchestrationId, peer.id), 'utf8');
    if (!completion(peerContent).complete) openPeers.push(peer.id);
  }
  return {
    ...result,
    complete: result.complete && openPeers.length === 0,
    ...(openPeers.length === 0 ? {} : { openPeers }),
  };
}
export async function createSession(
  actor,
  goal,
  done,
  steps,
  predecessorOrchestrationId,
  continuationReason,
) {
  validateMainActor(
    actor,
    `only orchestrator may create a session; available actors: ${availableActors()}`,
  );
  validateFreeForm(goal, 'goal');
  validateFreeForm(done, 'done');
  steps.forEach((step) => validateFreeForm(step, 'plan step'));
  if ((predecessorOrchestrationId === undefined) !== (continuationReason === undefined))
    throw new Error('predecessor orchestration id is required with continuation reason');
  if (predecessorOrchestrationId !== undefined) {
    validateId(predecessorOrchestrationId, 'predecessor orchestration id');
    validateFreeForm(continuationReason, 'continuation reason');
  }

  const publish = async (predecessor, predecessorCompletion) => {
    const orchestrationId = id();
    const capabilityToken = token();
    const createdAt = new Date().toISOString();
    const header = [
      `# worklog — ${goal}`,
      '',
      `working directory: ${process.cwd()}`,
      '',
      `goal: ${goal}`,
      `done: ${done}`,
      '',
      `orchestration id: ${orchestrationId}`,
      ...(predecessorOrchestrationId === undefined
        ? []
        : [
            '',
            `predecessor orchestration id: ${predecessorOrchestrationId}`,
            `continuation reason: ${continuationReason}`,
          ]),
      '',
      'plan items',
      ...steps.map((step, i) => `  ${i + 1}. ${step}`),
      '',
      '── log ──',
      '',
    ].join('\n');
    try {
      await mkdir(sessionDir(orchestrationId), { recursive: true });
      await writeFile(mainPath(orchestrationId), header, { flag: 'wx' });
      await writeFile(
        registryPath(orchestrationId),
        JSON.stringify(
          {
            token: capabilityToken,
            peers: [],
            questions: {},
            orchestrationId,
            actor,
            goal,
            done,
            steps,
            createdAt,
            ...(predecessorOrchestrationId === undefined
              ? {}
              : { predecessorOrchestrationId, continuationReason }),
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
      if (predecessor) {
        const path = mainPath(predecessorOrchestrationId);
        const entries = predecessorCompletion.openItems.map((item) => ({
          item,
          tag: 'done',
          message: continuationReason,
        }));
        const content = await readFile(path, 'utf8');
        let after = content;
        for (const entry of entries) {
          validateAppend(after, entry.item, entry.tag, true);
          after += renderEntry(entry.item, 'orchestrator', entry.tag, entry.message);
        }
        if (after !== content) await appendFile(path, after.slice(content.length));
      }
    } catch (error) {
      await rm(sessionDir(orchestrationId), { recursive: true, force: true });
      throw error;
    }
    return {
      orchestrationId,
      capabilityToken,
      available_tags: [...tags],
      path: mainPath(orchestrationId),
      ...(predecessorOrchestrationId === undefined
        ? {}
        : { predecessorOrchestrationId, continuationReason }),
      available_actors: [...actors],
    };
  };

  if (predecessorOrchestrationId === undefined) return publish(undefined, undefined);
  try {
    await readRegistry(predecessorOrchestrationId);
  } catch {
    throw new Error('unknown predecessor orchestration id');
  }
  if (activeContinuations.has(predecessorOrchestrationId))
    throw new Error('predecessor continuation is already in progress');
  activeContinuations.add(predecessorOrchestrationId);
  try {
    return await withClaim(join(sessionDir(predecessorOrchestrationId), 'continuation'), async () =>
      withLock(mainPath(predecessorOrchestrationId), async () => {
        let predecessor;
        try {
          predecessor = await readRegistry(predecessorOrchestrationId);
        } catch {
          throw new Error('unknown predecessor orchestration id');
        }
        const predecessorContent = await readFile(mainPath(predecessorOrchestrationId), 'utf8');
        const predecessorCompletion = completion(predecessorContent, predecessor.questions);
        if (predecessorCompletion.openQuestions.length > 0)
          throw new Error('predecessor has unresolved linked questions');
        return publish(predecessor, predecessorCompletion);
      }),
    );
  } finally {
    activeContinuations.delete(predecessorOrchestrationId);
  }
}
export async function createSubagent(
  orchestrationId,
  capabilityToken,
  actor,
  goal,
  done,
  steps,
  predecessorPeerId,
  continuationReason,
) {
  validatePeerActor(actor);
  validateFreeForm(goal, 'goal');
  validateFreeForm(done, 'done');
  steps.forEach((step) => validateFreeForm(step, 'plan step'));
  const peerId = id();
  const peerToken = token();
  const createdAt = new Date().toISOString();
  const path = subagentPath(orchestrationId, peerId);
  const lineage =
    predecessorPeerId === undefined
      ? []
      : [
          '',
          `predecessor peer id: ${predecessorPeerId}`,
          `continuation reason: ${continuationReason}`,
        ];
  const header = [
    `# worklog — ${goal}`,
    '',
    `working directory: ${process.cwd()}`,
    '',
    `goal: ${goal}`,
    `done: ${done}`,
    '',
    `orchestration id: ${orchestrationId}`,
    `peer id: ${peerId}`,
    `actor: ${actor}`,
    ...lineage,
    '',
    'plan items',
    ...steps.map((step, i) => `  ${i + 1}. ${step}`),
    '',
    '── log ──',
    '',
  ].join('\n');
  await withLock(registryPath(orchestrationId), async () => {
    const registry = await authorized(orchestrationId, capabilityToken);
    await writeFile(path, header, { flag: 'wx' });
    registry.peers.push({
      id: peerId,
      actor,
      token: peerToken,
      createdAt,
      ...(predecessorPeerId === undefined ? {} : { predecessorPeerId, continuationReason }),
    });
    await writeFile(registryPath(orchestrationId), JSON.stringify(registry, null, 2));
  });
  return {
    orchestrationId,
    peerId,
    capabilityToken: peerToken,
    path,
    actor,
    ...(predecessorPeerId === undefined ? {} : { predecessorPeerId, continuationReason }),
  };
}
export async function replaceSubagent(
  orchestrationId,
  capabilityToken,
  predecessorPeerId,
  actor,
  goal,
  done,
  steps,
  continuationReason,
) {
  validateFreeForm(continuationReason, 'continuation reason');
  validatePeerActor(actor);
  validateFreeForm(goal, 'goal');
  validateFreeForm(done, 'done');
  steps.forEach((step) => validateFreeForm(step, 'plan step'));
  return withLock(registryPath(orchestrationId), async () => {
    const registry = await authorized(orchestrationId, capabilityToken);
    const predecessor = peerFor(registry, predecessorPeerId);
    if (!predecessor) throw new Error('unknown predecessor peer');
    const predecessorPath = subagentPath(orchestrationId, predecessorPeerId);
    const content = await readFile(predecessorPath, 'utf8');
    const predecessorCompletion = completion(content);
    if (predecessorCompletion.complete) throw new Error('predecessor peer is already complete');

    const peerId = id();
    const peerToken = token();
    const createdAt = new Date().toISOString();
    const path = subagentPath(orchestrationId, peerId);
    const header = [
      `# worklog — ${goal}`,
      '',
      `working directory: ${process.cwd()}`,
      '',
      `goal: ${goal}`,
      `done: ${done}`,
      '',
      `orchestration id: ${orchestrationId}`,
      `peer id: ${peerId}`,
      `actor: ${actor}`,
      '',
      `predecessor peer id: ${predecessorPeerId}`,
      `continuation reason: ${continuationReason}`,
      '',
      'plan items',
      ...steps.map((step, i) => `  ${i + 1}. ${step}`),
      '',
      '── log ──',
      '',
    ].join('\n');
    await writeFile(path, header, { flag: 'wx' });

    const replacementContext = replacementContextFor(
      orchestrationId,
      predecessorPeerId,
      predecessorPath,
      registry,
    );
    const completionEntries = predecessorCompletion.openItems.map((item) => ({
      item,
      tag: 'done',
      message: `continuation moved to peer ${peerId} at ${path}; predecessor replaced by ${actor}: ${continuationReason}`,
    }));
    if (completionEntries.length > 0)
      await appendEntries(predecessorPath, 'orchestrator', completionEntries, replacementContext);

    registry.peers.push({
      id: peerId,
      actor,
      token: peerToken,
      createdAt,
      predecessorPeerId,
      continuationReason,
    });
    await writeFile(registryPath(orchestrationId), JSON.stringify(registry, null, 2));
    return {
      orchestrationId,
      peerId,
      capabilityToken: peerToken,
      path,
      actor,
      predecessorPeerId,
      continuationReason,
    };
  });
}
function goalFromContent(content) {
  return content.match(/^goal: (.*)$/m)?.[1];
}

function workingDirectoryFromContent(content) {
  return content.match(/^working directory: (.+)$/m)?.[1]?.trim();
}

function entriesFromContent(content) {
  return content
    .split('\n')
    .filter((line) => /^\S+ #\d+ \S+ \S+ /.test(line))
    .map((line) => {
      const [, time, item, actor, tag, message] = line.match(/^(\S+) #(\d+) (\S+) (\S+) (.*)$/);
      return { time, item: Number(item), actor, tag, message };
    });
}

function planFromContent(content) {
  return content
    .split('\n')
    .map((line) => line.match(/^( {2})\d+\. (.*)$/)?.[2])
    .filter((step) => step !== undefined);
}

function entryTimeValue(time, createdAt) {
  if (typeof time !== 'string') return NaN;
  const absolute = Date.parse(time);
  if (Number.isFinite(absolute)) return absolute;
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || !createdAt) return NaN;
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

function durationValue(createdAt, entries, completedAt) {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return null;
  const latestEntry = (Array.isArray(entries) ? entries : [])
    .map((entry) => entryTimeValue(entry?.time, createdAt))
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), -Infinity);
  const completed = Date.parse(completedAt);
  const end = Number.isFinite(completed) ? Math.max(completed, latestEntry) : latestEntry;
  if (!Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.floor((end - started) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

async function discoverSessionsInternal() {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { sessions: [] };
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{8}$/.test(entry.name)) continue;
    try {
      const registry = await readRegistry(entry.name);
      const content = await readFile(mainPath(entry.name), 'utf8');
      const mainEntries = entriesFromContent(content);
      const mainStat = await stat(mainPath(entry.name));
      const createdAt = registry.createdAt || mainStat.birthtime.toISOString();
      const result = await sessionCompletion(entry.name, undefined, content);
      const peers = await Promise.all(
        registry.peers.map(
          async ({
            id,
            actor,
            createdAt: peerCreatedAt,
            completedAt,
            predecessorPeerId,
            continuationReason,
          }) => {
            const peerPath = subagentPath(entry.name, id);
            const peerContent = await readFile(peerPath, 'utf8');
            const peerBirthtime = (await stat(peerPath)).birthtime;
            const peerEntries = entriesFromContent(peerContent);
            const peerComplete = completion(peerContent).complete;
            return {
              id,
              actor,
              ...(peerCreatedAt === undefined ? {} : { createdAt: peerCreatedAt }),
              ...(completedAt === undefined ? {} : { completedAt }),
              ...(peerCreatedAt === undefined && Number.isFinite(peerBirthtime.getTime())
                ? {
                    birthtime: peerBirthtime.toISOString(),
                    birthtimeSource: 'filesystem birthtime fallback',
                  }
                : {}),
              goal: goalFromContent(peerContent),
              plan: planFromContent(peerContent),
              entries: peerEntries,
              complete: peerComplete,
              duration: peerComplete
                ? durationValue(peerCreatedAt, peerEntries, completedAt)
                : null,
              ...(predecessorPeerId === undefined ? {} : { predecessorPeerId, continuationReason }),
            };
          },
        ),
      );
      const directoryStat = await stat(sessionDir(entry.name));
      sessions.push({
        orchestrationId: entry.name,
        path: mainPath(entry.name),
        workingDirectory: workingDirectoryFromContent(content),
        actor: typeof registry.actor === 'string' ? registry.actor : 'orchestrator',
        goal: registry.goal,
        done: registry.done,
        steps: registry.steps,
        plan: registry.steps,
        complete: result.complete,
        createdAt,
        ...(registry.updatedAt
          ? { updatedAt: registry.updatedAt }
          : { updatedAt: directoryStat.mtime.toISOString() }),
        ...(registry.completedAt ? { completedAt: registry.completedAt } : {}),
        duration: result.complete
          ? durationValue(createdAt, mainEntries, registry.completedAt)
          : null,
        peers,
        entries: mainEntries,
        ...(registry.predecessorOrchestrationId === undefined
          ? {}
          : {
              predecessorOrchestrationId: registry.predecessorOrchestrationId,
              continuationReason: registry.continuationReason,
            }),
      });
    } catch {
      /* ignore incomplete directories */
    }
  }
  return { sessions };
}
export async function discoverSessions(actor) {
  validateActor(actor);
  if (actor !== 'orchestrator') throw new Error('only orchestrator may discover sessions');
  const { sessions } = await discoverSessionsInternal();
  return {
    sessions: sessions.map((session) => ({
      orchestrationId: session.orchestrationId,
      path: session.path,
      goal: session.goal,
      done: session.done,
      steps: session.steps,
      plan: session.plan,
      actor: session.actor,
      complete: session.complete,
      createdAt: session.createdAt,
      peers: session.peers.map(
        ({
          id,
          actor: peerActor,
          createdAt,
          completedAt,
          birthtime,
          birthtimeSource,
          goal,
          complete,
          predecessorPeerId,
          continuationReason,
        }) => ({
          id,
          actor: peerActor,
          ...(createdAt === undefined ? {} : { createdAt }),
          ...(completedAt === undefined ? {} : { completedAt }),
          ...(birthtime === undefined ? {} : { birthtime }),
          ...(birthtimeSource === undefined ? {} : { birthtimeSource }),
          goal,
          complete,
          ...(predecessorPeerId === undefined ? {} : { predecessorPeerId, continuationReason }),
        }),
      ),
    })),
  };
}
export async function discoverViewerSessions() {
  const { sessions } = await discoverSessionsInternal();
  return {
    sessions: sessions.map((session) => {
      const sanitized = { ...session };
      delete sanitized.path;
      return sanitized;
    }),
  };
}
export async function readViewerWorklog(orchestrationId) {
  validateId(orchestrationId, 'orchestration id');
  const { sessions } = await discoverViewerSessions();
  const session = sessions.find((candidate) => candidate.orchestrationId === orchestrationId);
  if (!session) throw new Error('unknown orchestration id');
  return session;
}
export async function closeWorklog(
  orchestrationId,
  capabilityToken,
  peerId,
  item,
  actor,
  message,
  context,
) {
  validateFreeForm(message, 'message');
  if (!message.trim()) throw new Error('message must not be empty');
  await authorized(
    orchestrationId,
    capabilityToken,
    peerId,
    peerId === undefined ? 'session' : 'peer',
    actor,
  );
  const path = pathFor(orchestrationId, peerId);
  return withLock(registryPath(orchestrationId), async () => {
    return withLock(path, async () => {
      const before = await readFile(path, 'utf8');
      const alreadyComplete = completion(before).complete;
      if (alreadyComplete) {
        const result = await sessionCompletion(orchestrationId, peerId, before);
        return { closed: result.complete, completion: result };
      }
      validateAppend(before, item, 'done', allowsUnreasonedDone(path, actor, context));
      const after = `${before}${new Date().toISOString()} #${item} ${actor} done ${message.trim()}\n`;
      const result = await sessionCompletion(orchestrationId, peerId, after);
      if (!result.complete) return { closed: false, completion: result };
      await appendFile(path, after.slice(before.length));
      const registry = await readRegistry(orchestrationId);
      if (peerId !== undefined) {
        const peer = peerFor(registry, peerId);
        if (peer) peer.completedAt = new Date().toISOString();
      } else {
        registry.completedAt = new Date().toISOString();
      }
      await writeFile(registryPath(orchestrationId), JSON.stringify(registry, null, 2));
      return { entry: after.slice(before.length).trim(), closed: true, completion: result };
    });
  });
}
