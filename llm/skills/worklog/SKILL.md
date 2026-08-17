---
name: worklog
description: "Write and maintain a worklog for a multi-step task — a working file with a detailed to-do list plus sections for open questions, decisions, and findings captured while understanding, sourcing, and executing. Use whenever a worklog will be written to plan and track work."
---

# worklog

How to write and keep your **worklog** for a multi-step task. Write it
at **`/tmp/worklog.txt`** — using `/tmp` keeps it ephemeral, so it is discarded
on its own and never lands in the repo. When you first create the file, **tell
the user the path (`/tmp/worklog.txt`)** so they can open it and see what you are
doing.

Because `/tmp/worklog.txt` is a fixed path, a worklog from an earlier session may
already be there. Before creating a new one, check whether `/tmp/worklog.txt`
exists and read it if so: if its **Goal** is the task you are now working on,
continue that worklog; if it is leftover from unrelated work, ask the user whether
to continue or discard it before overwriting — never silently discard it.

Within a session, the worklog is cumulative: on a follow-up request, preserve
everything already there and add to it — never overwrite the file or start a new
one. When the follow-up continues the same goal, extend the existing sections;
when it is a different piece of work, append a new titled block with its own
**Goal** and sections below the previous one, so the file grows into a
chronological record of the session.

It has a few clear sections; fill them in and keep them current as you work. Keep
it purposeful: use these sections, not a free-form dumping ground. For a worked
example, see `assets/worklog_example.txt` — a shape to follow, not content to copy.

Update it as you go, not at the end. Work in a tight loop: read one source or
finish one step, then immediately record in the worklog what you found and
understood, tick that item done, and add anything new that surfaced — only then
move to the next step. The worklog grows alongside the work and always reflects
the current state; you should never be reconstructing it after the fact.

## Goal

Your worklog should stand on its own. Someone with no prior context
should be able to read it and understand:

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

## Decisions

Every significant choice you make, recorded so it can be traced — not just
asserted. For each decision, write:

- **what** you decided;
- **why** — the reason, and the options you considered and rejected;
- **source** — what the decision rests on: the file and lines you read, the doc
  or URL, or "the user said X". A decision with no source is just an assertion.

## Notes / findings

What you learn while understanding, sourcing, and executing: key facts (with
their source), assumptions you are relying on, and dead ends worth not repeating.
