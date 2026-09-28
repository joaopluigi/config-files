transform-items(items, context):
  map item -> transform-item(item, context)
```

This pattern applies to configuration patching, tree rewriting, syntax-tree
traversal, and other recursive data transformations.

### 15. Separate pure state transitions from effects

When a function computes the next state from existing state and new input, keep that
calculation separate from mutation, publication, persistence, or other effects.
This makes deduplication, reconciliation, reset, and replacement rules easier to
name and test independently.

Prefer:

```text
refresh-state(previous, incoming):
  return next state

apply-incoming(incoming):
  next = refresh-state(current state, incoming)
  replace current state with next
  publish next
```

Use the same boundary for backlog replacement and pending-input reconciliation:
keep request and parsing flow separate from the named state transition that resets,
merges, or replays data.

### 16. Keep lifecycle setup and recovery orchestration visible

When a lifecycle function creates a resource, attaches handlers, fetches initial
state, handles failure, retries, or starts a watcher, extract the independent setup
and recovery operations. The lifecycle entry point should show the ordered sequence:

```text
start-live():
  close-existing-stream()
  reset-pending-state()
  open-stream()
  fetch-backlog()
```

If a branch must perform multiple effects in a specific order, keep that order
explicit instead of hiding it in a dense expression. Give the branch a helper when
the recovery sequence can change independently.

When a response or event passes through several representations before parsing,
check whether representation changes or conversions are necessary and supported by
the local API. Avoid redundant serialization or decoding steps, but do not suggest
removing a boundary without verifying the accepted input shape.

### 17. Cleanup ownership

For resource-creating functions, check the partial-failure path:

```text
create resource A
create resource B
if B fails:
  is A released?
```

If not, make that the review comment. Prefer an example where one helper owns the
created resources and cleans up everything accumulated so far.

### 18. Review task and tool configuration

For build, lint, format, and task configuration, trace each command to the file that
owns its behavior. Keep dependency or tool declarations separate from composite
tasks that orchestrate several commands, and make the composition visible at the
call site or task definition.

When a change follows a convention from another repository, use that repository as
evidence rather than authority: compare the local task runner, dependency setup,
and command definitions before suggesting a move. Validate the actual command path
and document any limitation instead of inferring behavior from a filename alone.

### 19. Execute experimental code to validate suggestions

Do not treat a plausible refactor as validated until it has been executed when the
environment permits it. The experiment should test the proposed shape without
changing the user's checkout.

Use an isolated copy of the code, not the user's working checkout. When reviewing
a GitHub pull request, `pr-review`'s worktree/snapshot setup provides this copy;
for any other source of code, use the `git-worktree` skill or an equivalent
temporary copy.
