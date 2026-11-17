import { randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const exec = promisify(execFile);
const now = () => new Date().toISOString();
const id = () => randomBytes(8).toString("hex");

export class WorktreeError extends Error {}

export function paths(env = process.env) {
  return {
    stateDir: resolve(
      env.WORKTREE_STATE_DIR ||
        join(env.HOME || "/tmp", ".config", "config-files-worktrees"),
    ),
    rootDir: resolve(env.WORKTREE_ROOT || "/tmp/config-files-worktrees"),
  };
}

async function git(repo, args) {
  try {
    const { stdout } = await exec("git", args, {
      cwd: repo,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    throw new WorktreeError(
      `git ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}`,
    );
  }
}

async function atomicWrite(file, value) {
  await mkdir(resolve(file, ".."), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(temp, file);
}

function manifestPath(stateDir, worktreeId) {
  return join(stateDir, "manifests", `${worktreeId}.json`);
}

async function readManifests(stateDir) {
  const dir = join(stateDir, "manifests");
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(join(dir, file), "utf8")),
    ),
  );
}

async function worktreeEntries(repo) {
  const output = await git(repo, ["worktree", "list", "--porcelain"]);
  return output
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = Object.fromEntries(
        block.split("\n").map((line) => {
          const [key, ...rest] = line.split(" ");
          return [key, rest.join(" ")];
        }),
      );
      return {
        path: lines.worktree,
        commit: lines.HEAD,
        detached: "branch" in lines === false,
      };
    });
}

async function repositoryIdentity(repo) {
  const root = await realpath(
    await git(repo, ["rev-parse", "--show-toplevel"]),
  );
  const commonDir = await realpath(
    resolve(repo, await git(repo, ["rev-parse", "--git-common-dir"])),
  );
  return { root, commonDir };
}

function ensureManagedPath(path, rootDir) {
  const rel = relative(rootDir, path);
  if (rel.startsWith("..") || rel.includes(".." + "/"))
    throw new WorktreeError("worktree path escapes managed root");
}

export class WorktreeStore {
  constructor(env = process.env, clock = () => Date.now()) {
    this.paths = paths(env);
    this.clock = clock;
  }

  async reconcile() {
    const manifests = await readManifests(this.paths.stateDir);
    const result = [];
    for (const manifest of manifests) {
      let actual = null;
      try {
        actual = (await worktreeEntries(manifest.repoRoot)).find(
          (entry) => entry.path === manifest.path,
        );
      } catch {
        actual = null;
      }
      const exists = Boolean(actual);
      const dirty = exists
        ? (await git(manifest.path, ["status", "--porcelain"])).length > 0
        : false;
      const next = { ...manifest, observedAt: now(), exists, dirty };
      if (!exists && manifest.status === "active") next.status = "missing";
      if (dirty && next.status === "released") next.status = "quarantined";
      await atomicWrite(manifestPath(this.paths.stateDir, manifest.id), next);
      result.push(next);
    }
    return result;
  }

  async create({
    repo,
    commit,
    task,
    agent,
    owner,
    role = "task",
    leaseSeconds = 3600,
  }) {
    if (!task || !agent || !owner)
      throw new WorktreeError("task, agent, and owner are required");
    const identity = await repositoryIdentity(repo);
    const exactCommit = await git(identity.root, [
      "rev-parse",
      "--verify",
      `${commit}^{commit}`,
    ]);
    const entries = await worktreeEntries(identity.root);
    if (
      entries.some(
        (entry) =>
          entry.commit === exactCommit &&
          entry.detached &&
          entry.path !== identity.root,
      )
    )
      throw new WorktreeError(
        "an exact detached worktree already exists for this commit",
      );
    const manifests = await readManifests(this.paths.stateDir);
    if (
      manifests.some(
        (item) =>
          item.repoCommonDir === identity.commonDir &&
          item.commit === exactCommit &&
          ["active", "leased"].includes(item.status),
      )
    )
      throw new WorktreeError(
        "an active worktree already exists for this repository and commit",
      );
    await mkdir(this.paths.rootDir, { recursive: true });
    const managedRoot = await realpath(this.paths.rootDir);
    const worktreeId = `${task.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "task"}-${id()}`;
    const path = join(managedRoot, worktreeId);
    ensureManagedPath(path, managedRoot);
    await git(identity.root, [
      "worktree",
      "add",
      "--detach",
      path,
      exactCommit,
    ]);
    const createdAt = this.clock();
    const manifest = {
      id: worktreeId,
      path,
      repoRoot: identity.root,
      repoCommonDir: identity.commonDir,
      commit: exactCommit,
      task,
      agent,
      owner,
      role,
      status: "active",
      createdAt: new Date(createdAt).toISOString(),
      leaseExpiresAt: new Date(createdAt + leaseSeconds * 1000).toISOString(),
      lastHeartbeatAt: new Date(createdAt).toISOString(),
      dirty: false,
    };
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return this.descriptor(manifest);
  }

