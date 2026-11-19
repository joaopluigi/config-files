import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
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
    HOME: homedir(),
  };
}
async function durableState() {
  return mkdtemp(join(homedir(), ".worktree-state-"));
}

test("create validates repository identity, detached exact commit, and uniqueness", async () => {
  const r = await repo();
  const state = await durableState();
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
  const state = await durableState();
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
  assert.equal(descriptor.lifecycleContract.owner, "owner");
  assert.equal(descriptor.lifecycleContract.heartbeatCadenceSeconds, 1200);
  assert.match(
    descriptor.lifecycleContract.releaseRestrictions,
    /quarantined.*never silently released or deleted/,
  );
  assert.match(
    descriptor.lifecycleContract.reconciliationAndGc,
    /server-owned/,
  );
});

test("heartbeat renews lease and rejects a different owner", async () => {
  const r = await repo();
  const state = await durableState();
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

test("heartbeat fails closed at expiry, including after restart and grace", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  let time = Date.parse("2026-01-01T00:00:00Z");
  const first = new WorktreeStore(env(state, root), () => time);
  const created = await first.create({
    repo: r.root,
    commit: r.commit,
    task: "lease-boundary",
    agent: "a",
    owner: "o",
    leaseSeconds: 10,
  });
  time += 10000;
  const restarted = new WorktreeStore(env(state, root), () => time);
  await assert.rejects(
    () => restarted.heartbeat(created.id, "o", 20),
    /lease expired/,
  );
  assert.equal((await restarted.status(created.id)).status, "quarantined");

  const laterRepo = await repo();
  const laterState = await durableState();
  const laterRoot = await mkdtemp(join(tmpdir(), "worktree-root-"));
  let laterTime = Date.parse("2026-01-01T00:00:00Z");
  const later = new WorktreeStore(env(laterState, laterRoot), () => laterTime);
  const laterCreated = await later.create({
    repo: laterRepo.root,
    commit: laterRepo.commit,
    task: "lease-grace-boundary",
    agent: "a",
    owner: "o",
    leaseSeconds: 10,
  });
  laterTime += 310000;
  await assert.rejects(
    () => later.heartbeat(laterCreated.id, "o"),
    /lease expired/,
  );
});

test("checkpoint and release fail closed at expiry and grace boundaries", async () => {
  for (const offset of [10000, 310000]) {
    for (const operation of ["checkpoint", "release"]) {
      const r = await repo();
      const state = await durableState();
      const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
      let time = Date.parse("2026-01-01T00:00:00Z");
      const store = new WorktreeStore(env(state, root), () => time);
      const created = await store.create({
        repo: r.root,
        commit: r.commit,
        task: `${operation}-${offset}`,
        agent: "a",
        owner: "o",
        leaseSeconds: 10,
      });
      time += offset;
      await assert.rejects(
        () =>
          operation === "checkpoint"
            ? store.checkpoint(created.id, "o", r.commit)
            : store.release(created.id, "o"),
        /lease expired/,
      );
      assert.equal((await store.status(created.id)).status, "quarantined");
    }
  }
});

test("checkpoint is durable and recoverable", async () => {
  const r = await repo();
  const state = await durableState();
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
  assert.match(result.recoveryReference, /^refs\/worktree-lifecycle\//);
  const manifest = JSON.parse(
    await readFile(join(state, "manifests", `${created.id}.json`), "utf8"),
  );
  assert.equal(manifest.checkpoints[0].commit, r.commit);
  assert.equal(
    manifest.checkpoints[0].recoveryReference,
    result.recoveryReference,
  );
  assert.equal((await store.status(created.id)).checkpointHistory.length, 1);
  assert.equal((await store.status(created.id)).status, "active");
  assert.equal(manifest.status, "active");
  assert.equal(manifest.quarantineReason, undefined);
  const { stdout } = await run("git", [
    "-C",
    r.root,
    "show-ref",
    result.recoveryReference,
  ]);
  assert.match(stdout, new RegExp(r.commit));
});

test("checkpoint adopts a clean identity drift and releases the accepted commit", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "checkpoint-adopt",
    agent: "a",
    owner: "o",
  });
  await writeFile(join(created.path, "next"), "two\\n");
  await run("git", ["-C", created.path, "add", "next"]);
  await run("git", ["-C", created.path, "commit", "-qm", "next"]);
  const { stdout } = await run("git", [
    "-C",
    created.path,
    "rev-parse",
    "HEAD",
  ]);
  const nextCommit = stdout.trim();
  const reconciled = await store.reconcile();
  assert.equal(reconciled[0].status, "ambiguous");
  assert.equal(reconciled[0].quarantineReason, "worktree-identity-mismatch");
  const checkpoint = await store.checkpoint(created.id, "o", nextCommit);
  assert.equal(checkpoint.commit, nextCommit);
  const status = await store.status(created.id);
  assert.equal(status.status, "active");
  assert.equal(status.commit, nextCommit);
  assert.equal(
    await store.get(created.id).then((manifest) => manifest.quarantineReason),
    undefined,
  );
  const released = await store.release(created.id, "o");
  assert.equal(released.status, "released");
});

