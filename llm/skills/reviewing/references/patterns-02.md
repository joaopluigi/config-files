
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
