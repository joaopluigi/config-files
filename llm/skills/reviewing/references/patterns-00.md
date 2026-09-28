# Review behavior patterns

These patterns make review comments consistent across languages and repositories.
They are behavior rules, not a request to apply one language's syntax everywhere.
Use the local code's names, types, and conventions in the final example. Read
`assets/review-examples.md` before writing comments; it contains reusable pseudocode
for the structural patterns described here.

## What this review style is trying to do

A strong comment does not say only that code is long, nested, or hard to read. It
identifies the separate behavior hidden there and shows the smallest named
abstraction that would make that behavior clear.

Use this sequence internally:

```text
read the changed code
→ identify a concrete behavior or responsibility
→ find the smallest meaningful boundary
→ write one comment about that boundary
→ include a compact example of the proposed shape
```

The agent cannot guarantee that every review will produce the same comments as a
person. It can make the behavior repeatable by applying the rules below and by
checking each candidate comment against the diff, nearby code, and tests.

## Comment selection rules

### 1. Run the readability review

Every review performs one required pass focused on readability and maintainability.
Do not perform or post correctness, security, lifecycle, concurrency, or contract
findings unless the user explicitly asks for them.

For every changed production file, deliberately check:

- names that do not clearly describe transformations or decisions;
- functions whose main flow is hidden inside callbacks or bindings;
- nested bindings or optional-value branches that conceal meaningful operations;
- duplicated or hard-to-follow setup in tests;
- tests whose scenarios or assertions are difficult to interpret;
- structure that makes a normal future change harder than necessary.

If no concrete readability or maintainability concern exists, record which categories
were checked and why no comment applies. Do not invent a comment to fill a quota.

Do not stop after finding the first useful comment. Build a function inventory from
the diff and inspect every changed function and relevant test. For each one, either
write a concrete comment or record why no comment applies.

Inspect each candidate function recursively: after identifying a broad extraction,
read the extracted block and its branches again for smaller, independent operations.
An existing comment about a function or block does not replace this second pass. If
a nested operation is part of the same concern, extend the existing comment or add a
focused follow-up rather than repeating the broader request.

Pay special attention to:

- large output, formatting, or orchestration functions with several independent
  print, render, or response branches;
- functions whose binding block contains several intermediate values, especially
  when nested bindings hide preparation from the main operation;
- collection callbacks that transform one item, especially callbacks containing
  conditionals or multiple bindings;
- conditional branches whose body performs a complete transformation, even when
  the surrounding function already has a broader extraction candidate;
- recursive map transformations that can separate item handling from map traversal;
- tests with multiple behaviors or assertions whose failure messages are unclear.

### 2. Keep comments personal and unlabelled

Do not add `[P1]`, `[P2]`, or other priority markers by default. Posted comments
should read like direct notes from a reviewer, not automated issue labels.

Use this shape:

```text
Could we give this operation a name and keep the surrounding flow visible?

[small code example showing the proposed boundary]
```

For a readability comment, name the specific maintenance cost. Do not write only
"this is hard to read" or "please refactor."

### 3. Keep comments concise and evidence-based

A comment should normally contain one or two short sentences: a direct request and
