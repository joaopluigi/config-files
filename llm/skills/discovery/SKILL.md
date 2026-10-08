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

Run each applicable lane as a separate, independent subagent: one lane per subagent, given the same question and constraints, without sharing the other lanes' results. For example, use an `investigator` for local project files and history and a `researcher` for the external lanes. Each lane subagent searches only its own lane and returns its status, sources, claims, and prior-art candidates.

Record all six lanes, each with exactly one status (`searched`, `not applicable`, or `inaccessible`), its sources, and a non-empty reason.

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

Lane subagents may run concurrently. Keep their scopes non-overlapping unless intentional overlap is recorded with a reason. Wait for prerequisites before dependent research. Combine the lane results only after every lane subagent has returned. Stop when applicable lanes are covered, contradictions are resolved or explicitly bounded, and additional searching has diminishing returns. A trivial message still gets one delegated discovery classification and may return `not applicable`.

## Output

Return the status, sources, and reason for each lane; source provenance, type, and claims; prior-art candidates with reuse/adapt/reject decisions; contradictions; gaps; uncertainty; and stop status. Discovery must finish before dependent work starts. Do not edit or implement unless explicitly assigned that role; delegate only the lane searches.
