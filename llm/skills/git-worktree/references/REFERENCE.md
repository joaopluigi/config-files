# Reference

## Setup

Resolve the repository top level, status, HEAD, worktree list, and exact target
commit before creating anything. Create a unique detached worktree outside the
checkout at that commit; verify its detached HEAD before task commands.

```sh
TARGET_COMMIT=$(git -C "$REPOSITORY" rev-parse --verify REVISION^{commit})
WORKTREE=$(mktemp -d "${TMPDIR:-/tmp}/eca-git-worktree.XXXXXX")
git -C "$REPOSITORY" worktree add --detach "$WORKTREE" "$TARGET_COMMIT"
```

Register cleanup immediately. If an unchanged comparison is needed, create
separate baseline and experiment worktrees at the same commit and edit only the
experiment. Worktrees do not copy ignored or untracked inputs, credentials,
environments, services, or caches; copy an explicitly recorded untracked input
or use a committed revision.

## Running and fallback

Run every test, build, formatter, and experiment in the isolated worktree. Never
switch the user's checkout. If no clone exists, use a disposable exact snapshot
and label it as weaker isolation; do not call it a Git worktree. Stop if the
commit cannot resolve, the destination overlaps an existing worktree, or cleanup
cannot be registered.

## Cleanup and verification

Only remove paths created by this task, using the repository that owns them. Do
not run an unscoped prune. On success, failure, or interruption remove all task
worktrees, then verify the original status, branch/detached state, HEAD, and
worktree list. The original tracked and untracked files must retain their prior
meaning.
