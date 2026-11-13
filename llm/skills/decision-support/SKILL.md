---
name: decision-support
description: "Frame and compare finite decision options without deciding or acting for the user."
---

# Decision support

Decision support turns a choice into a clear, bounded model. It makes options,
trade-offs, uncertainty, and the basis for comparison visible. It does not
authorize actions, make commitments, or choose on behalf of the user.

## When to use structured decision support

Use structured decision support when there are multiple plausible options and the
choice depends on explicit conditions, competing objectives, incomplete evidence,
or meaningful risk. Use it to clarify a decision, test whether options satisfy
requirements, explore a finite space, or compare options consistently.

## When not to use structured decision support

Do not use it for a simple factual answer, an open-ended brainstorm with no
bounded choice, or a decision whose authority and criteria are not yet clear.
Do not present a model as a substitute for expert advice, policy, safety review,
or the user's judgment.

## Model

Describe:

- **Variables:** the facts or choices that can vary.
- **Domains:** the finite set of allowed values or alternatives for each variable.
- **Hard constraints:** conditions every acceptable option must satisfy. A
  violation rules an option out; it is not merely a lower score.
- **Objectives and preferences:** what to improve, protect, or prioritize when
  more than one option remains. State direction and relative importance when
  known.
- **Assumptions:** claims supplied because they are necessary but not yet
  established. Mark who supplied them and what would change if they are wrong.
- **Evidence:** observations, sources, measurements, or user-provided facts
  that support the model. Separate facts from inferences and opinions.
- **Limits:** missing evidence, excluded alternatives, dependencies, time
  bounds, and reasons the model may not represent reality fully.

Always keep at least one meaningful option visible when one exists, including a
status quo or defer option where relevant. Show the trade-offs rather than
hiding them in a single score. A recommendation, if requested, must remain
conditional on the stated assumptions, constraints, and preferences.

## Workflow

Follow this sequence:

1. **Model** the variables, finite domains, hard constraints, objectives,
   assumptions, evidence, limits, and available options.
2. **Validate** that the model is coherent, that domains are finite enough to
   inspect, and that constraints and evidence are stated clearly.
3. **Explore** the feasible options and identify which constraints or
   assumptions determine the result.
4. **Compare** the surviving options using the stated objectives and preferences;
   report benefits, costs, risks, uncertainty, and trade-offs.
5. **Report** the options, findings, evidence, limits, and certainty in plain
   language. Keep unresolved questions visible.
6. **Escalate** when authority, safety, missing evidence, or material uncertainty
   requires a person, domain expert, policy owner, or explicit approval.

## Certainty

Label conclusions as:

- **Exact:** follows from a complete model and verified inputs within its stated
  boundary.
- **Bounded:** valid only within named assumptions, limits, or ranges.
- **Heuristic:** useful directional guidance based on patterns or preferences,
  not a proof.
- **Unresolved:** the available evidence cannot distinguish the options or the
  model is incomplete.

## Fallback and approval

If the model cannot be validated or the decision space cannot be usefully
explored, fall back to the strongest available evidence, delegate the missing
question to an appropriate expert, ask for clarification, or request approval
for the next bounded step. Never turn a missing answer into a silent assumption.

Decision support can inform a choice, but it does not grant permission, create
an obligation, or authorize execution. The user or the responsible authority
retains the decision and must approve any consequential action.
