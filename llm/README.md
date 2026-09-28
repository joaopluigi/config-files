# The Pyramid and the Pharaoh

A Pharaoh once asked for a pyramid that would outlast fashion, software, and very
confident scribes. The workers replied, “Fine. But please label the stones.”

So the pyramid got a simple arrangement: one rulebook for everyone, specialist
scrolls for repeatable jobs, role cards for boundaries, a small chamber for
settings, and a worklog clerk who recorded what happened. The Pharaoh kept the
map. The workers built only the stones assigned to them. Nobody replaced a
load-bearing wall while claiming to tidy the doorway.

When a new job arrived, they discovered the ground, checked the old stones,
planned the smallest safe addition, built it, and tested the result. If a stone
cracked, they reproduced the crack before blaming the camel. Then they stopped
when the approved work was complete.

## Ownership map

- `rules/` — shared behavior and principles.
- `skills/` — reusable task procedures and their references.
- `agents/` — role boundaries and responsibilities.
- `eca/` — runtime configuration.
- `mcp/worklog/` — worklog implementation and its tests.

## Lifecycle

1. Discover the task, sources, conventions, and prior art.
2. Define scope, properties, evidence, and validation.
3. Obtain approval before planned implementation.
4. Make the smallest compatible change.
5. Run focused checks and report observed results.
6. Record the work and stop; do not invent extra pyramid.
