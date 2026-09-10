# Readability review examples

These examples are deliberately language-neutral. Translate the shape into the
language and conventions of the repository under review. They are examples of
concrete review comments, not rules to apply mechanically.

## 1. Name one hidden operation

Use when a callback or block performs one meaningful operation that has no name.

```text
before:
  for each value:
    read metadata
    normalize fields
    build result

after:
  define value-to-result(value):
    read metadata
    normalize fields
    build result

  for each value:
    value-to-result(value)
```

Example comment:

```text
Could we move the value transformation into a named helper? That could make the
collection pipeline easier to follow.
```

## 2. Split a large output function

Use when one function prints, renders, serializes, or formats several independent
sections.

```text
before:
  print heading
  for each item:
    format item
    print item
  print control endpoint
  if optional discovery exists:
    format discovery endpoint
    print discovery endpoint
  print trailing spacing

after:
  print-heading()
  for each item:
    print-item(item)
  print-control-endpoint(control)
  if optional discovery exists:
    print-discovery-endpoint(discovery)
  print-trailing-spacing()
```

Example comment:

```text
Could we extract the independent output sections into named helpers? That could
make the formatting flow easier to follow.
```

## 3. Extract a collection callback

Use when a collection callback contains multiple bindings, conditionals, or a
complete item transformation.

```text
before:
  update-values(values, value ->
    if value is a configuration object:
      patch started configuration
    else if value contains nested values:
      recursively patch nested values
    else:
      return value)

after:
  transform-value(value, context):
    if value is a configuration object:
      patch configuration
    else if value contains nested values:
      recursively transform nested values
    else:
      return value

  update-values(values, value -> transform-value(value, context))
```

Example comment:

```text
Could we move the per-value decision into a named helper and leave this function
responsible for traversing the map? That could give us better separation of
responsibilities.
```

## 4. Split preparation from orchestration

Use when one function prepares context and also performs the operation that consumes
it.

```text
before:
  operation(input):
    derive context from input
    validate context
    perform side effect
    format result

after:
  prepare-context(input):
    derive context
    validate context
    return context

  operation(input):
    context = prepare-context(input)
    perform side effect with context
    format result
```

Example comment:

```text
Could we move the context construction into a named helper? That could keep the
operation's sequence visible.
```

## 5. Replace nested bindings with a named branch operation

Use when an optional-value branch contains several operations rather than one simple
presence check.

```text
before:
  if optional value exists:
    bind parsed value
    update state
    emit event

after:
  handle-present-value(value):
    parsed = parse(value)
    update state
    emit event

  if optional value exists:
    handle-present-value(value)
```

Example comment:

```text
Could we give the present-value path a name? That could keep the guard separate
from the branch operation.
```

## 6. Make absent optional fields explicit

Use only when the shape of the returned data matters and absent values should not
be represented as present keys with null values.

```text
before:
  return {
    required: required-value,
    optional: maybe-value
  }

after:
  result = {required: required-value}
  if maybe-value exists:
    add optional to result
  return result
```

Example comment:

```text
Could we add the optional field only when the value exists? That would keep the
returned shape explicit and distinguish an absent value from a present null value.
```

Do not make this comment when null is meaningful in the local API.

## 7. Clarify shadowed or overloaded names

Use when the same name refers to different kinds of values in nearby code or when a
local name hides an important standard or domain operation.

```text
before:
  function start(..., status, ...):
    status = update(status)
    call status(...)

after:
  function start(..., status-state, ...):
    status-state = update(status-state)
    call status(...)
```

Example comment:

```text
Could we rename this binding to distinguish the state from the operation? That
could make the lifecycle code easier to follow.
```

## 8. Separate independent test scenarios

Use when one test contains behaviors that can fail for unrelated reasons.

```text
before:
  test shared-state:
    write state through channel A
    assert channel B sees it
    write state through channel B
    assert channel A sees it

after:
  test state-written-through-A-is-visible-through-B:
    ...

  test state-written-through-B-is-visible-through-A:
    ...
```