test("checkpoint rejects dirty identity drift", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "checkpoint-dirty",
    agent: "a",
    owner: "o",
  });
  await writeFile(join(created.path, "next"), "two\\n");
  await run("git", ["-C", created.path, "add", "next"]);
  await run("git", ["-C", created.path, "commit", "-qm", "next"]);
  await writeFile(join(created.path, "dirty"), "x");
  const reconciled = await store.reconcile();
  assert.equal(reconciled[0].status, "ambiguous");
  await assert.rejects(
    () => store.checkpoint(created.id, "o", reconciled[0].commit),
    /dirty/,
  );
});

test("checkpoint rejects attached identity drift", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "checkpoint-attached",
    agent: "a",
    owner: "o",
  });
  await run("git", ["-C", created.path, "switch", "-c", "attached"]);
  const reconciled = await store.reconcile();
  assert.equal(reconciled[0].status, "ambiguous");
  await assert.rejects(
    () => store.checkpoint(created.id, "o", r.commit),
    /identity no longer matches/,
  );
});

test("checkpoint references stay unique beyond retained history", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "checkpoint-sequence",
    agent: "a",
    owner: "o",
  });
  const references = [];
  for (let index = 0; index < 102; index += 1) {
    references.push(
      (await store.checkpoint(created.id, "o", r.commit)).recoveryReference,
    );
  }
  assert.equal(new Set(references).size, 102);
  assert.equal(references.at(-1), `refs/worktree-lifecycle/${created.id}/102`);
  assert.equal((await store.status(created.id)).checkpointHistory.length, 100);
  const { stdout } = await run("git", ["-C", r.root, "show-ref"]);
  assert.equal(
    stdout
      .split("\n")
      .filter((line) => line.includes(`refs/worktree-lifecycle/${created.id}/`))
      .length,
    102,
  );
});

test("release refuses dirty worktrees and safely releases clean exact commits", async () => {
  const r = await repo();
  const state = await durableState();
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
  const state = await durableState();
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

test("reconciliation quarantines dirty active worktrees and release stays blocked", async () => {
  const r = await repo();
  const state = await durableState();
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  const store = new WorktreeStore(env(state, root));
  const created = await store.create({
    repo: r.root,
    commit: r.commit,
    task: "dirty-reconcile",
    agent: "a",
    owner: "o",
  });
  await writeFile(join(created.path, "dirty"), "x");
  const reconciled = await store.reconcile();
  assert.equal(reconciled[0].status, "quarantined");
  await assert.rejects(() => store.release(created.id, "o"), /restricted/);
  await run("git", ["-C", created.path, "clean", "-fd"]);
});

test("read-only manifest store fails before creating a worktree", async () => {
  const r = await repo();
  const state = await durableState();
  const manifests = join(state, "manifests");
  await mkdir(manifests, { recursive: true });
  await chmod(manifests, 0o555);
  const root = await mkdtemp(join(tmpdir(), "worktree-root-"));
  try {
    const store = new WorktreeStore(env(state, root));
    await assert.rejects(
      () =>
        store.create({
          repo: r.root,
          commit: r.commit,
          task: "read-only",
          agent: "a",
          owner: "o",
        }),
      /EACCES|permission|read-only/,
    );
    const { stdout } = await run("git", [
      "-C",
      r.root,
      "worktree",
      "list",
      "--porcelain",
    ]);
    assert.equal(stdout.trim().split("\\n\\n").length, 1);
  } finally {
    await chmod(manifests, 0o755);
  }
});

test("rejects a state directory under the system temporary directory", () => {
  assert.throws(
    () => new WorktreeStore({ WORKTREE_STATE_DIR: join(tmpdir(), "unsafe") }),
    /durable configured root/,
  );
});

test("rejects a durable state path symlinked into temporary storage", async () => {
  const parent = await mkdtemp(join(homedir(), ".worktree-state-link-"));
  const link = join(parent, "state");
  await symlink(tmpdir(), link);
  assert.throws(
    () => new WorktreeStore({ WORKTREE_STATE_DIR: join(link, "nested") }),
    /durable configured root/,
  );
});

test("MCP surface exposes lifecycle tools but not gc", () => {
  const server = createServer({});
  const names = Object.keys(server._registeredTools || server._tools || {});
  assert.ok(names.includes("worktree_create"));
  assert.ok(names.includes("worktree_release"));
  assert.ok(!names.includes("worktree_gc"));
});
