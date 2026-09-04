---
name: repairing
description: "Diagnose failures through reproduction, competing hypotheses, empirical evidence, independent critique, and a user-approved repair plan."
---

# Repairing

This skill diagnoses corrective work without implementing the repair. It produces an
approved repair plan grounded in observed failure and evidence.

## Inputs

- The reported symptom or failing behavior
- The expected behavior or compatibility requirement
- The relevant repository, documentation, interfaces, and tests

## Procedure

1. State the symptom, expected behavior, constraints, compatibility boundary, and
   done condition.
2. Create or continue a worklog for the task.
3. Explore the relevant implementation, interfaces, documentation, and tests.
4. Reproduce the failure and record the observed output or error.
5. Develop multiple hypotheses that could explain the symptom.
6. Describe the observable consequences of each hypothesis.
7. Run the smallest REPL experiment, test, trace, or other check that distinguishes
   the hypotheses.
8. Select the best-supported hypothesis and have an independent critic examine it
   using only the question and evidence needed for the critique.
9. Repeat the experiment and critique until one hypothesis withstands scrutiny or
   the evidence shows that the cause remains unknown.
10. Check whether an existing property or test should have caught the behavior. If
    it should have, specify how it must be strengthened. If it should not have, state
    the missing property or test requirement.
11. Choose the smallest change by client impact, not by implementation size.
12. Predict consequences for the failure and adjacent behavior.
13. Write a detailed repair plan naming scope, properties, validation, evidence, and
    predicted consequences.
14. Present the repair plan to the user and stop until the user approves it.
15. Record the approval and produce an approved repair artifact.

## Outputs

An approved repair artifact, or a clearly marked unapproved diagnosis and proposal
when the user has not approved the repair.

## Evidence

Do not treat a hypothesis as fact. Record the reproduction, experiments, tests, traces,
and sources that support or weaken each hypothesis. Keep predictions separate from
observations.

Use the repository's existing property-testing approach when one exists. Otherwise,
express the property as an acceptance criterion and do not add a testing dependency
without a separate decision.

## Stop conditions

Stop without implementation when the failure cannot be reproduced, the evidence does
not distinguish the hypotheses, a required user decision is unresolved, or the user
has not approved the repair plan.

## Independence

This skill is complete on its own. It does not require another skill, invoke another
skill, or assume that another skill will consume its output.
