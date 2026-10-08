---
name: planning
description: "Plan additive changes by exploring the software, comparing independent alternatives, defining properties, and obtaining user approval before implementation."
---

# Planning

This skill plans additive changes without implementing them. It produces an
approved plan that another person or process can use to implement the change.

## Inputs

- The user's request and constraints
- The relevant repository, documentation, interfaces, and tests
- The definition of what done means, if already provided

## Procedure

1. State the goal, problem, constraints, compatibility boundary, and done condition.
2. Record the goal, plan, evidence, decisions, and completion status as the task progresses.
3. Spawn an `investigator` to map the relevant software, interfaces, documentation, tests,
   and existing behavior.
4. Identify the problem in concrete, observable terms.
5. For non-trivial work, spawn at least four independent `ideator` agents. Give each
   the same problem statement and constraints without sharing the other proposals.
6. Once all ideators have returned, synthesize their proposals. Spawn a `synthesizer`
   agent, or another agent if none is available, with the same problem statement and
   constraints plus all ideator proposals. The synthesis must:
   - identify the independent choices that vary across the proposals and the
     constraints between them;
   - find every valid combination of those choices, not only the ones the proposals
     already contain;
   - return recommended combinations, each mapped to the proposals it draws from.
   Keep the ideators isolated from one another; only the synthesis step sees all
   proposals.
7. Compare the ideator proposals and the synthesizer's recommended combinations, and
   present multiple alternatives. For each alternative, state its benefits, costs,
   risks, compatibility impact, and unresolved questions. Say when an alternative is a
   new combination not present in any single proposal.
8. Define the intended behavior as explicit properties or invariants.
9. Write a detailed implementation plan that names the affected behavior, scope, files or boundaries, validation, and predicted consequences. Include a table mapping every specified behavior to the checks that will establish it.
10. Spawn a `critic` agent to critique the plan and its predicted consequences independently.
11. Resolve the critique and present the alternatives and recommended plan to the
    user.
12. Stop until the user approves the plan.
13. Record the approval and produce an approved plan artifact containing the goal,
    selected alternative, scope, properties, evidence, validation, and approval.

## Outputs

An approved plan artifact, or a clearly marked unapproved proposal when the user has
not approved it.

## Evidence

Ground task-specific claims in repository files, documentation, observed behavior,
tests, or other real sources. Record the source for each important claim and separate
observed facts from assumptions and predictions.

## Handoff gate

Do not start planning/design until an accepted evidence artifact exists that covers every search lane with status, sources, and reason; source provenance and claims; prior-art reuse decisions; gaps; contradictions; uncertainty; and stop status.

## Stop conditions

Stop without implementation when the problem is not understood, required evidence is missing, a user decision is unresolved, or the user has not approved the plan.
