# Review behavior patterns

These patterns make review comments consistent across languages and repositories.
They are behavior rules, not a request to apply one language's syntax everywhere.
Use the local code's names, types, and conventions in the final example. Read
`assets/review-examples.md` before writing comments; it contains reusable pseudocode
for the structural patterns described here.

## What this review style is trying to do

A strong comment does not say only that code is long, nested, or hard to read. It
identifies the separate behavior hidden there and shows the smallest named
abstraction that would make that behavior clear.

Use this sequence internally:

```text
read the changed code
→ identify a concrete behavior or responsibility
→ find the smallest meaningful boundary
→ write one comment about that boundary
→ include a compact example of the proposed shape
```

The agent cannot guarantee that every review will produce the same comments as a
person. It can make the behavior repeatable by applying the rules below and by
checking each candidate comment against the diff, nearby code, and tests.

## Comment selection rules

### 1. Run the readability review

Every review performs one required pass focused on readability and maintainability.
Do not perform or post correctness, security, lifecycle, concurrency, or contract
findings unless the user explicitly asks for them.

For every changed production file, deliberately check:

- names that do not clearly describe transformations or decisions;
- functions whose main flow is hidden inside callbacks or bindings;
- nested bindings or optional-value branches that conceal meaningful operations;
- duplicated or hard-to-follow setup in tests;
- tests whose scenarios or assertions are difficult to interpret;
- structure that makes a normal future change harder than necessary.

If no concrete readability or maintainability concern exists, record which categories
were checked and why no comment applies. Do not invent a comment to fill a quota.

Do not stop after finding the first useful comment. Build a function inventory from
the diff and inspect every changed function and relevant test. For each one, either
write a concrete comment or record why no comment applies.

Inspect each candidate function recursively: after identifying a broad extraction,
read the extracted block and its branches again for smaller, independent operations.
An existing comment about a function or block does not replace this second pass. If
a nested operation is part of the same concern, extend the existing comment or add a
focused follow-up rather than repeating the broader request.

Pay special attention to:

- large output, formatting, or orchestration functions with several independent
  print, render, or response branches;
- functions whose binding block contains several intermediate values, especially
  when nested bindings hide preparation from the main operation;
- collection callbacks that transform one item, especially callbacks containing
  conditionals or multiple bindings;
- conditional branches whose body performs a complete transformation, even when
  the surrounding function already has a broader extraction candidate;
- recursive map transformations that can separate item handling from map traversal;
- tests with multiple behaviors or assertions whose failure messages are unclear.

### 2. Keep comments personal and unlabelled

Do not add `[P1]`, `[P2]`, or other priority markers by default. Posted comments
should read like direct notes from a reviewer, not automated issue labels.

Use this shape:

```text
Could we give this operation a name and keep the surrounding flow visible?

[small code example showing the proposed boundary]
```

For a readability comment, name the specific maintenance cost. Do not write only
"this is hard to read" or "please refactor."

### 3. Keep comments concise and evidence-based

A comment should normally contain one or two short sentences: a direct request and
one brief sentence naming the readability or maintenance benefit. Include a small
code example for a refactor-shaped suggestion when it makes the requested boundary
clear.

Do not include the entire investigation, an inventory of every related operation, or
a broad style argument. Put evidence in the source path and line, not in a long
narrative.

Pseudocode:

```text
for each changed production file:
  inspect names, boundaries, bindings, callbacks, and tests
  if there is a concrete maintenance cost:
    write one concise personal comment
    show the smallest useful correction
```

### 4. Prefer concrete maintainability issues over vague style

Post a comment when at least one of these is true:

- a meaningful operation is hidden inside a callback or binding;
- a function has several responsibilities that would change independently;
- names or structure force the reader to reconstruct the control flow;
- a test combines independent behaviors or has unexplained assertions;
- a small boundary would make future changes safer or easier to review.

Do not post a comment that only says the code could be cleaner. Explain the specific
readability or maintenance problem and show the proposed correction.

### 5. Keep one concern per comment

Do not combine unrelated requests such as function extraction, error handling, and
test changes in one inline comment. If they are independent, use separate comments.
Use a review-level comment only when the same pattern occurs repeatedly.

### 6. Prefer one meaningful helper over many tiny helpers

Extract the smallest helper that owns the separate behavior. Do not create a chain
of private functions only to remove a few lines. When two helpers would only split
one transformation into preparation and application, prefer one helper unless both
parts have independent names and callers.

Pseudocode:

```text
if the callback performs one coherent transformation:
  extract one helper for that transformation
else if the callback performs multiple independent operations:
  extract one helper per operation
else:
  leave the callback in place
```

### 7. Keep the public function's orchestration visible

A public function may coordinate several named helpers. Its body should show the
order and decision points, not the implementation details of every operation.

Pseudocode:

```text
public operation(input):
  validate input
  prepare shared context
  run named operation
  format or return result
```

If the public function also contains resource creation, cleanup, output formatting,
conditional transformation, and error translation, propose named private helpers.

## Binding and conditional patterns

### 8. Boolean flags that hide operations

