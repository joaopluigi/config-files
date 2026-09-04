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
2. Create or continue a worklog for the task.
3. Spawn an explorer to map the relevant software, interfaces, documentation, tests,
   and existing behavior.
4. Identify the problem in concrete, observable terms.
5. For non-trivial work, spawn at least four independent ideation agents. Give each
   the same problem statement and constraints without sharing the other proposals.
6. Compare the proposals and present multiple alternatives. For each alternative,
   state its benefits, costs, risks, compatibility impact, and unresolved questions.
7. Define the intended behavior as explicit properties or invariants.
8. Write a detailed implementation plan that names the affected behavior, scope,
   files or boundaries, validation, and predicted consequences.
9. Have an independent peer critique the plan and its predicted consequences.
10. Resolve the critique and present the alternatives and recommended plan to the
    user.
11. Stop until the user approves the plan.
12. Record the approval and produce an approved plan artifact containing the goal,
    selected alternative, scope, properties, evidence, validation, and approval.

## Outputs

An approved plan artifact, or a clearly marked unapproved proposal when the user has
not approved it.

## Evidence

Ground task-specific claims in repository files, documentation, observed behavior,
tests, or other real sources. Record the source for each important claim and separate
observed facts from assumptions and predictions.

## Stop conditions

Stop without implementation when the problem is not understood, required evidence is
missing, a user decision is unresolved, or the user has not approved the plan.

## Independence

This skill is complete on its own. It does not require another skill, invoke another
skill, or assume that another skill will consume its output.
