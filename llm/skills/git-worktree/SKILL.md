---
name: git-worktree
description: "Use a detached temporary worktree for repository work."
---

# Git worktree isolation

Use before reading, editing, testing, building, or reviewing a local Git repository.

## Procedure

1. Resolve the existing checkout, target commit, status, HEAD, and worktree list.
2. Create a unique detached worktree outside the checkout at the exact target commit.
3. Register cleanup immediately. Run all task commands in that worktree.
4. If baseline comparison is needed, create a second detached worktree at the same commit and keep it unchanged.
5. Remove only worktrees created by this task. Recheck the original checkout, HEAD, status, and worktree list.

```sh
REPOSITORY=/absolute/repo
TARGET_COMMIT=$(git -C "$REPOSITORY" rev-parse --verify REVISION^{commit})
WORKTREE=$(mktemp -d "${TMPDIR:-/tmp}/eca-git-worktree.XXXXXX")
git -C "$REPOSITORY" worktree add --detach "$WORKTREE" "$TARGET_COMMIT"
cleanup() { git -C "$REPOSITORY" worktree remove --force "$WORKTREE" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
```

## Reference

See [`references/REFERENCE.md`](references/REFERENCE.md) for detailed setup,
exact commit resolution, baseline/experiment worktrees, untracked inputs,
cleanup ownership, fallback behavior, and final verification.

## Boundaries

Do not switch the user's checkout, use an overlapping path, fetch without explicit authorization, or remove unrelated worktrees. Stop if the target commit is unavailable or cleanup cannot be registered.
