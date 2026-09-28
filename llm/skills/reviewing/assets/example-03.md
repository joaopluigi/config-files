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
