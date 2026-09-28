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
