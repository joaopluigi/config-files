---
name: reviewing
description: "Review work with independent evidence-grounded lenses."
---

# Reviewing

Review code, documents, plans, designs, or pull requests against the artifact, surrounding context, tests, local guidance, analogous repository patterns, and official external sources.

Reference index: [`references/REFERENCE.md`](references/REFERENCE.md). Read it when the review needs the detailed pattern references.

## Procedure

1. Define the artifact, properties, evidence boundary, and output format.
2. Run six independent lenses through separate read-only workers: correctness; maintainability; prior art or external research; independent critique; current repository patterns; organizational or group patterns. Add a seventh pass for example completeness.
3. Give each worker one lens, the relevant sources, and no editing authority. Reconcile overlaps yourself.
4. For every plausible finding record location, observed claim, source, impact, confidence, uncertainty, and requested next step. Report legitimate no-finding results too.
5. Keep one concern per finding. Use a short example or before/after sketch for every finding.
6. Report findings concisely, without severity labels unless requested. Separate confirmed issues, inferences, and unverified concerns.

## Evidence

Do not report memory-based concerns. Use external sources only when relevant and cite them. Treat ecosystem analogies as analogies, not organizational evidence. Check local `AGENTS.md`, `CONTRIBUTING.md`, or review guidance when present.

## Stop conditions

Stop when all lenses and the completeness pass have returned, findings are reconciled, and the requested report is complete. If a source is unavailable, record the limitation instead of guessing.
