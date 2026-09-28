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