When a boolean argument selects between different user-visible or
maintenance-relevant operations, prefer named operations around a shared helper.
Call sites such as `load(false)` or `run(true)` force the reader to inspect the
callee before understanding the requested behavior.

Prefer:

```text
private load-items(fetch):
  perform shared loading, error handling, and state updates

read-items():
  load-items(fetch-current-items)

refresh-items():
  load-items(rescan-items)
```

Do not flag a boolean that is a genuine property of one operation. Comment when
the flag is really selecting separate workflows, modes, or side effects and the
name at the call site hides that choice.

### 9. Nested bindings and repeated expressions

Do not flag every nested binding. Flag a nested binding when the inner binding owns a
separate responsibility or is only hiding a one-use intermediate value.

Prefer:

```text
private transform(input, context):
  bind intermediate values
  return transformed result

outer operation:
  decide whether transform applies
  call transform
```

Instead of:

```text
outer operation:
  if condition:
    bind intermediate values
    perform a separate transformation and side effect
```

The comment should name the operation to extract and include a small example:

```text
private transform-item(item, context):
  prepared = prepare(item, context)
  return apply-transformation(prepared)

for each item:
  transform-item(item, context)
```

When the outer function has several preparation bindings, prefer a helper that
owns those bindings so the caller keeps one visible orchestration binding. The
specific syntax is repository-dependent; the review request should describe the
boundary, not require a particular construct:

```text
private prepare-operation(input):
  derive first value
  derive second value from first value
  return prepared context

operation(input):
  context = prepare-operation(input)
  perform operation with context
```

If a branch calls the same lookup, parser, or computation more than once, inspect
whether it should be evaluated once and bound to a meaningful name before the
branch consumes or transforms it. This keeps argument consumption, validation, and
transformation tied to the same value and avoids duplicated work or drift between
repeated calls:

```text
value = read-value(input)
if value exists:
  use value for validation and transformation
```

If a compound condition is repeated or its individual checks do not explain the
decision, extract a named predicate that describes the rule being applied:

```text
if is-usable-resource(candidate):
  use candidate
```

If a conditional branch contains a complete transformation, inspect it even when
another extraction has already been identified around the branch. A focused helper
can make the decision visible and keep the outer traversal or orchestration small:

```text
private patch-component(component, extra):
  if component has config:
    patch started component
  else:
    patch unstarted component

for each component:
  patch-component(component, extra)
```

Use the repository's local naming and syntax in the actual comment. The pseudocode
is only the reasoning model.

### 10. Anonymous callbacks and completion handlers

When a collection callback or completion handler contains a named transformation,
result mapping, or terminal-state update, extract it.

Pseudocode:

```text
before:
  collection-map(value ->
    read metadata
    build result map
    normalize fields)

after:
  private value-to-result(value):
    read metadata
    build result map
    normalize fields

  collection-map(value-to-result)
```

For a callback that needs fixed context, use the clearest local form:

```text
collection-map(value -> patch-value(value, context))
```

Do not pass the helper directly when its input shape does not match the collection
operation. Adapt the arguments only when that is clearer than a short callback.

### 11. Optional values and classified input

Keep a guard or conditional inline when it expresses a simple presence check and
the body has one responsibility. Suggest an extraction when the branch also
performs a separate transformation, resource operation, or response construction:

```text
when optional value exists:
  perform several named operations
```

Prefer:

```text
private handle-optional-value(value, context):
  perform the several operations

when optional value exists:
  handle-optional-value(value, context)
```

Apply the same boundary to classified input. When a handler first determines
whether a message is a control frame, data event, success result, or error result,
keep that classification visible and move the work for each meaningful class into
a named operation:

```text
frame = parse-frame(message)
if is-control-frame(frame):
  handle-control-frame(frame)
else:
  handle-event(frame)
```

This is especially useful for stream or protocol handlers: control/status handling,
resynchronization, buffering, deduplication, and appending often change
independently. Do not combine them merely because they share one callback.

### 12. Conditional result construction and absent values

Flag result objects that deliberately or accidentally add fields with absent values
only when that changes the contract or conflicts with a local convention.

Pseudocode:

```text
result = required fields
if optional value exists:
  add optional field
return result
```

Use the repository's existing helper when one exists. Do not recommend omission of
an absent value when the absent value is meaningful in the local API.

### 13. Guard before effects

When a code path resolves, loads, invokes, or otherwise effects an optional symbol,
resource, or external dependency, validate the allowed target before the effect.

Pseudocode:

```text
validate target namespace or resource
resolve or load target
invoke target
validate result
```

If the code performs resolution first and validates second, comment on the ordering
and show the intended sequence.

## Function-size patterns

### 14. Identify responsibilities by verbs

List the meaningful verbs in a function. If the list contains unrelated work, use
that as evidence for extraction.

```text
bind listeners
boot world
load recipes
print URLs
```

This suggests separate helpers for listener setup, booting, recipe loading, and
startup output, while the public function keeps the orchestration order.

Do not demand extraction solely because a function has many lines. The comment must
identify the separate responsibility and show a useful helper boundary.

#### Large output and orchestration functions

