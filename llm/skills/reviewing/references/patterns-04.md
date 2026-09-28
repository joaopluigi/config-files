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
