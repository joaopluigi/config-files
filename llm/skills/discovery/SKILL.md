---
name: discovery
description: Mandatory evidence-first discovery and prior-art procedure.
---

# Discovery

## Search lanes

For substantive work, search each applicable lane before proposing a design:

- local project files and history;
- related organization projects;
- official documentation and standards;
- issues, pull requests, and discussions;
- public prior art and packages;
- domain references.

Mark all six canonical lanes in `laneMatrix` — `local project files and history`, `related organization projects`, `official documentation and standards`, `issues, pull requests, and discussions`, `public prior art and packages`, and `domain references` — with exactly one status (`searched`, `not applicable`, or `inaccessible`), sources, and a non-empty reason.

## Prior-art report

Before new design or implementation, report at least one structured prior-art decision, even when no candidate is found:

- candidates and source provenance;
- evidence and search scope;
- source quality/type and claims supported;
- applicability and reuse/adapt/reject decision, including `none found` when applicable;
- reason, gaps, contradictions, and remaining uncertainty;
- stop status and next search condition, if any.

Prefer reuse before invention. Distinguish evidence from analogy.

## Coordination and stop conditions

Independent lanes may fan out concurrently, but parallel discovery scopes must be non-overlapping unless intentional overlap is recorded with a reason. Wait for prerequisites before dependent research. Stop when applicable lanes are covered, contradictions are resolved or explicitly bounded, and additional searching has diminishing returns. A trivial message still gets one delegated discovery classification and may return `not applicable`.

## Output

Return a result matching [`assets/discovery-result.schema.json`](assets/discovery-result.schema.json): lane matrix; source provenance, type, and claims; prior-art candidates with reuse/adapt/reject decisions; contradictions; gaps; uncertainty; and stop status. The schema is a documented validation boundary, not a runtime sequencing guarantee: the ECA model/runtime must enforce discovery before dependent work. Do not edit, implement, or delegate unless explicitly assigned that role.