When one function prints, renders, or formats several independent sections, inspect
each section as a possible named operation. For example:

```text
before:
  print heading
  for each item: format and print item
  format and print control endpoint
  if optional discovery exists: format and print discovery endpoint
  print trailing blank line

after:
  print-heading()
  for each item: print-item(item)
  print-control-endpoint(control)
  if optional discovery exists: print-discovery-endpoint(discovery)
  print-trailing-space()
```

The comment should point to the first changed branch that reveals the combined
responsibilities and include only the smallest useful extraction.

#### Recursive collection transformations

When a function traverses a nested map or tree and also decides how each item is
patched, transformed, or left unchanged, separate item handling from traversal:

```text
private transform-item(item, context):
  if item is a target type:
    transform item
  else if item contains nested items:
    recursively transform nested items
  else:
    return item

transform-items(items, context):
  map item -> transform-item(item, context)
```

Use the repository's local collection operation to apply the item helper. The
important boundary is that traversal stays separate from item handling:

```text
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

Use an isolated PR workspace:

```bash
scripts/prepare_workspace.sh OWNER/REPOSITORY NUMBER [TEMP_DESTINATION]
```

The script downloads an exact source snapshot at the PR head commit outside the
user's checkout. Apply the proposed change only in that temporary workspace. Keep
the original checkout untouched.

Use this sequence:

```text
prepare an isolated copy of the PR
run the narrowest relevant command on the unchanged copy
apply the proposed change in the isolated copy
run the same command again
compare the baseline and proposed results
remove the temporary workspace
record the command, output, and any limitation
```

Inspect the repository first and use the narrowest tool it already supports. Depending
on the language and project, that may be an interpreter, REPL, compiler, type
checker, formatter, linter, unit test, integration test, or another project task.

```text
project configuration
→ identify the existing tool and command
→ choose the smallest relevant scope
→ run it against the proposed code shape
```

Do not assume one launcher, package manager, alias, or test command. Read the
project files and existing scripts first. If the repository cannot run locally, say
the suggestion is unverified instead of claiming that it works.

For a structural suggestion, validate both syntax and behavior when practical:

```text
current implementation → expected result
proposed helper shape  → same expected result
```

If the experiment fails because the proposed shape is invalid, revise or withdraw
the comment. If it fails because the environment is unavailable, keep the comment
but mark the suggestion as unverified in the review report.

## Test patterns

### 20. Describe every assertion

Every assertion should sit inside a scenario with a clear name:

```text
test operation:
  scenario "preserves the input type":
    assert expected result

  scenario "reports an invalid input":
    assert expected error
```

If a test has multiple independent assertions without scenario names, comment on the
test definition and show one representative rewrite rather than repeating the same
comment on every assertion. Related cases may remain under one top-level test when
each behavior has its own named scenario and the shared setup keeps the contract
clear.

### 21. Keep independent behaviors separate

Split a test when its scenarios can fail for unrelated reasons:

```text
one test: request written through HTTP is visible to a flow
one test: state written by a flow is visible through HTTP
```

Keep scenarios together when they are multiple cases of the same production
operation and share setup that makes the context clearer.

### 22. Assert stable results completely

When a result map is stable, compare the complete result. Use focused assertions
when fields are intentionally variable, such as ports, timestamps, generated IDs,
or nondeterministic ordering.

Pseudocode:

```text
stable response → compare complete response
variable response → compare stable projection and explain why
```

## Comment placement and wording

### 23. Anchor comments to the responsible line

Choose the changed line where the behavior is introduced:

- anonymous callback → callback start or binding containing it;
- nested transformation → inner binding or transformation call;
- resource leak → resource creation that lacks cleanup;
- ambiguous contract → result construction or selection;
- test structure → test definition or first representative assertion.

If the exact line is not part of the diff, anchor to the nearest changed line and
name the symbol or block in the comment.

### 24. Use this comment shape

```text
Could we fix this before merging? The current code does X. In scenario Y, that
causes Z.

[small code example when it makes the fix unambiguous]
```

A code example should show the shape, not a complete rewrite. Use the surrounding
function and variable names when possible. Do not include unrelated formatting
changes. A code example or concrete suggested shape is expected whenever the comment
requests a code or test change. For contract or runtime failures whose correction
depends on a design choice, state the needed behavior and show a small example when
one can clarify it; do not invent a misleading implementation.

### 25. Keep repository guidance internal

Use local review guidance to decide what to comment on, but do not mention the
name of the guidance document in the posted comment unless the user explicitly
asks for that. The comment should explain the code-level reason instead.

### 26. Final candidate check

Before posting a candidate comment, ask:

```text
Is this tied to a changed line?
Is the behavior observable from the source?
Is the consequence concrete?
Is this concern already covered?
Does the request have one clear action?
Is this a concrete readability, maintainability, or implementation issue?
Does the comment avoid visible priority markers unless requested?
Would the code example remove ambiguity?
Is the example small and locally consistent?
```

Reject the comment if the answer is no to any of the first seven questions. Add the
code example for refactor-shaped fixes and whenever it makes the correction clearer.
