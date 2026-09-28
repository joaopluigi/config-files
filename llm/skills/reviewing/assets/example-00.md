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
