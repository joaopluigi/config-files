import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { WorktreeStore, WorktreeError } from "./worktree.mjs";

const text = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});
const fail = (error) => ({ isError: true, ...text({ error: error.message }) });

export function createServer(store = new WorktreeStore()) {
  const server = new McpServer(
    { name: "worktree-lifecycle", version: "0.1.0" },
    {
      instructions:
        "Only the supplied sanitized worktree descriptor may be handed to a subagent. Subagents must use only that worktree and may not create, remove, switch, or push through other worktrees.",
    },
  );
  if (typeof store.reconcile === "function") {
    void store.reconcile();
    const timer = setInterval(
      () => void store.reconcile().then(() => store.gc()),
      60_000,
    );
    timer.unref?.();
  }
  const wrap = (handler) => async (args) => {
    try {
      return text(await handler(args));
    } catch (error) {
      return fail(error);
    }
  };
  server.registerTool(
    "worktree_create",
    {
      description:
        "Create a validated detached worktree and return a sanitized ownership descriptor.",
      inputSchema: z.object({
        repo: z.string(),
        commit: z.string(),
        task: z.string(),
        agent: z.string(),
        owner: z.string(),
        role: z.enum(["task", "integration"]).optional(),
        leaseSeconds: z.number().int().positive().optional(),
      }),
    },
    wrap((args) => store.create(args)),
  );
  server.registerTool(
    "worktree_status",
    {
      description: "Read worktree ownership and lifecycle status.",
      inputSchema: z.object({ worktreeId: z.string() }),
    },
    wrap(({ worktreeId }) => store.status(worktreeId)),
  );
  server.registerTool(
    "worktree_heartbeat",
    {
      description: "Renew the owner lease for an active worktree.",
      inputSchema: z.object({
        worktreeId: z.string(),
        owner: z.string(),
        leaseSeconds: z.number().int().positive().optional(),
      }),
    },
    wrap(({ worktreeId, owner, leaseSeconds }) =>
      store.heartbeat(worktreeId, owner, leaseSeconds),
    ),
  );
  server.registerTool(
    "worktree_checkpoint",
    {
      description:
        "Record a durable checkpoint reference to the current commit.",
      inputSchema: z.object({
        worktreeId: z.string(),
        owner: z.string(),
        commit: z.string(),
      }),
    },
    wrap(({ worktreeId, owner, commit }) =>
      store.checkpoint(worktreeId, owner, commit),
    ),
  );
  server.registerTool(
    "worktree_release",
    {
      description:
        "Safely release an owned clean exact-commit detached worktree.",
      inputSchema: z.object({ worktreeId: z.string(), owner: z.string() }),
    },
    wrap(({ worktreeId, owner }) => store.release(worktreeId, owner)),
  );
  return server;
}

export { WorktreeError };
