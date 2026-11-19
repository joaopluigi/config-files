import { randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
} from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const exec = promisify(execFile);
const now = () => new Date().toISOString();
const id = () => randomBytes(8).toString("hex");
const MAX_CHECKPOINTS = 100;
const LEASE_GRACE_MS = 300000;
const BLOCKED_STATUSES = new Set([
  "failed",
  "ambiguous",
  "missing",
  "quarantined",
  "pinned",
  "released",
]);

export class WorktreeError extends Error {}

function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(".." + "/"));
}

function canonicalizeExistingPath(path) {
  let candidate = resolve(path);
  const suffix = [];
  while (!existsSync(candidate)) {
    suffix.unshift(candidate.slice(candidate.lastIndexOf("/") + 1));
    candidate = dirname(candidate);
  }
  return resolve(realpathSync(candidate), ...suffix);
}

export function paths(env = process.env) {
  const configuredStateDir = env.WORKTREE_STATE_DIR;
  const stateDir = canonicalizeExistingPath(
    configuredStateDir ||
      join(env.HOME || homedir(), ".config", "config-files-worktrees"),
  );
  if (
    [tmpdir(), "/tmp", "/private/tmp"].some((root) =>
      isWithin(canonicalizeExistingPath(root), stateDir),
    )
  ) {
    throw new WorktreeError(
      "WORKTREE_STATE_DIR must be a durable configured root outside the system temporary directory",
    );
  }
  return {
    stateDir,
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

async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWrite(file, value) {
  const directory = resolve(file, "..");
  await mkdir(directory, { recursive: true });
  const temp = `${file}.${process.pid}.${id()}.tmp`;
  const handle = await open(temp, "w");
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
  await syncDirectory(directory);
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

function lifecycleError(manifest) {
  if (BLOCKED_STATUSES.has(manifest.status) || manifest.pinned)
    return new WorktreeError(
      `worktree lifecycle is restricted for ${manifest.status}${manifest.pinned ? " (pinned)" : ""}`,
    );
  return null;
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
      let actuals = [];
      try {
        actuals = (await worktreeEntries(manifest.repoRoot)).filter(
          (entry) => entry.path === manifest.path,
        );
      } catch {
        actuals = [];
      }
      const actual = actuals[0];
      const exists = actuals.length > 0;
      let dirty = false;
      if (exists) {
        try {
          dirty =
            (await git(manifest.path, ["status", "--porcelain"])).length > 0;
        } catch {
          dirty = true;
        }
      }
      const next = { ...manifest, observedAt: now(), exists, dirty };
      if (actuals.length > 1) {
        next.status = "ambiguous";
        next.quarantineReason = "multiple-worktree-entries";
      } else if (
        !exists &&
        ["active", "leased", "provisioning"].includes(manifest.status)
      ) {
        next.status = manifest.status === "provisioning" ? "failed" : "missing";
        next.quarantineReason = "worktree-not-found";
      } else if (
        exists &&
        (actual.commit !== manifest.commit || !actual.detached)
      ) {
        next.status = "ambiguous";
        next.quarantineReason = "worktree-identity-mismatch";
      } else if (
        dirty &&
        ["active", "leased", "provisioning"].includes(manifest.status)
      ) {
        next.status = "quarantined";
        next.quarantineReason = "dirty-uncommitted-worktree";
      }
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
          ["active", "leased", "provisioning"].includes(item.status),
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
    const createdAt = this.clock();
    const timestamp = new Date(createdAt).toISOString();
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
      status: "provisioning",
      createdAt: timestamp,
      leaseExpiresAt: new Date(createdAt + leaseSeconds * 1000).toISOString(),
      lastHeartbeatAt: timestamp,
      heartbeatCadenceSeconds: Math.max(1, Math.floor(leaseSeconds / 3)),
      dirty: false,
      checkpoints: [],
      checkpointSequence: 0,
    };
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    try {
      await git(identity.root, [
        "worktree",
        "add",
        "--detach",
        path,
        exactCommit,
      ]);
      manifest.status = "active";
      await atomicWrite(
        manifestPath(this.paths.stateDir, worktreeId),
        manifest,
      );
    } catch (error) {
      manifest.status = "failed";
      manifest.quarantineReason = "provisioning-failed";
      try {
        await atomicWrite(
          manifestPath(this.paths.stateDir, worktreeId),
          manifest,
        );
      } catch {
        // Preserve the original failure when the manifest store is unavailable.
      }
      try {
        if (
          (await worktreeEntries(identity.root)).some(
            (entry) => entry.path === path,
          )
        )
          await git(identity.root, ["worktree", "remove", "--force", path]);
      } catch {
        manifest.status = "quarantined";
        manifest.quarantineReason = "provisioning-rollback-failed";
        try {
          await atomicWrite(
            manifestPath(this.paths.stateDir, worktreeId),
            manifest,
          );
        } catch {
          // The durable pending manifest remains the recovery record.
        }
      }
      throw error;
    }
    return this.descriptor(manifest);
  }

  descriptor(manifest) {
    const checkpoints = manifest.checkpoints || [];
    const latest = checkpoints.at(-1) || null;
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
      checkpointHistory: checkpoints,
      recoveryReference: latest?.recoveryReference || null,
      lifecycleContract: {
        owner: manifest.owner,
        leaseExpiresAt: manifest.leaseExpiresAt,
        heartbeatCadenceSeconds: manifest.heartbeatCadenceSeconds,
        checkpointRecoveryReference: latest?.recoveryReference || null,
        releaseRestrictions:
          "Only the owner may release an active, clean, exact-commit detached worktree; quarantined, failed, ambiguous, missing, pinned, released, or dirty records are never silently released or deleted.",
        reconciliationAndGc:
          "Reconciliation and garbage collection are server-owned; subagents must not perform either operation.",
      },
    };
  }

  async get(worktreeId) {
    const manifest = (await readManifests(this.paths.stateDir)).find(
      (item) => item.id === worktreeId,
    );
    if (!manifest) throw new WorktreeError("unknown worktree");
    return manifest;
  }

  async assertLeaseActive(worktreeId, manifest) {
    const timestamp = this.clock();
    const expiresAt =
      manifest.leaseExpiresAt && Date.parse(manifest.leaseExpiresAt);
    if (expiresAt && timestamp >= expiresAt) {
      manifest.status = "quarantined";
      manifest.quarantineReason = "lease-expired";
      await atomicWrite(
        manifestPath(this.paths.stateDir, worktreeId),
        manifest,
      );
      throw new WorktreeError("lease expired");
    }
  }

  async heartbeat(worktreeId, owner, leaseSeconds = 3600) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    if (manifest.status !== "active")
      throw new WorktreeError("worktree is not active");
    await this.assertLeaseActive(worktreeId, manifest);
    const timestamp = this.clock();
    manifest.lastHeartbeatAt = new Date(timestamp).toISOString();
    manifest.leaseExpiresAt = new Date(
      timestamp + leaseSeconds * 1000,
    ).toISOString();
    manifest.heartbeatCadenceSeconds = Math.max(
      1,
      Math.floor(leaseSeconds / 3),
    );
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return this.descriptor(manifest);
  }

  async checkpoint(worktreeId, owner, commit) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    const adoptingIdentityDrift =
      manifest.status === "ambiguous" &&
      manifest.quarantineReason === "worktree-identity-mismatch";
    const blocked = adoptingIdentityDrift ? null : lifecycleError(manifest);
    if (blocked) throw blocked;
    await this.assertLeaseActive(worktreeId, manifest);
    const dirty =
      (await git(manifest.path, ["status", "--porcelain"])).length > 0;
    if (dirty) throw new WorktreeError("refusing to checkpoint dirty worktree");
    const entries = await worktreeEntries(manifest.repoRoot);
    const matching = entries.filter((entry) => entry.path === manifest.path);
    if (matching.length !== 1 || !matching[0].detached)
      throw new WorktreeError("worktree identity no longer matches manifest");
    const current = await git(manifest.path, ["rev-parse", "HEAD"]);
    const reference = await git(manifest.path, [
      "rev-parse",
      "--verify",
      `${commit}^{commit}`,
    ]);
    if (current !== reference)
      throw new WorktreeError("checkpoint must reference current HEAD");
    if (
      entries.some(
        (entry) =>
          entry.path !== manifest.path &&
          entry.detached &&
          entry.commit === reference,
      )
    )
      throw new WorktreeError("another detached worktree already uses commit");
    const previousSequence = Math.max(
      manifest.checkpointSequence || 0,
      ...(manifest.checkpoints || []).map((checkpoint) => {
        const match = checkpoint.recoveryReference?.match(/\/(\d+)$/);
        return match ? Number(match[1]) : 0;
      }),
    );
    const sequence = previousSequence + 1;
    const recoveryReference = `refs/worktree-lifecycle/${manifest.id}/${sequence}`;
    await git(manifest.repoRoot, ["update-ref", recoveryReference, reference]);
    manifest.commit = reference;
    manifest.status = "active";
    delete manifest.quarantineReason;
    manifest.checkpointSequence = sequence;
    manifest.checkpoints = [
      ...(manifest.checkpoints || []),
      { commit: reference, at: now(), recoveryReference },
    ].slice(-MAX_CHECKPOINTS);
    await atomicWrite(manifestPath(this.paths.stateDir, worktreeId), manifest);
    return {
      id: worktreeId,
      commit: reference,
      recoveryReference,
      checkpointHistory: manifest.checkpoints,
      durable: true,
    };
  }

  async release(worktreeId, owner) {
    const manifest = await this.get(worktreeId);
    if (manifest.owner !== owner) throw new WorktreeError("owner mismatch");
    const blocked = lifecycleError(manifest);
    if (blocked) throw blocked;
    await this.assertLeaseActive(worktreeId, manifest);
    const dirty =
      (await git(manifest.path, ["status", "--porcelain"])).length > 0;
    if (dirty) throw new WorktreeError("refusing to release dirty worktree");
    const entries = await worktreeEntries(manifest.repoRoot);
    const matching = entries.filter((entry) => entry.path === manifest.path);
    if (
      matching.length !== 1 ||
      !matching[0].detached ||
      matching[0].commit !== manifest.commit
    )
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
        Date.parse(manifest.leaseExpiresAt) + LEASE_GRACE_MS <= timestamp;
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
