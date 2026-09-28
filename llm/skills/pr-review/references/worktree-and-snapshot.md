# Worktree and snapshot

Normalize owner/repository, PR number, base/head commits, and reviewer identity.
When a local clone exists, resolve the PR head and use an exact detached
worktree; fetch `pull/NUMBER/head` only when explicitly authorized and needed.
Never check out the PR in the user's checkout.

```sh
git fetch origin "pull/NUMBER/head"
```

Without a clone, run `scripts/prepare_workspace.sh OWNER/REPOSITORY NUMBER`.
It returns an exact temporary snapshot; apply experiments there and remove it
afterward. Locate `AGENTS.md`, `CONTRIBUTING.md`, and `REVIEW.md` at the root
and relevant parents and pass them to the reviewing procedure.
