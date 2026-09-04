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
3. Create or continue a worklog for the task.
4. Spawn an authoring agent with only the approved scope and relevant sources.
5. Spawn a separate agent to author tests from the stated properties, using the
   repository's available testing approach.
6. Inspect the changes for scope and conformity with the surrounding code.
7. Run the implementation and relevant tests or checks. Record observed results.
8. Spawn an independent adversarial review agent with the implementation, properties,
   evidence boundary, and validation results.
9. Present the review findings to the user and identify which flaws, if any, are
   selected for remediation.
10. Spawn a remediation agent only for the selected flaws and keep the approved scope.
11. Run the affected tests or checks again after remediation.
12. Repeat the review, findings, and selected-remediation cycle until review produces
    no actionable flaws or successive reviews produce the same findings.
13. Run final compatibility checks and record the result.

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

## Stop conditions

Stop without implementation when the plan is not approved or lacks scope or
properties. Stop the review loop when there are no actionable flaws or when successive
reviews produce the same findings. Record why the loop stopped and whether any findings
remain selected for later work.

## Independence

This skill is complete on its own. It does not require another skill, invoke another
skill, or assume that another skill produced the approved plan.
