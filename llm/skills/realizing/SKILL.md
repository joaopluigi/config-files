---
name: realizing
description: "Implement and verify an approved change through scoped authoring, property-based tests, independent review, and selected remediation."
---

# Realizing

This skill implements and verifies an approved change. It accepts an approved plan as
an input and does not decide whether the change should be made.

## Inputs

- An approved implementation or repair plan
- The plan's scope, properties, evidence, validation, and approval status
- The repository and its available tools and tests

## Procedure

1. Read the approved plan and confirm that it contains scope, properties, validation,
   evidence, and recorded user approval.
2. Stop if approval, scope, or acceptance properties are missing.
3. Record the goal, scope, evidence, decisions, and validation as the task progresses.
4. Select the approved plan's implementation mode:
   - **TDD mode is the default** when the approved plan does not explicitly declare a
     mode. Do not infer standard mode from omission.
   - **Standard mode** is permitted only when the approved plan explicitly records an
     exception approved by the user. The exception record must include the reason TDD
     cannot be used, the affected scope, the alternative validation to be used, and
     affirmative user approval. Task size, urgency, implementation preference, or
     missing tests are not sufficient reasons to silently switch to standard mode.
   - If TDD cannot be used and the approved plan has no qualifying exception record,
     stop and ask the user for explicit approval of the exception before implementation.
   - **Standard mode** preserves the existing executor-before-tester sequence: spawn an
     `executor` agent to implement only the approved scope, giving it the relevant
     sources; then spawn a `tester` agent to author tests from the stated properties
     and run the relevant checks.
   - **TDD mode** uses the tester-first sequence below. The default and any exception
     approval must be determined from the approved plan before realization; do not
     switch modes during realization.
5. In TDD mode, spawn a `tester` agent before implementation. It may create or update
   test files from the approved properties, but must not modify implementation code.
   Require it to run the tests before implementation (the red phase), classify
   expected assertion failures separately from setup or environment failures, and
   pass the test paths and observed output to the executor. A setup or environment
   failure is not evidence of a valid red phase and must be reported as a stop or
   unresolved validation condition.
6. In TDD mode, after receiving the tester's artifacts and red-phase results, spawn an
   `executor` agent to implement only the approved scope against those artifacts and
   the relevant sources. The executor must not broaden the approved scope.
7. In TDD mode, after implementation, require the tester to rerun the same tests and
   report green verification, including commands and output. In standard mode, run
   the implementation and relevant tests or checks as before.
8. Inspect the changes for scope and conformity with the surrounding code.
9. Run the implementation and relevant tests or checks. Record observed results.
10. Spawn a `reviewer` agent with the implementation, properties, evidence boundary,
    and validation results.
11. Present the review findings to the user and identify which flaws, if any, are
    selected for remediation.
12. Spawn an `executor` agent to implement only the selected flaws, keeping the
    approved scope.
13. Run the affected tests or checks again after remediation.
14. Repeat the review, findings, and selected-remediation cycle until review produces
    no actionable flaws or successive reviews produce the same findings.
15. Run final compatibility checks and record the result.

Prompt text documents this workflow contract only; it does not provide runtime
enforcement of agent ordering, file authority, or test outcomes.

## Outputs

- The implemented change
- Tests or checks covering the stated properties
- Review findings and remediation decisions
- A recorded final validation result

## Evidence

Use the approved plan as the source of truth for scope and properties. Ground review
findings in changed files, tests, observed behavior, repository guidance, or official
documentation when an external behavior is involved. Do not report unsupported flaws.

Use an existing property-testing convention when the repository provides one. If no
such convention exists, use the narrowest available checks that demonstrate the stated
properties and do not add a testing dependency without a separate decision.

## Handoff gate

Do not start implementation until an approved discovery/prior-art artifact is accepted. Validate it against [`../discovery/assets/discovery-result.schema.json`](../discovery/assets/discovery-result.schema.json); it must contain the lane matrix, sources and provenance, reuse decisions, gaps, contradictions, uncertainty, and stop status. This is a handoff gate, not a repeat of the discovery procedure.

## Stop conditions

Stop without implementation when the plan is not approved or lacks scope or
properties. Stop the review loop when there are no actionable flaws or when successive
reviews produce the same findings. Record why the loop stopped and whether any findings
remain selected for later work.

## Independence

This skill is complete on its own. It does not require another skill, invoke another
skill, or assume that another skill produced the approved plan.
