---
name: notes
description: "Write and maintain temporary notes for a multi-step task — a working file with a detailed to-do list plus sections for open questions and findings captured while understanding, sourcing, and executing. Use whenever temporary notes will be written to plan and track work."
---

# notes

How to write and keep your **temporary notes** for a multi-step task. Write them
at **`/tmp/notes.txt`** — using `/tmp` keeps them ephemeral, so they are discarded
on their own and never land in the repo. When you first create the file, **tell
the user the path (`/tmp/notes.txt`)** so they can open it and see what you are
doing.

It has a few clear sections; fill them in and keep them current as you work. Keep
it purposeful: use these sections, not a free-form dumping ground.

## Goal

Your temporary notes should stand on their own. Someone with no prior context
should be able to read them and understand:

- **what happened** — what was done, and where things ended up;
- **how the thinking evolved** — the line of reasoning, what was tried, and what
  changed along the way;
- **why** — the rationale behind each significant decision, including the options
  considered and why they were rejected.

Write for that reader: legible and self-contained, but concise. Capture the
decisions, their reasons, and the shape of how you got there — not a verbatim log
of every step. The test is whether a stranger could follow what happened and why,
not whether you wrote down everything.

## To-do

The plan, as a checklist. Be extremely detailed: break the task into sequential
sections, and break each section into concrete, verifiable sub-items derived from
your analysis of the actual task and codebase.

Use a checkbox for every item:

- `[ ]` for an incomplete item
- `[x]` for a completed item

An illustrative shape (adapt the sections and items to your real task — do not
copy items that do not apply):

```
# To-do
1. [ ] <First section: understand the task>
  - [ ] <Concrete sub-item>
  - [ ] <Concrete sub-item>
2. [ ] <Second section: gather inputs / data>
  - [ ] <Concrete sub-item>
    - [ ] <Nested sub-item, recurse as deep as the task requires>
3. [ ] <Next section: perform the work>
  - [ ] ...
4. [ ] <Final section: validate>
  - [ ] Run the relevant checks/tests and ensure they pass
```

Add, remove, and nest items based on your analysis of the specific task. The
list must cover every step needed to complete the task — nothing implicit.

Keep it living. The plan is not fixed at the start: as execution turns up new
work, new steps, or new findings, add them to the list as they surface, so the
to-do always reflects the task as you now understand it — not just your first
guess.

## Open questions

Anything unresolved — a decision you cannot make yet, a gap in the sources, a
thing to confirm with the user. Log each question the moment it comes up, and
record the answer (or remove it) once it is resolved.

## Notes / findings

What you learn while understanding, sourcing, and executing: key facts (with
their source where relevant), decisions made and why, assumptions you are
relying on, and dead ends worth not repeating.
