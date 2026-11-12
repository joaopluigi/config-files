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
6. Once all ideators have returned, the orchestrator synthesizes their proposals. The
   orchestrator owns this synthesis and must use the DecisionModel v1 workflow:
   - model named dimensions, allowed values, hard constraints, assumptions, evidence,
     and the uncertainty boundary;
   - validate that the model is complete, coherent, and supported before solving;
   - explore only valid combinations inside the bounded finite space;
   - compare viable combinations against goals, constraints, risks, compatibility,
     and evidence;
   - report certainty, separating exact, bounded, heuristic, and unresolved outcomes.
   The orchestrator must identify the independent choices and their constraints, find
   valid combinations beyond the proposals when the bounded model permits them, and
   map recommended combinations to the proposals they draw from. Do not spawn a
   default synthesis sub-agent. A separate agent may be delegated only when the user
   explicitly requests that workflow and the delegation remains within the approved
   scope.
7. Apply a traffic-light gate before solving: use the solver only for a finite closed
   constraint model with explicit hard constraints and finite domains (**green**); make
   ambiguities, assumptions, missing values, and interpretation choices explicit and
   pause for clarification when they could change the model (**amber**); do not use
   it for vague, subjective, open-ended, missing-fact, or executable-code problems
   (**red**).
8. Compare the ideator proposals and the DecisionModel recommendations, and present
   multiple alternatives. For each alternative, state its benefits, costs, risks,
   compatibility impact, certainty level, and unresolved questions. Say when an
   alternative is a new combination not present in any single proposal.
9. Define the intended behavior as explicit properties or invariants.
10. Write a detailed implementation plan that names the affected behavior, scope, files or boundaries, validation, and predicted consequences. Include a table mapping every specified behavior to the checks that will establish it.
11. Spawn a `critic` agent to critique the plan and its predicted consequences independently.
12. Resolve the critique and present the alternatives and recommended plan to
    the user. State uncertainty explicitly and bound it: distinguish observed facts,
    model-derived possibilities, preferences, assumptions, missing evidence, and
    questions that require user judgment. Do not present an exhaustive result when
    validation failed or the model boundary is incomplete.
13. If the model is invalid or unsupported, or solving times out or returns a
    truncated result, do not treat that output as a conclusion. State the failure,
    classify the outcome as unresolved, and fall back to delegation, more evidence,
    clarification, or user approval. Never upgrade a partial or failed result to
    exact or bypass the delegation-first boundary.
14. Stop until the user approves the plan.
15. Record the approval and produce an approved plan artifact containing the goal,
    selected alternative, scope, properties, evidence, validation, uncertainty,
    and approval.

## DecisionModel boundary

DecisionModel v1 is a bounded decision-support interface for structured inputs and
outputs. Planning must not expose arbitrary evaluation, executable expressions, or a
general-purpose evaluation surface. Treat the solver as an implementation detail and
keep planning focused on the model, validation, exploration, comparison, and certainty
abstractions described above.

## Outputs

An approved plan artifact, or a clearly marked unapproved proposal when the user has not approved it.

## Evidence

Ground task-specific claims in repository files, documentation, observed behavior, tests, or other real sources. Record the source for each important claim and separate observed facts from assumptions and predictions.

## Handoff gate

Do not start planning/design until an accepted evidence artifact exists that covers every search lane with status, sources, and reason; source provenance and claims; prior-art reuse decisions; gaps; contradictions; uncertainty; and stop status.

## Stop conditions

Stop without implementation when the problem is not understood, required evidence is missing, a user decision is unresolved, or the user has not approved the plan.
