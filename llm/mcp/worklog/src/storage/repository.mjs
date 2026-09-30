import { randomBytes } from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { withLock } from './locks.mjs';
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
    context.peerId !== undefined &&
    context.actor === actor &&
    context.path === path
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
  return `${new Date().toTimeString().slice(0, 8)} #${item} ${actor} ${tag} ${message.trim()}\n`;
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
    try {
      await readRegistry(predecessorOrchestrationId);
    } catch {
      throw new Error('unknown predecessor orchestration id');
    }
    validateFreeForm(continuationReason, 'continuation reason');
  }
  const orchestrationId = id();
  const capabilityToken = token();
  const createdAt = new Date().toISOString();
  await mkdir(sessionDir(orchestrationId), { recursive: true });
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

export async function discoverSessions(actor) {
  validateActor(actor);
  if (actor !== 'orchestrator') throw new Error('only orchestrator may discover sessions');
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
      const plan = registry.steps;
      const result = await sessionCompletion(entry.name, undefined, content);
      const peers = await Promise.all(
        registry.peers.map(
          async ({ id, actor, createdAt, completedAt, predecessorPeerId, continuationReason }) => {
            const peerPath = subagentPath(entry.name, id);
            const peerContent = await readFile(peerPath, 'utf8');
            const peerBirthtime = (await stat(peerPath)).birthtime;
            return {
              id,
              actor,
              ...(createdAt === undefined ? {} : { createdAt }),
              ...(completedAt === undefined ? {} : { completedAt }),
              ...(createdAt === undefined && Number.isFinite(peerBirthtime.getTime())
                ? {
                    birthtime: peerBirthtime.toISOString(),
                    birthtimeSource: 'filesystem birthtime fallback',
                  }
                : {}),
              goal: goalFromContent(peerContent),
              complete: completion(peerContent).complete,
              ...(predecessorPeerId === undefined ? {} : { predecessorPeerId, continuationReason }),
            };
          },
        ),
      );
      sessions.push({
        orchestrationId: entry.name,
        path: mainPath(entry.name),
        actor: typeof registry.actor === 'string' ? registry.actor : 'orchestrator',
        goal: registry.goal,
        done: registry.done,
        steps: registry.steps,
        plan,
        complete: result.complete,
        createdAt: registry.createdAt || (await stat(mainPath(entry.name))).birthtime.toISOString(),
        peers,
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
      const after = `${before}${new Date().toTimeString().slice(0, 8)} #${item} ${actor} done ${message.trim()}\n`;
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
