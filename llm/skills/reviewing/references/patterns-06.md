
Use this sequence:

```text
prepare an isolated copy of the code
run the narrowest relevant command on the unchanged copy
apply the proposed change in the isolated copy
run the same command again
compare the baseline and proposed results
remove the temporary copy
record the command, output, and any limitation
```

Inspect the repository first and use the narrowest tool it already supports. Depending
on the language and project, that may be an interpreter, REPL, compiler, type
checker, formatter, linter, unit test, integration test, or another project task.

```text
project configuration
→ identify the existing tool and command
→ choose the smallest relevant scope
→ run it against the proposed code shape
```

Do not assume one launcher, package manager, alias, or test command. Read the
project files and existing scripts first. If the repository cannot run locally, say
the suggestion is unverified instead of claiming that it works.

For a structural suggestion, validate both syntax and behavior when practical:

```text
current implementation → expected result
proposed helper shape  → same expected result
```

If the experiment fails because the proposed shape is invalid, revise or withdraw
the comment. If it fails because the environment is unavailable, keep the comment
but mark the suggestion as unverified in the review report.

## Test patterns

### 20. Describe every assertion

Every assertion should sit inside a scenario with a clear name:

```text
test operation:
  scenario "preserves the input type":
    assert expected result

  scenario "reports an invalid input":
    assert expected error
```

If a test has multiple independent assertions without scenario names, comment on the
test definition and show one representative rewrite rather than repeating the same
comment on every assertion. Related cases may remain under one top-level test when
each behavior has its own named scenario and the shared setup keeps the contract
clear.

### 21. Keep independent behaviors separate

Split a test when its scenarios can fail for unrelated reasons:

```text
one test: request written through HTTP is visible to a flow
one test: state written by a flow is visible through HTTP
```

Keep scenarios together when they are multiple cases of the same production
operation and share setup that makes the context clearer.

### 22. Assert stable results completely

When a result map is stable, compare the complete result. Use focused assertions
when fields are intentionally variable, such as ports, timestamps, generated IDs,
or nondeterministic ordering.

Pseudocode:

```text
stable response → compare complete response
variable response → compare stable projection and explain why
```

## Comment placement and wording

### 23. Anchor comments to the responsible line

Choose the changed line where the behavior is introduced:
