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
