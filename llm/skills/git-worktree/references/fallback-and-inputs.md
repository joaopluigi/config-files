# Fallback and inputs

Run every test, build, formatter, and experiment in the isolated worktree. Never
switch the user's checkout. If no clone exists, use a disposable exact snapshot
and label it as weaker isolation; do not call it a Git worktree.

A worktree does not copy ignored or untracked inputs, credentials, environments,
services, or caches. Copy an explicitly recorded untracked input or use a
committed revision. Stop if the commit cannot resolve, the destination overlaps
an existing worktree, or cleanup cannot be registered.
