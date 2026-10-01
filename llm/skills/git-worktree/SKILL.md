---
name: git-worktree
description: "Use before making any changes in any Git repository directory. Isolate tests, experiments, edits, builds, repairs, reviews, and other repository actions in a detached temporary worktree so the user's checkout remains unchanged."
---

# Git Worktree Isolation

Use this skill **before making any changes in any Git repository directory**. This includes editing source files, running builds or repairs and preparing commits. The purpose is to keep the user's existing checkout separate from task work. Read-only inspection that does not operate on a local checkout, such as reading a pinned remote API response, may happen before a local worktree exists. Target resolution, an explicitly authorized fetch, and recording the original checkout state are also setup exceptions; they must not switch branches or modify checkout files. Once a local checkout is used for task work, follow this procedure.

This skill documents a procedure only. It does not provide scripts and git-worktree command specifics.

## Procedure

1. Resolve the existing checkout, target commit, status, HEAD, and worktree list.
2. Create a unique detached worktree outside the checkout at the exact target commit.
3. Register cleanup immediately. Run all task commands in that worktree.
4. If baseline comparison is needed, create a second detached worktree at the same commit and keep it unchanged.
5. Remove only worktrees created by this task. Recheck the original checkout, HEAD, status, and worktree list.