Example comment:

```text
Could we split these two directions into separate tests? They exercise different
boundaries, so a failure would identify which direction stopped sharing state.
```

## 9. Give assertions a behavior name

Use when assertions are not inside a named scenario or several assertions describe
different behaviors.

```text
before:
  test operation:
    assert result has status
    assert result has body
    assert result has headers

after:
  test operation:
    scenario "returns the expected status":
      assert result has status

    scenario "returns the expected body":
      assert result has body

    scenario "returns the expected headers":
      assert result has headers
```

Example comment:

```text
Could we put these assertions under named scenarios? It would make the failing
behavior visible without reading the assertion expression.
```

## 10. Keep one meaningful helper, not a helper chain

Use when proposing an extraction. The helper should own one coherent operation.
Do not split a five-line transformation into several helpers whose names add no
meaning.

```text
prefer:
  transform-item(item, context):
    prepare item
    apply transformation
    return item

  map item -> transform-item(item, context)

avoid:
  get-item-context(item)
  normalize-item-context(context)
  apply-item-context(item, context)
  return-item(item)
```

Example comment:

```text
Could we keep this as one `transform-item` helper? It gives the operation a clear
name without spreading a small transformation across several private functions.
```

## 11. Bind a repeated expression once

Use when one branch evaluates the same lookup or computation more than once and the
calls must stay consistent.

```text
before:
  consume next-value(input)
  transform next-value(input)

after:
  value = next-value(input)
  consume value
  transform value
```

Example comment:

```text
Could we bind this value once before consuming it? That keeps the input and
transformation tied to the same result and makes the branch easier to follow.
```

## 12. Name compound predicates

Use when several low-level checks decide one meaningful condition.

```text
before:
  if resource exists and resource is usable and resource is inside root:
    use resource

after:
  if is-usable-resource(resource):
    use resource
```

Example comment:

```text
Could we give this combined condition a name such as `is-usable-resource`? That
would make the decision visible without requiring readers to reconstruct it.
```

## 13. Replace boolean-blind operations

Use when a boolean argument selects different workflows rather than describing one
property of the same operation.

```text
before:
  load-items(false)
  load-items(true)

after:
  read-items()
  refresh-items()
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

## 17. Avoid unnecessary representation changes

Use when data is converted through an intermediate representation before a parser or
consumer that may already accept the original shape.

```text
before:
  response = request()
  text = convert-to-text(response)
  data = parse(text)

after:
  response = request()
  data = parse-response(response)
```

Example comment:

```text
Could we remove this intermediate conversion if the parser accepts the response
directly? That would keep the data boundary explicit and avoid unnecessary work.
```

Verify the local API before making this suggestion; the intermediate step may be
required by the parser or transport.

## 18. Keep task composition in the owning configuration

Use when a composite command is placed beside dependency or tool declarations and
its ownership is unclear.

```text
before:
  tool configuration:
    lint-fix = run cleanup and formatting

after:
  task configuration:
    lint-fix = run cleanup and formatting
```

Example comment:

```text
Could we define this composite task with the other task-runner commands? That would
make its ownership and constituent steps visible without mixing them with tool setup.
```

## 19. Comment on every applicable function

After finding one useful comment, continue scanning. Use a private review checklist:

```text
for each changed production file:
  for each changed function:
    check names
    check main flow
    check callbacks and bindings
    check optional branches
    check repeated responsibilities
    check nearby tests
    for each extraction candidate:
      inspect its bindings and branches again
      extend an existing comment or add a focused follow-up when another
      independent operation is hidden inside it
    record a comment or why none applies
```

Do not cap the review at one or two comments. Do not invent comments when a function
has no concrete readability or maintainability issue. An existing comment about a
larger block does not rule out a second comment for a smaller operation inside that
block when the two requests have distinct, concrete readability costs.
