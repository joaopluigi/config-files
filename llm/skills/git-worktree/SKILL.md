---
name: git-worktree
description: "Use before working in any Git repository directory. Isolate tests, experiments, edits, builds, repairs, reviews, and other repository actions in a detached temporary worktree so the user's checkout remains unchanged."
---

# Git Worktree Isolation

Use this skill **before working in any Git repository directory**. This includes
reading local files for a task, running tests or experiments, editing source files,
running builds or repairs, reviewing changes, and preparing commits. The purpose is
to keep the user's existing checkout separate from task work.

Read-only inspection that does not operate on a local checkout, such as reading a
pinned remote API response, may happen before a local worktree exists. Target
resolution, an explicitly authorized fetch, and recording the original checkout
state are also setup exceptions; they must not switch branches or modify checkout
files. Once a local checkout is used for task work, follow this procedure.

This skill documents a procedure only. It does not provide scripts and it does not
invoke another skill. A consuming skill or action must apply this procedure directly.

## Required isolation rule

When a local Git clone is available, do not check out a task branch in the user's
current worktree. Create a detached worktree at the exact commit that the task uses:

```bash
REPOSITORY="/absolute/path/to/the-existing-checkout"
TARGET_COMMIT="FULL_COMMIT_SHA"
WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/eca-git-worktree.XXXXXX")"

git -C "$REPOSITORY" worktree add --detach "$WORKTREE" "$TARGET_COMMIT"
```

Run task commands from `WORKTREE`, not from `REPOSITORY`:

```bash
git -C "$WORKTREE" status --short --branch
git -C "$WORKTREE" rev-parse HEAD
```

The worktree must be detached and its `HEAD` must equal the selected commit. Do not
silently substitute the user's current `HEAD` when the task requires another
revision.

## Before creating the worktree

1. Identify the user's existing checkout and resolve its top-level path.
2. Record the original checkout's branch or detached state, `HEAD`, status, and
   existing worktree list:

   ```bash
   git -C "$REPOSITORY" rev-parse --show-toplevel
   git -C "$REPOSITORY" status --short --branch
   git -C "$REPOSITORY" rev-parse HEAD
   git -C "$REPOSITORY" worktree list --porcelain
   ```

3. Resolve the task revision to a commit before creating the worktree:

   ```bash
   TARGET_COMMIT="$(git -C "$REPOSITORY" rev-parse --verify REVISION^{commit})"
   ```

4. If the commit is not available locally, stop the generic procedure and let the
   consuming skill decide whether to fetch it. An explicitly authorized fetch may
   run against the original clone as setup, but it must not switch branches or
   modify checkout files. Re-record the original checkout status after the fetch
   and before creating the worktree. The generic worktree procedure does not choose
   remotes, fetch branches, or perform GitHub-specific operations.

5. Create the worktree outside the user's checkout and outside existing worktree
   paths. Use a unique temporary path. Do not reuse a non-empty directory.

## Running the task

Use the isolated worktree for all commands that can create or modify files,
including tests, formatters, compilers, builds, proposed patches, and repair
experiments.

When the unchanged baseline must remain available, create a second detached
worktree at the same target commit. Keep the baseline and experiment paths
separate:

```bash
BASELINE="$(mktemp -d "${TMPDIR:-/tmp}/eca-git-baseline.XXXXXX")"
EXPERIMENT="$(mktemp -d "${TMPDIR:-/tmp}/eca-git-experiment.XXXXXX")"

git -C "$REPOSITORY" worktree add --detach "$BASELINE" "$TARGET_COMMIT"
git -C "$REPOSITORY" worktree add --detach "$EXPERIMENT" "$TARGET_COMMIT"
```

Apply proposed changes only in `EXPERIMENT`. Do not patch the baseline when the
baseline result is needed for comparison.

A Git worktree isolates Git-tracked content, the index, and the worktree checkout.
It does not copy ignored files, untracked files, credentials, local environment
files, external services, ports, databases, caches, or other resources outside the
worktree. A consuming skill must provide those resources separately when needed.

If the task input is an untracked or newly created file, do not assume it exists in
the target worktree. Either use a committed target that contains the input, copy the
input into the isolated worktree after recording its source path, or limit the
operation to read-only inspection of the original input. Do not edit the original
untracked input while the isolated task is running.

## Cleanup ownership

Register cleanup immediately after every successful worktree creation, before
running tests or other commands:

```bash
cleanup() {
  git -C "$REPOSITORY" worktree remove --force "$EXPERIMENT" 2>/dev/null || true
  git -C "$REPOSITORY" worktree remove --force "$BASELINE" 2>/dev/null || true
  git -C "$REPOSITORY" worktree remove --force "$WORKTREE" 2>/dev/null || true
}

trap cleanup EXIT INT TERM
```

Track every temporary worktree created by the task, including whichever of
`WORKTREE`, `BASELINE`, and `EXPERIMENT` were actually created. Remove each one on
success, command failure, and handled interruption. The cleanup commands may be
idempotent and ignore an unset or already-removed optional path, but they must never
remove a path not created by the current task:

```bash
git -C "$REPOSITORY" worktree remove --force "$WORKTREE"
```

Only remove worktrees created for the current task. Do not run an unscoped
`git worktree prune`, and do not remove a path unless it is registered to the
repository being used.

After cleanup, verify that no task worktrees remain and re-check the original
checkout:

```bash
git -C "$REPOSITORY" worktree list --porcelain
git -C "$REPOSITORY" status --short --branch
git -C "$REPOSITORY" rev-parse HEAD
```

The original checkout's branch or detached state, `HEAD`, index, tracked files, and
untracked files must have the same meaning as before the task. Temporary Git
worktree administration entries may exist while the isolated worktrees are active,
but all entries created by the task must be gone after cleanup.

## No local clone

If no local Git clone is available, do not pretend that an extracted archive is a
Git worktree. Use a consuming skill's disposable snapshot fallback, extract it into
an empty temporary directory, run the task there, and remove that directory after
use. Keep the weaker snapshot behavior clearly separate from Git worktree behavior.

## Stop conditions

Stop before running task commands when:

- the target revision does not resolve to a commit;
- the target commit is unavailable and the consuming skill has not authorized a
  fetch or other acquisition method;
- the destination is inside the user's checkout, overlaps an existing worktree, or
  is not an empty unique temporary path;
- cleanup cannot be registered or the worktree cannot be verified at the target
  commit.

Do not report completion until the task worktrees have been removed and the original
checkout has been checked again.

## Consumer checklist

A Git-repository skill or action using this procedure must:

- load this skill before operating in the repository directory;
- select and record an exact target commit;
- create detached worktrees outside the user's checkout;
- run task commands only in the isolated path;
- create a second worktree for experiments that must not alter the baseline;
- register cleanup immediately and remove every task-owned worktree;
- keep fetching and remote-specific behavior outside this generic procedure; and
- verify the original checkout after cleanup.
