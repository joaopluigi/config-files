import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { WorktreeStore } from "../src/worktree.mjs";
import { createServer } from "../src/tools.mjs";

const run = promisify(execFile);
async function repo() {
  const root = await mkdtemp(join(tmpdir(), "worktree-repo-"));
  await run("git", ["init", "-q", root]);
  await run("git", [
    "-C",
    root,
    "config",
    "user.email",
    "test@example.invalid",
  ]);
  await run("git", ["-C", root, "config", "user.name", "Test"]);
  await run("git", ["-C", root, "config", "commit.gpgSign", "false"]);
  await writeFile(join(root, "README"), "one\n");
  await run("git", ["-C", root, "add", "README"]);
  await run("git", ["-C", root, "commit", "-qm", "initial"]);
  const { stdout } = await run("git", ["-C", root, "rev-parse", "HEAD"]);
  return { root, commit: stdout.trim() };
}
function env(stateDir, rootDir) {
  return {
    WORKTREE_STATE_DIR: stateDir,
    WORKTREE_ROOT: rootDir,
    HOME: stateDir,
  };
}

test("create validates repository identity, detached exact commit, and uniqueness", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const descriptor = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "task",
    agent: "a",
    owner: "o",
  });
  assert.equal(descriptor.commit, r.commit);
  assert.equal(descriptor.repo, await realpath(r.root));
  await assert.rejects(
    () =>
      store.create({
        repo: r.root,
        commit: r.commit,
        task: "again",
        agent: "a",
        owner: "o",
      }),
    /exact detached|active worktree/,
  );
  await assert.rejects(
    () =>
      store.create({
        repo: join(r.root, "missing"),
        commit: r.commit,
        task: "bad",
        agent: "a",
        owner: "o",
      }),
    /git|failed/,
  );
});

test("descriptor includes ownership and integration role", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const descriptor = await new WorktreeStore(env(state, root)).create({
    repo: r.root,
    commit: r.commit,
    task: "integration",
    agent: "agent",
    owner: "owner",
    role: "integration",
  });
  assert.deepEqual(
    {
      task: descriptor.task,
      agent: descriptor.agent,
      owner: descriptor.owner,
      role: descriptor.role,
    },
    {
      task: "integration",
      agent: "agent",
      owner: "owner",
      role: "integration",
    },
  );
});

test("heartbeat renews lease and rejects a different owner", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  let time = Date.parse("2026-01-01T00:00:00Z");
  const store = new WorktreeStore(env(state, root), () => time);
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "lease",
    agent: "a",
    owner: "o",
    leaseSeconds: 10,
  });
  time += 5000;
  const renewed = await store.heartbeat(created.id, "o", 20);
  assert.equal(renewed.leaseExpiresAt, "2026-01-01T00:00:25.000Z");
  await assert.rejects(
    () => store.heartbeat(created.id, "other"),
    /owner mismatch/,
  );
});

test("checkpoint is durable and recoverable", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "checkpoint",
    agent: "a",
    owner: "o",
  });
  const result = await store.checkpoint(created.id, "o", r.commit);
  assert.equal(result.durable, true);
  const manifest = JSON.parse(
    await readFile(join(state, "manifests", `${created.id}.json`), "utf8"),
  );
  assert.equal(manifest.checkpoints[0].commit, r.commit);
  assert.equal((await store.status(created.id)).id, created.id);
});

test("release refuses dirty worktrees and safely releases clean exact commits", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "release",
    agent: "a",
    owner: "o",
  });
  await writeFile(join(created.path, "dirty"), "x");
  await assert.rejects(() => store.release(created.id, "o"), /dirty/);
  await run("git", ["-C", created.path, "clean", "-fd"]);
  const released = await store.release(created.id, "o");
  assert.equal(released.status, "released");
  await assert.rejects(
    () => store.release(created.id, "other"),
    /owner mismatch/,
  );
});

test("startup reconciliation and internal gc quarantine, never delete, expired active worktrees", async () => {
  const r = await repo();
  const state = await mkdtemp(join(tmpdir(), "worktree-state-"));
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  let time = Date.parse("2026-01-01T00:00:00Z");
  const store = new WorktreeStore(env(state, root), () => time);
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "gc",
    agent: "a",
    owner: "o",
    leaseSeconds: 1,
  });
  time += 302000;
  const result = await store.gc();
  assert.equal(result[0].status, "quarantined");
  assert.equal((await store.reconcile())[0].status, "quarantined");
  assert.equal((await store.status(created.id)).id, created.id);
});

test("MCP surface exposes lifecycle tools but not gc", () => {
  const server = createServer({});
  const names = Object.keys(server._registeredTools || server._tools || {});
  assert.ok(names.includes("worktree_create"));
  assert.ok(names.includes("worktree_release"));
  assert.ok(!names.includes("worktree_gc"));
});
