
- anonymous callback → callback start or binding containing it;
- nested transformation → inner binding or transformation call;
- resource leak → resource creation that lacks cleanup;
- ambiguous contract → result construction or selection;
- test structure → test definition or first representative assertion.

If the exact line is not part of the diff, anchor to the nearest changed line and
name the symbol or block in the comment.

### 24. Use this comment shape

```text
Could we fix this before merging? The current code does X. In scenario Y, that
causes Z.

[small code example when it makes the fix unambiguous]
```

A code example should show the shape, not a complete rewrite. Use the surrounding
function and variable names when possible. Do not include unrelated formatting
changes. A code example or concrete suggested shape is expected whenever the comment
requests a code or test change. For contract or runtime failures whose correction
depends on a design choice, state the needed behavior and show a small example when
one can clarify it; do not invent a misleading implementation.

### 25. Keep repository guidance internal

Use local review guidance to decide what to comment on, but do not mention the
name of the guidance document in the posted comment unless the user explicitly
asks for that. The comment should explain the code-level reason instead.

### 26. Final candidate check

Before posting a candidate comment, ask:

```text
Is this tied to a changed line?
Is the behavior observable from the source?
Is the consequence concrete?
Is this concern already covered?
Does the request have one clear action?
Is this a concrete readability, maintainability, or implementation issue?
Does the comment avoid visible priority markers unless requested?
Would the code example remove ambiguity?
Is the example small and locally consistent?
```

Reject the comment if the answer is no to any of the first seven questions. Add the
code example for refactor-shaped fixes and whenever it makes the correction clearer.
