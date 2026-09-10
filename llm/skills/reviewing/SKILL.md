---
name: reviewing
description: "Review any completed or proposed work -- code, pull requests, documents, designs, plans -- by grounding findings in real evidence and always splitting the review across four independent subagents (correctness, maintainability, prior-art/external research, and independent critique), auditing the draft with a fifth subagent for compliance with this skill, then reporting concise, evidence-backed findings. Use whenever asked to review, critique, or assess a piece of work, in any medium."
---

# Reviewing

This skill defines the *behavior* of reviewing: what to look for, how to judge
it, and how to report it. It is medium-agnostic. Pair it with a platform skill
that knows how to talk to a specific system -- for example `pr-review` for
GitHub pull request mechanics -- or use it directly on local files, documents,
a plan, or text pasted into chat.

## When to use

Use whenever asked to review, critique, or assess a piece of work. The work
can be a code change, a pull request, a document, a design, a plan, a
proposal, or anything else that can be checked against a real source.

## Evidence boundary

Review only what can be grounded in the artifact itself and real supporting
sources:

1. the content of the thing under review;
2. surrounding context needed to understand it (nearby code, related
   sections, prior versions, prior decisions);
3. tests, validation runs, or other evidence the work claims to be backed by;
4. project- or team-local guidance the user provides or that is present in the
   workspace, such as `AGENTS.md`, `CONTRIBUTING.md`, a style guide, or a
   checklist;
5. documents or artifacts explicitly linked by the work under review;
6. official documentation for an external dependency, API, or fact the work
   relies on but does not itself establish.

Do not report a suspected issue from memory alone. If a claim depends on an
external fact, verify it against a real source or say the point is
unverified.

For every candidate finding, keep an internal record of: the location in the
artifact, the behavior or claim observed, the source supporting the finding,
the concrete impact, and the requested change.

## Review lenses

Every review runs the same four independent lenses:

- **Correctness** -- does it do what it claims, are edge cases and failure
  modes handled;
- **Maintainability / readability** -- will this be easy and safe to change
  later;
- **Prior art / external research** -- has this problem been solved
  elsewhere, is there a known pitfall, standard, or better-established
  approach;
- **Independent critique** -- would an outsider find the stated evidence,
  scope, and reasoning convincing, or does it rest on unexamined assumptions.

Run all four on every review, regardless of how small or narrow the artifact
looks. A lens that turns up nothing real is a legitimate result -- report "no
prior-art risk found" or "no correctness concern found" for that lens -- but
deciding in advance that a lens does not apply and not spawning it is not a
legitimate result. Treating a lens as conditional in practice becomes
indistinguishable from never running it, so it is not a judgment call left to
the reviewer.

## Split lenses across subagents

Do not run the four lenses yourself in a single pass. Spawn one subagent per
lens to check it independently, then reconcile the results yourself. Running
every lens in one pass lets one lens's framing anchor the others and gives up
the independence that makes separate lenses useful in the first place.

- **correctness** -- spawn a `tester` or `investigator` subagent to read the
  artifact and any tests and verify the behavior claims;
- **maintainability** -- spawn a `maintainer` subagent, using the code lens
  below when the artifact is code;
- **external research** -- spawn a `researcher` subagent to check whether the
  problem or approach has known prior art, pitfalls, or established
  alternatives;
- **independent critique** -- spawn a `reviewer` subagent to challenge
  completed work, or a `critic` subagent to challenge a not-yet-implemented
  plan.

Spawn all four subagents for every review. Give each one the artifact, the
relevant evidence sources, and exactly one lens; none of them should edit
anything. Collect their findings yourself and reconcile overlaps before
reporting -- do not just concatenate their raw output.

## Finding quality rules

- Keep findings personal and unlabelled by severity markers (no `[P1]`,
  `[P2]`, etc.) unless the user asks for that.
- One concern per finding. Use a single summary-level finding only when the
  same pattern repeats many times across the artifact.
- Be concise: state the concern and the concrete cost or benefit in one or two
  sentences. Put evidence in the citation (location, quote, source), not in a
  long narrative.
- Ground each finding in a specific location or section of the artifact, not
  a vague style preference. Name the concrete consequence.
- Every finding must include a small example illustrating the concern or the
  requested change, regardless of medium: a before/after sketch for a code or
  test change (see `references/review-patterns.md` and
  `assets/review-examples.md`), a quoted excerpt with a suggested rewording
  for text, or a concrete instance for a design or plan. A finding that only
  names the concern in prose is incomplete if a short example would make it
  unambiguous.
- Before reporting a candidate finding, check it against: is it tied to a
  specific part of the artifact? Is the behavior or claim observable from the
  source? Is the consequence concrete? Is it already covered by another
  finding? Does it have one clear, actionable request? Reject the finding if
  the answer to any of these is no.

## Verification

Before reporting, re-check every candidate finding: does it still match the
current version of the artifact, does any included example match the
artifact's real names and structure, and have duplicates been merged into one
finding? Run the smallest real check available -- a test, a script, a build,
a fact check against documentation -- rather than asserting that a claim would
hold.

## Audit the review against this skill

Verification checks findings against the artifact. This step checks the
draft report against this skill itself, and needs a second, independent
reader for the same reason the four lenses do: the agent that wrote a finding
is the least likely to notice it silently overrode or forgot one of this
skill's own rules.

After reconciling the four lenses into a draft report -- and, for a code
artifact, after applying the code-specific lens below -- spawn one more
`reviewer` subagent to audit the draft, not the artifact. Give it:

- this skill's full text;
- `references/review-patterns.md` and `assets/review-examples.md` when the
  artifact is code;
- the exact findings as drafted, including any examples, exactly as they
  would be reported or posted.

Ask it to check every finding against "Finding quality rules", "Verification",
and, for code, the final candidate check in `review-patterns.md` -- in
particular, whether every finding carries an example illustrating the concern
or the requested change. Ask it to report only violations, not a re-review of
the artifact's substance, and not to edit anything.

Fix or drop every flagged finding before delivering the report or writing
anything. Do not skip this step because the draft looks compliant already;
that judgment is exactly what this step exists to check independently.

## Handling an empty finding set

If the review turns up no concrete, evidence-grounded finding, say so and
stop. Do not invent a finding to justify having reviewed something, and do
not take any write action (approve, submit, merge, edit) that an empty result
does not support.

## Code-specific lens: readability and maintainability

When the artifact under review is code, `references/review-patterns.md` and
`assets/review-examples.md` give a concrete, language-neutral set of patterns
for this lens -- hidden operations, oversized orchestration functions,
boolean-blind call sites, nested bindings, test structure, and more. Read both
before writing code-readability findings, and translate the pseudocode into
the language and conventions of the code under review.

## Output

Report:

1. a short overall assessment;
2. findings grouped in whatever way fits the artifact (by lens, by severity,
   by section);
3. each finding's location and supporting evidence;
4. any unverified concern or missing source;
5. checks or commands actually run;
6. any violation the audit step caught and how it was fixed or why the
   finding was dropped.
