
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
