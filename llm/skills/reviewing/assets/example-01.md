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
