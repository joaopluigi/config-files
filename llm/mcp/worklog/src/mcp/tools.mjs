import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { withLock } from '../storage/locks.mjs';
import {
  registryPath,
  pathFor,
  authorized,
  authorizedPeerMutation,
  appendEntry,
  appendEntries,
  createSession,
  createSubagent,
  closeWorklog,
  sessionCompletion,
  discoverSessions,
  replaceSubagent,
} from '../storage/repository.mjs';
const text = (value) => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
});
const fail = (message) => ({ isError: true, ...text(message) });
const id = () => randomBytes(4).toString('hex');
const common = { orchestrationId: z.string(), capabilityToken: z.string() };
export function createServer() {
  const server = new McpServer(
    { name: 'delegation-worklog', version: '1.1.0' },
    {
      instructions:
        'The session token controls main-log access and orchestrator inspection/questions. Each peer receives a distinct token for its own append, answer, close, and read operations.',
    },
  );
  server.registerTool(
    'worklog_session_create',
    {
      description: 'Create a server-owned orchestration session and main append-only log.',
      inputSchema: z.object({
        actor: z.string(),
        goal: z.string(),
        done: z.string(),
        steps: z.array(z.string()).min(1),
        predecessorOrchestrationId: z.string().optional(),
        continuationReason: z.string().optional(),
      }),
    },
    async ({ actor, goal, done, steps, predecessorOrchestrationId, continuationReason }) => {
      try {
        return text(
          await createSession(
            actor,
            goal,
            done,
            steps,
            predecessorOrchestrationId,
            continuationReason,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_session_status',
    {
      description: 'Discover sessions as metadata without capability secrets.',
      inputSchema: z.object({ actor: z.string() }),
    },
    async ({ actor }) => {
      try {
        return text(await discoverSessions(actor));
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_peer_create',
    {
      description: 'Create a child log and return a distinct peer capability token.',
      inputSchema: z.object({
        ...common,
        actor: z.string(),
        goal: z.string(),
        done: z.string(),
        steps: z.array(z.string()).min(1),
      }),
    },
    async (args) => {
      try {
        return text(
          await createSubagent(
            args.orchestrationId,
            args.capabilityToken,
            args.actor,
            args.goal,
            args.done,
            args.steps,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_subagent_replace',
    {
      description: 'Replace an incomplete peer with isolated credentials and preserved lineage.',
      inputSchema: z.object({
        ...common,
        predecessorPeerId: z.string(),
        actor: z.string(),
        goal: z.string(),
        done: z.string(),
        steps: z.array(z.string()).min(1),
        continuationReason: z.string(),
      }),
    },
    async (args) => {
      try {
        return text(
          await replaceSubagent(
            args.orchestrationId,
            args.capabilityToken,
            args.predecessorPeerId,
            args.actor,
            args.goal,
            args.done,
            args.steps,
            args.continuationReason,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_peer_replace',
    {
      description: 'Replace an incomplete peer with isolated credentials and preserved lineage.',
      inputSchema: z.object({
        ...common,
        predecessorPeerId: z.string(),
        actor: z.string(),
        goal: z.string(),
        done: z.string(),
        steps: z.array(z.string()).min(1),
        continuationReason: z.string(),
      }),
    },
    async (args) => {
      try {
        return text(
          await replaceSubagent(
            args.orchestrationId,
            args.capabilityToken,
            args.predecessorPeerId,
            args.actor,
            args.goal,
            args.done,
            args.steps,
            args.continuationReason,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_append',
    {
      description:
        'Append to the main log with the orchestrator session token or to a peer log with that peer token. A tag=done append terminally completes the addressed plan item; do not call worklog_close afterward for that same item. worklog_close is reserved for finalizing the entire session or peer log once all items and linked questions are complete.',
      inputSchema: z.object({
        ...common,
        peerId: z.string().optional(),
        item: z.number().int().positive(),
        actor: z.string(),
        tag: z.string(),
        message: z.string(),
      }),
    },
    async (args) => {
      try {
        const context =
          args.peerId === undefined
            ? await authorized(
                args.orchestrationId,
                args.capabilityToken,
                undefined,
                'session',
                args.actor,
              )
            : await authorizedPeerMutation(
                args.orchestrationId,
                args.capabilityToken,
                args.peerId,
                args.actor,
              );
        return text(
          await appendEntry(
            pathFor(args.orchestrationId, args.peerId),
            args.item,
            args.actor,
            args.tag,
            args.message,
            context,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_append_batch',
    {
      description:
        'Append a non-empty ordered batch to the main or peer log using one shared actor. The full batch is validated before one locked write.',
      inputSchema: z.object({
        ...common,
        peerId: z.string().optional(),
        actor: z.string(),
        entries: z
          .array(
            z.object({
              item: z.number().int().positive(),
              tag: z.string(),
              message: z.string(),
            }),
          )
          .min(1),
      }),
    },
    async (args) => {
      try {
        const context =
          args.peerId === undefined
            ? await authorized(
                args.orchestrationId,
                args.capabilityToken,
                undefined,
                'session',
                args.actor,
              )
            : await authorizedPeerMutation(
                args.orchestrationId,
                args.capabilityToken,
                args.peerId,
                args.actor,
              );
        return text(
          await appendEntries(
            pathFor(args.orchestrationId, args.peerId),
            args.actor,
            args.entries,
            context,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_read',
    {
      description:
        'Read a main log with the session token, a peer log with that peer token, or a registered child log with the session token.',
      inputSchema: z.object({
        ...common,
        peerId: z.string().optional(),
        since: z.number().int().nonnegative().optional(),
      }),
    },
    async ({ orchestrationId, capabilityToken, peerId, since = 0 }) => {
      try {
        await authorized(
          orchestrationId,
          capabilityToken,
          peerId,
          peerId === undefined ? 'session' : 'peer-or-session',
        );
        const bytes = Buffer.from(await readFile(pathFor(orchestrationId, peerId), 'utf8'));
        return text({ content: bytes.subarray(since).toString('utf8'), next: bytes.length });
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_ask',
    {
      description:
        'Create a linked question for a registered target peer using the orchestrator session token.',
      inputSchema: z.object({
        ...common,
        sourcePeerId: z.string().optional(),
        targetPeerId: z.string(),
        item: z.number().int().positive(),
        actor: z.string(),
        question: z.string(),
      }),
    },
    async (args) => {
      try {
        const registry = await authorized(
          args.orchestrationId,
          args.capabilityToken,
          undefined,
          'session',
          args.actor,
        );
        if (args.sourcePeerId && !registry.peers.find((peer) => peer.id === args.sourcePeerId))
          throw new Error('unknown peer');
        if (!registry.peers.find((peer) => peer.id === args.targetPeerId))
          throw new Error('unknown peer');
        const questionId = id();
        const entry = await appendEntry(
          pathFor(args.orchestrationId),
          args.item,
          args.actor,
          'question',
          `[question:${questionId} source=${args.sourcePeerId ?? 'main'} target=${args.targetPeerId}] ${args.question}`,
        );
        await withLock(registryPath(args.orchestrationId), async () => {
          const current = await authorized(args.orchestrationId, args.capabilityToken);
          current.questions[questionId] = {
            sourcePeerId: args.sourcePeerId ?? null,
            targetPeerId: args.targetPeerId,
            answered: false,
          };
          await writeFile(registryPath(args.orchestrationId), JSON.stringify(current, null, 2));
        });
        return text({ questionId, entry });
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_answer',
    {
      description: 'Answer a question with the target peer token.',
      inputSchema: z.object({
        ...common,
        peerId: z.string(),
        questionId: z.string(),
        item: z.number().int().positive(),
        actor: z.string(),
        answer: z.string(),
      }),
    },
    async (args) => {
      try {
        const result = await withLock(registryPath(args.orchestrationId), async () => {
          const registry = await authorized(
            args.orchestrationId,
            args.capabilityToken,
            args.peerId,
            'peer',
            args.actor,
          );
          const question = registry.questions[args.questionId];
          if (!question) throw new Error('unknown question id');
          if (question.answered) throw new Error('question already answered');
          if (question.targetPeerId !== args.peerId) throw new Error('peer is not question target');
          const entry = await appendEntry(
            pathFor(args.orchestrationId, args.peerId),
            args.item,
            args.actor,
            'answer',
            `[answer:${args.questionId} source=${question.targetPeerId ?? 'main'} target=${question.sourcePeerId ?? 'main'}] ${args.answer}`,
          );
          question.answered = true;
          await writeFile(registryPath(args.orchestrationId), JSON.stringify(registry, null, 2));
          return { questionId: args.questionId, entry };
        });
        return text(result);
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_status',
    {
      description:
        'Inspect a main log with the session token or a registered peer log with its peer or session token.',
      inputSchema: z.object({ ...common, peerId: z.string().optional() }),
    },
    async ({ orchestrationId, capabilityToken, peerId }) => {
      try {
        await authorized(
          orchestrationId,
          capabilityToken,
          peerId,
          peerId === undefined ? 'session' : 'peer-or-session',
        );
        const content = await readFile(pathFor(orchestrationId, peerId), 'utf8');
        return text({
          path: pathFor(orchestrationId, peerId),
          bytes: Buffer.byteLength(content),
          content,
          completion: await sessionCompletion(orchestrationId, peerId, content),
        });
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  server.registerTool(
    'worklog_close',
    {
      description:
        'Finalize the entire session or peer log by appending its final done entry, only when every plan item and linked question is complete. This is whole-log completion, not item completion; do not call it after worklog_append(tag=done) for the same item.',
      inputSchema: z.object({
        ...common,
        peerId: z.string().optional(),
        item: z.number().int().positive(),
        actor: z.string(),
        message: z.string(),
      }),
    },
    async (args) => {
      try {
        const context =
          args.peerId === undefined
            ? await authorized(
                args.orchestrationId,
                args.capabilityToken,
                undefined,
                'session',
                args.actor,
              )
            : await authorizedPeerMutation(
                args.orchestrationId,
                args.capabilityToken,
                args.peerId,
                args.actor,
              );
        return text(
          await closeWorklog(
            args.orchestrationId,
            args.capabilityToken,
            args.peerId,
            args.item,
            args.actor,
            args.message,
            context,
          ),
        );
      } catch (e) {
        return fail(e.message);
      }
    },
  );
  return server;
}
