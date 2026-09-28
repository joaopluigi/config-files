---
name: pr-review
description: "Operate on a GitHub pull request in an isolated worktree."
---

# Pull request review mechanics

Pair this skill with `reviewing` for review criteria. Use it when given a repository and pull request number or URL.

Reference index: [`references/REFERENCE.md`](references/REFERENCE.md). Read it to choose the relevant reference document before using detailed mechanics.

## Modes

Default to read-only. Pending review may create comments but must not submit. Submission requires explicit confirmation immediately before the submit command. Never approve or request changes implicitly.

## Procedure

1. Resolve repository, PR number, base/head commits, reviewer identity, and authentication.
2. Read metadata, diff, checks, changed files, reviews, and pending review state with the scripts under `scripts/`.
3. Use an exact detached worktree at the PR head, or the snapshot script when no local clone exists. Never alter the user's checkout.
4. Locate `AGENTS.md`, `CONTRIBUTING.md`, and `REVIEW.md`; pass them to the reviewing procedure.
5. For pending comments, create JSON with `commit_id`, `path`, changed-file line, `side`, and body. Use fenced code blocks for examples.
6. Verify every write with the verification script. Do not execute submission merely to validate syntax.

## Outputs

See [`references/REFERENCE.md`](references/REFERENCE.md) for review modes,
workspace setup, pending-review mechanics, command details, and output rules.

Report mode, findings with file and line, proposed or posted text, sources, commands, worktree setup and cleanup, and exact review status. If no actionable finding exists, leave GitHub unchanged.

## Stop conditions

Stop when target or mode is unclear, authentication is wrong, the requested write is not authorized, or the exact isolated source cannot be obtained.