  descriptor(manifest) {
    return {
      id: manifest.id,
      path: manifest.path,
      repo: manifest.repoRoot,
      commit: manifest.commit,
      task: manifest.task,
      agent: manifest.agent,
      owner: manifest.owner,
      role: manifest.role,
      leaseExpiresAt: manifest.leaseExpiresAt,
      status: manifest.status,
    };
  }

  async get(worktreeId) {
    const manifest = (await readManifests(this.paths.stateDir)).find(
      (item) => item.id === worktreeId,
    );
    if (!manifest) throw new WorktreeError("unknown worktree");
    return manifest;
  }

  async heartbeat(worktreeId, owner, leaseSeconds = 3600) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    if (manifest.status !== "active")
      throw new WorktreeError("worktree is not active");
    const timestamp = this.clock();
    manifest.lastHeartbeatAt = new Date(timestamp).toISOString();
    manifest.leaseExpiresAt = new Date(
      timestamp + leaseSeconds * 1000,
    ).toISOString();
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return this.descriptor(manifest);
  }

  async checkpoint(worktreeId, owner, commit) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    const current = await git(manifest.path, ["rev-parse", "HEAD"]);
    const reference = await git(manifest.path, [
      "rev-parse",
      "--verify",
      `${commit}^{commit}`,
    ]);
    if (current !== reference)
      throw new WorktreeError("checkpoint must reference current HEAD");
    manifest.checkpoints = [
      ...(manifest.checkpoints || []),
      { commit: reference, at: now() },
    ];
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return { id: worktreeId, commit: reference, durable: true };
  }

  async release(worktreeId, owner) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    const dirty =
      (await git(manifest.path, ["status", "--porcelain"])).length > 0;
    if (dirty) throw new WorktreeError("refusing to release dirty worktree");
    const entries = await worktreeEntries(manifest.repoRoot);
    const actual = entries.find((entry) => entry.path === manifest.path);
    if (!actual || !actual.detached || actual.commit !== manifest.commit)
      throw new WorktreeError("worktree identity no longer matches manifest");
    await git(manifest.repoRoot, ["worktree", "remove", manifest.path]);
    manifest.status = "released";
    manifest.releasedAt = now();
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return this.descriptor(manifest);
  }

  async status(worktreeId) {
    return this.descriptor(await this.get(worktreeId));
  }

  async gc() {
    const manifests = await readManifests(this.paths.stateDir);
    const timestamp = this.clock();
    const retained = [];
    for (const manifest of manifests) {
      const expired =
        manifest.leaseExpiresAt &&
        Date.parse(manifest.leaseExpiresAt) + 300000 < timestamp;
      if (manifest.status === "active" && expired) {
        manifest.status = "quarantined";
        manifest.quarantineReason = "lease-expired";
        await atomicWrite(
          manifestPath(this.paths.stateDir, manifest.id),
          manifest,
        );
      }
      retained.push(this.descriptor(manifest));
    }
    return retained;
  }
}

export { git };
