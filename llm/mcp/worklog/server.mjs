import { randomBytes } from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile, open, rm, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const root = process.env.WORKLOG_DIR || '/tmp/worklogs';
const actors = new Set(['orchestrator', 'investigator', 'ideator', 'executor', 'tester', 'reviewer', 'critic', 'maintainer', 'researcher']);
const availableActors = () => [...actors].join(', ');
const tags = new Set(['think', 'find', 'decide', 'done', 'plan', 'question', 'answer', 'note']);
const queues = new Map();
const staleLockMs = Number(process.env.WORKLOG_LOCK_STALE_MS || 30_000);
const lockWaitMs = Number(process.env.WORKLOG_LOCK_WAIT_MS || 10_000);
const id = () => randomBytes(4).toString('hex');
const token = () => randomBytes(32).toString('hex');
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const fail = (message) => ({ isError: true, ...text(message) });
const sessionDir = (orchestrationId) => join(root, orchestrationId);
const registryPath = (orchestrationId) => join(sessionDir(orchestrationId), 'session.json');
const mainPath = (orchestrationId) => join(sessionDir(orchestrationId), `${orchestrationId}-main.txt`);
const subagentPath = (orchestrationId, peerId) => join(sessionDir(orchestrationId), `${orchestrationId}-subagent-${peerId}.txt`);
const lockPath = (path) => `${path}.lock`;

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function lockOwner(path) { try { return (await readFile(join(lockPath(path), 'owner'), 'utf8')).trim(); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; } }

export async function withLock(key, fn) {
  const hadLocalQueue = queues.has(key);
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  queues.set(key, queued);
  await previous;
  const lock = lockPath(key);
  const owner = token();
  const started = Date.now();
  let acquired = false;
  try {
    for (;;) {
      try {
        await mkdir(lock);
        await writeFile(join(lock, 'owner'), owner, { flag: 'wx' });
        acquired = true;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let stale = false;
        try { stale = Date.now() - (await stat(lock)).mtimeMs > staleLockMs; }
        catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
        if (stale && !hadLocalQueue) {
          const replacement = `${lock}.stale-${token()}`;
          try { await rename(lock, replacement); await rm(replacement, { recursive: true, force: true }); }
          catch (renameError) { if (!['ENOENT', 'EEXIST'].includes(renameError.code)) throw renameError; }
          continue;
        }
        if (Date.now() - started >= lockWaitMs) throw new Error(`timed out waiting for lock: ${key}`);
        await sleep(10);
      }
    }
    return await fn();
  } finally {
    if (acquired && (await lockOwner(key)) === owner) await rm(lock, { recursive: true, force: true });
    release();
    if (queues.get(key) === queued) queues.delete(key);
  }
}

