---
name: worktree-lifecycle
description: "Use whenever a Git task involves modifying, building, testing, or reviewing: create or use a managed isolated worktree rather than the original checkout; also use it for concurrent writers and integration."
---

# Worktree Lifecycle

Use this skill **before making any changes in any Git repository directory**. This includes editing source files, running builds or repairs and preparing commits. The purpose is to keep the user's existing checkout separate from task work. Read-only inspection that does not operate on a local checkout, such as reading a pinned remote API response, may happen before a local worktree exists. Target resolution, an explicitly authorized fetch, and recording the original checkout state are also setup exceptions; they must not switch branches or modify checkout files. Once a local checkout is used for task work, follow this procedure.

This skill documents a procedure only. It does not provide scripts or worktree command specifics.

## Procedure

1. Resolve the existing checkout, target commit, status, HEAD, and worktree list.
2. Create a unique detached worktree outside the checkout at the exact target commit.
3. Register cleanup immediately. Run all task commands in that worktree.
4. If baseline comparison is needed, create a second detached worktree at the same commit and keep it unchanged.
5. Environments live under `/tmp` (for example `/tmp/<repo>-<task>-<id>`).
6. For concurrent writers, create one detached environment per writer from the same base commit. Each writer commits locally in its own environment and never pushes.
7. To combine results, create an integration environment at the base, apply each writer's commits in the planned order, resolve conflicts, and run the full verification there.
8. Remove only the environments this task created. Recheck the original checkout, HEAD, status, and worktree list.
