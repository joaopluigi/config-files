```

Example comment:

```text
Could we expose these as named read and refresh operations around a shared loader?
The call sites would show the requested behavior without making readers inspect the
boolean argument's meaning.
```

## 14. Separate classification from handling

Use when one callback first classifies an input and then performs the work for one
or more classifications.

```text
before:
  if message is control:
    handle control
  else:
    buffer event
    deduplicate event
    append event

after:
  if message is control:
    handle-control(message)
  else:
    handle-event(message)
```

Example comment:

```text
Could we keep classification in this handler and move event buffering into a named
operation? That would keep protocol decisions separate from event state changes.
```

## 15. Separate state calculation from effects

Use when a function both calculates the next state and mutates or publishes it.

```text
before:
  reset state
  merge incoming values
  publish state

after:
  next-state = reconcile(current-state, incoming-values)
  replace-state(next-state)
  publish-state(next-state)
```

Example comment:

```text
Could we extract the state reconciliation into a pure helper? That would leave this
function responsible for applying and publishing the result.
```

## 16. Keep lifecycle and recovery orchestration visible

Use when setup, cleanup, initial loading, error handling, and retry behavior are
mixed in one callback or branch.

```text
before:
  close old stream
  create stream
  attach handlers
  fetch initial data
  retry after failure

after:
  start-live():
    close-old-stream()
    open-stream()
    fetch-initial-data()

  attach-retry-handler()
```

Example comment:

```text
Could we extract stream setup and leave this function as the lifecycle orchestration?
That would make the order of cleanup, setup, and initial loading explicit.
```