async function readRegistry(orchestrationId) { return JSON.parse(await readFile(registryPath(orchestrationId), 'utf8')); }
function validateActor(actor) { if (!actors.has(actor)) throw new Error(`invalid actor "${actor}"; available actors: ${availableActors()}`); }
function validateTag(tag) { if (!tags.has(tag)) throw new Error(`invalid tag: ${tag}`); }
function validateId(value, name) { if (!/^[a-f0-9]{8}$/.test(value)) throw new Error(`invalid ${name}`); }
function validateFreeForm(value, name) {
  if (/\r|\n/.test(value)) throw new Error(`${name} must not contain carriage returns or newlines`);
}
function pathFor(orchestrationId, peerId) { return peerId === undefined ? mainPath(orchestrationId) : subagentPath(orchestrationId, peerId); }
function peerFor(registry, peerId) { return peerId === undefined ? undefined : registry.peers.find((peer) => peer.id === peerId); }
async function authorized(orchestrationId, capabilityToken, peerId, kind = 'session', actor) {
  if (actor !== undefined) validateActor(actor);
  validateId(orchestrationId, 'orchestration id');
  const registry = await readRegistry(orchestrationId);
  if (peerId === undefined) {
    if (registry.token !== capabilityToken) throw new Error('invalid session capability token');
    if (actor !== undefined && actor !== 'orchestrator') throw new Error('only orchestrator may use the session capability');
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
  if (kind !== 'peer' && kind !== 'peer-or-session') throw new Error('invalid peer capability token');
  if (peer.token !== capabilityToken) throw new Error('invalid peer capability token');
  if (actor !== undefined && peer.actor !== actor) throw new Error('actor does not own peer');
  return registry;
}
function planItems(content) {
  return [...content.matchAll(/^\s+(\d+)\. /gm)].map(([, item]) => Number(item));
}
function entryItems(content, tag) {
  return new Set([...content.matchAll(new RegExp(`^\\S+ #(\\d+) \\S+ ${tag} `, 'gm'))].map(([, item]) => Number(item)));
}
function completion(content, linkedQuestions = {}) {
  const planned = planItems(content);
  const done = entryItems(content, 'done');
  const openItems = planned.filter(item => !done.has(item));
  const localQuestions = new Set([...content.matchAll(/^\S+ #\d+ \S+ question \[question:([^ ]+)/gm)].map(([, questionId]) => questionId));
  const localAnswers = new Set([...content.matchAll(/^\S+ #\d+ \S+ answer \[answer:([^ ]+)/gm)].map(([, questionId]) => questionId));
  const openQuestions = Object.entries(linkedQuestions).filter(([, question]) => !question.answered).map(([questionId]) => questionId);
  for (const questionId of localQuestions) if (!localAnswers.has(questionId) && !openQuestions.includes(questionId)) openQuestions.push(questionId);
  return { complete: openItems.length === 0 && openQuestions.length === 0, openItems, openQuestions };
}
function validateAppend(content, item, tag) {
  const planned = planItems(content);
  const done = entryItems(content, 'done');
  if (tag === 'plan') throw new Error('plan entries are only allowed during session or subagent creation');
  if (!planned.includes(item)) throw new Error(`unknown plan item: ${item}`);
  if (done.has(item)) throw new Error(`plan item already closed: ${item}`);
  if (tag === 'done') {
    const earlierOpen = planned.some(plannedItem => plannedItem < item && !done.has(plannedItem));
    if (earlierOpen) throw new Error(`cannot close plan item out of order: ${item}`);
    const reasoned = new Set([...entryItems(content, 'think'), ...entryItems(content, 'decide')]);
    if (!reasoned.has(item)) throw new Error(`plan item requires prior reasoning: ${item}`);
  }
}
async function appendEntry(path, item, actor, tag, message) {
  validateActor(actor); validateTag(tag); validateFreeForm(message, 'message');
  if (!Number.isInteger(item) || item < 1) throw new Error('item must be a positive integer');
  if (!message.trim()) throw new Error('message must not be empty');
  if (tag === 'find' && !message.includes('src:')) throw new Error('find entries require src:');
  const line = `${new Date().toTimeString().slice(0, 8)} #${item} ${actor} ${tag} ${message.trim()}\n`;
  return withLock(path, async () => {
    const content = await readFile(path, 'utf8');
    validateAppend(content, item, tag);
    await appendFile(path, line);
    return line.trim();
  });
}
async function createSession(actor, goal, done, steps) {
  if (actor !== 'orchestrator') throw new Error(`only orchestrator may create a session; available actors: ${availableActors()}`);
  validateFreeForm(goal, 'goal'); validateFreeForm(done, 'done');
  steps.forEach((step) => validateFreeForm(step, 'plan step'));
  const orchestrationId = id(); const capabilityToken = token();
  await mkdir(sessionDir(orchestrationId), { recursive: true });
  const header = [`# worklog — ${goal}`, '', `working directory: ${process.cwd()}`, '', `goal: ${done}`, '', `orchestration id: ${orchestrationId}`, '', 'plan items', ...steps.map((step, i) => `  ${i + 1}. ${step}`), '', '── log ──', ''].join('\n');
  await writeFile(mainPath(orchestrationId), header, { flag: 'wx' });
  await writeFile(registryPath(orchestrationId), JSON.stringify({ token: capabilityToken, peers: [], questions: {} }, null, 2), { flag: 'wx' });
  return { orchestrationId, capabilityToken, path: mainPath(orchestrationId) };
}
async function createSubagent(orchestrationId, capabilityToken, actor, goal, done, steps) {
  validateActor(actor); validateFreeForm(goal, 'goal'); validateFreeForm(done, 'done');
  steps.forEach((step) => validateFreeForm(step, 'plan step'));
  const peerId = id(); const peerToken = token(); const path = subagentPath(orchestrationId, peerId);
  const header = [`# worklog — ${goal}`, '', `working directory: ${process.cwd()}`, '', `goal: ${done}`, '', `orchestration id: ${orchestrationId}`, `peer id: ${peerId}`, `actor: ${actor}`, '', 'plan items', ...steps.map((step, i) => `  ${i + 1}. ${step}`), '', '── log ──', ''].join('\n');
  await withLock(registryPath(orchestrationId), async () => {
    const registry = await authorized(orchestrationId, capabilityToken);
    await writeFile(path, header, { flag: 'wx' });
    registry.peers.push({ id: peerId, actor, token: peerToken });
    await writeFile(registryPath(orchestrationId), JSON.stringify(registry, null, 2));
  });
  return { orchestrationId, peerId, capabilityToken: peerToken, path };
}

const server = new McpServer({ name: 'delegation-worklog', version: '1.1.0' }, { instructions: 'The session token controls main-log access and orchestrator inspection/questions. Each peer receives a distinct token for its own append, answer, close, and read operations.' });
const common = { orchestrationId: z.string(), capabilityToken: z.string() };
server.registerTool('worklog_session_create', { description: 'Create a server-owned orchestration session and main append-only log.', inputSchema: z.object({ actor: z.string(), goal: z.string(), done: z.string(), steps: z.array(z.string()).min(1) }) }, async ({ actor, goal, done, steps }) => { try { return text(await createSession(actor, goal, done, steps)); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_subagent_create', { description: 'Create a child log and return a distinct peer capability token.', inputSchema: z.object({ ...common, actor: z.string(), goal: z.string(), done: z.string(), steps: z.array(z.string()).min(1) }) }, async (args) => { try { return text(await createSubagent(args.orchestrationId, args.capabilityToken, args.actor, args.goal, args.done, args.steps)); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_append', { description: 'Append to the main log with the orchestrator session token or to a peer log with that peer token.', inputSchema: z.object({ ...common, peerId: z.string().optional(), item: z.number().int().positive(), actor: z.string(), tag: z.string(), message: z.string() }) }, async (args) => { try { const registry = await authorized(args.orchestrationId, args.capabilityToken, args.peerId, args.peerId === undefined ? 'session' : 'peer', args.actor); return text(await appendEntry(pathFor(args.orchestrationId, args.peerId), args.item, args.actor, args.tag, args.message)); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_read', { description: 'Read a main log with the session token, a peer log with that peer token, or a registered child log with the session token.', inputSchema: z.object({ ...common, peerId: z.string().optional(), since: z.number().int().nonnegative().optional() }) }, async ({ orchestrationId, capabilityToken, peerId, since = 0 }) => { try { await authorized(orchestrationId, capabilityToken, peerId, peerId === undefined ? 'session' : 'peer-or-session'); const bytes = Buffer.from(await readFile(pathFor(orchestrationId, peerId), 'utf8')); return text({ content: bytes.subarray(since).toString('utf8'), next: bytes.length }); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_ask', { description: 'Create a linked question for a registered target peer using the orchestrator session token.', inputSchema: z.object({ ...common, sourcePeerId: z.string().optional(), targetPeerId: z.string(), item: z.number().int().positive(), actor: z.string(), question: z.string() }) }, async (args) => { try { const registry = await authorized(args.orchestrationId, args.capabilityToken, undefined, 'session', args.actor); if (args.sourcePeerId) peerFor(registry, args.sourcePeerId) || (() => { throw new Error('unknown peer'); })(); peerFor(registry, args.targetPeerId) || (() => { throw new Error('unknown peer'); })(); const questionId = id(); const message = `[question:${questionId} source=${args.sourcePeerId ?? 'main'} target=${args.targetPeerId}] ${args.question}`; const result = await appendEntry(pathFor(args.orchestrationId, undefined), args.item, args.actor, 'question', message); await withLock(registryPath(args.orchestrationId), async () => { const current = await authorized(args.orchestrationId, args.capabilityToken); current.questions[questionId] = { sourcePeerId: args.sourcePeerId ?? null, targetPeerId: args.targetPeerId, answered: false }; await writeFile(registryPath(args.orchestrationId), JSON.stringify(current, null, 2)); }); return text({ questionId, entry: result }); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_answer', { description: 'Answer a question with the target peer token.', inputSchema: z.object({ ...common, peerId: z.string(), questionId: z.string(), item: z.number().int().positive(), actor: z.string(), answer: z.string() }) }, async (args) => { try { const result = await withLock(registryPath(args.orchestrationId), async () => { const registry = await authorized(args.orchestrationId, args.capabilityToken, args.peerId, 'peer', args.actor); const question = registry.questions[args.questionId]; if (!question) throw new Error('unknown question id'); if (question.answered) throw new Error('question already answered'); if (question.targetPeerId !== args.peerId) throw new Error('peer is not question target'); const message = `[answer:${args.questionId} source=${question.targetPeerId ?? 'main'} target=${question.sourcePeerId ?? 'main'}] ${args.answer}`; const entry = await appendEntry(pathFor(args.orchestrationId, args.peerId), args.item, args.actor, 'answer', message); question.answered = true; await writeFile(registryPath(args.orchestrationId), JSON.stringify(registry, null, 2)); return { questionId: args.questionId, entry }; }); return text(result); } catch (e) { return fail(e.message); } });
async function sessionCompletion(orchestrationId, peerId, content) {
  const registry = await readRegistry(orchestrationId);
  return completion(content, peerId === undefined ? registry.questions : {});
}
async function closeWorklog(orchestrationId, capabilityToken, peerId, item, actor, message) {
  validateFreeForm(message, 'message');
  if (!message.trim()) throw new Error('message must not be empty');
  await authorized(orchestrationId, capabilityToken, peerId, peerId === undefined ? 'session' : 'peer', actor);
  const path = pathFor(orchestrationId, peerId);
  return withLock(path, async () => {
    const before = await readFile(path, 'utf8');
    validateAppend(before, item, 'done');
    const after = `${before}${new Date().toTimeString().slice(0, 8)} #${item} ${actor} done ${message.trim()}\n`;
    const result = await sessionCompletion(orchestrationId, peerId, after);
    if (!result.complete) return { closed: false, completion: result };
    const entry = after.slice(before.length).trim();
    await appendFile(path, after.slice(before.length));
    const content = await readFile(path, 'utf8');
    return { entry, closed: true, completion: await sessionCompletion(orchestrationId, peerId, content) };
  });
}
server.registerTool('worklog_status', { description: 'Inspect a main log with the session token or a registered peer log with its peer or session token.', inputSchema: z.object({ ...common, peerId: z.string().optional() }) }, async ({ orchestrationId, capabilityToken, peerId }) => { try { await authorized(orchestrationId, capabilityToken, peerId, peerId === undefined ? 'session' : 'peer-or-session'); const content = await readFile(pathFor(orchestrationId, peerId), 'utf8'); return text({ path: pathFor(orchestrationId, peerId), bytes: Buffer.byteLength(content), content, completion: await sessionCompletion(orchestrationId, peerId, content) }); } catch (e) { return fail(e.message); } });
server.registerTool('worklog_close', { description: 'Append a final done entry only when the session or peer is complete.', inputSchema: z.object({ ...common, peerId: z.string().optional(), item: z.number().int().positive(), actor: z.string(), message: z.string() }) }, async (args) => { try { return text(await closeWorklog(args.orchestrationId, args.capabilityToken, args.peerId, args.item, args.actor, args.message)); } catch (e) { return fail(e.message); } });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void serveStdio(() => server);
  console.error('delegation-worklog MCP server running on stdio');
}

export { createSession, createSubagent, authorized, pathFor, appendEntry, completion, validateAppend, closeWorklog, sessionCompletion };
