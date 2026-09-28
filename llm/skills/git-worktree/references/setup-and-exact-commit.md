# Setup and exact commit

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
environments, services, or caches.
