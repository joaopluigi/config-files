# Cleanup and verification

Only remove paths created by this task, using the repository that owns them. Do
not run an unscoped prune. On success, failure, or interruption remove all task
worktrees, then verify the original status, branch or detached state, HEAD, and
worktree list.

```sh
git -C "$REPOSITORY" worktree remove --force "$WORKTREE"
git -C "$REPOSITORY" worktree list --porcelain
git -C "$REPOSITORY" status --short --branch
git -C "$REPOSITORY" rev-parse HEAD
```

The original tracked and untracked files must retain their prior meaning. Stop
before completion if cleanup cannot be verified.
