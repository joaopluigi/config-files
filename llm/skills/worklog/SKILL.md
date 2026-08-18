---
name: worklog
description: "Write and maintain an append-only worklog for any task — a fixed Goal and Plan at the top, then a live stream of tagged entries (thinking, findings, decisions, progress, questions) appended as you work, so `tail -f /tmp/worklog.txt` shows progress in real time. Use whenever a worklog will be written to plan and track work."
---

# worklog

How to write and keep your **worklog** for any task. Write it at
**`/tmp/worklog.txt`** — using `/tmp` keeps it ephemeral, so it is discarded on
its own and never lands in the repo. When you first create the file, **tell the
user the path (`/tmp/worklog.txt`)** so they can follow along as you work.

The worklog is **append-only**: only ever add lines at the end, and never edit or
rewrite a line you have already written. Append with a shell append — `>>
/tmp/worklog.txt`, or a `cat >> /tmp/worklog.txt <<'EOF' … EOF` heredoc — rather
than any tool that rewrites the whole file. Appending is what lets the user run
`tail -f /tmp/worklog.txt` and watch your progress stream in live; it also keeps
the file a truthful history, since a record you can only add to cannot be quietly
rewritten after the fact. This governs a worklog once it exists; the first write
that creates it — or a fresh start after the user discards an unrelated one — is
the one time you write into an empty file.

The file has two parts. Write the **header once**, when you create the worklog: a
**Goal** and the **plan items** — the numbered roadmap of sequential steps, each an
item the log's `#<item>` column refers back to. The plan items carry no checkboxes,
because ticking one would mean editing a line you already wrote; you record progress
instead by appending to the log below. Then comes the
**log**: an append-only stream of short, tagged entries that grows at the end of
the file as you work. Prefix each entry with the **elapsed time since the worklog
started** — the first entry is `00:00`, and later ones count up (`03:12`,
`14:05`) — so the stream reads as a timeline of the task, not the wall clock.
Capture the start moment once when you write a header (for example
`date +%s > /tmp/worklog.start`) and compute `now − start` on each append; a new
header block starts its own clock at `00:00`.

Because `/tmp/worklog.txt` is a fixed path, a worklog from an earlier session may
already be there. Before creating a new one, check whether the file exists and
read it if so: if its **Goal** is the task you are now working on, append to that
same log and continue; if it is leftover from unrelated work, ask the user whether
to continue or discard it before touching it — never silently discard it. When the
user says discard, **overwrite the file from empty** and let the new worklog be its
only content: a discarded worklog is gone, not pushed below the new one.

A worklog you reopen records what a past run *claimed*, not what is still true.
Before building on a step it marks `done`, confirm the result still holds in the
code — a revert or an outside change can leave a `done` step undone while the log
still reads finished. When the log looks already complete but you have been asked
to run the task again, verify the current state and ask the user whether it still
stands or should be redone; never read a full log and silently conclude there is
nothing left to do.

Within a session the worklog is cumulative. On a follow-up request, keep
everything already there and add below it — never overwrite the file or start a
new one. When the follow-up continues the same goal, keep appending to the same
log; when it is a different piece of work, append a fresh header (its own **Goal**
and **plan items**) and a new log beneath the previous block, so the file grows into a
chronological record of the whole session.

Append as you go, never in a batch at the end. Work in a tight loop: the moment
you weigh an option, learn a fact, make a decision, or finish a step, append that
entry before moving on. In particular, append a `think` entry every time you have
to reason something out — the log should show your thinking as it happens, not
only the conclusions.

Write so someone with no prior context could read the file top to bottom and
follow what happened, how the thinking evolved, and why — legible and
self-contained, but concise. Capture the reasoning and the decisions, not a
verbatim log of every keystroke.

## Layout

```
# worklog — <one-line goal>

goal: <what "done" looks like, in a sentence or two>

plan items
  1. <first step>
  2. <second step>
  3. <final step: validate>

── log ──
MM:SS #1 think <what you are weighing before you commit>
MM:SS #1 find <a fact you learned — src: file:line / URL / "user said X">
MM:SS #1 decide <what — why; options rejected — src: where it rests>
MM:SS #1 done <what this plan item produced, and the result>
MM:SS #3a plan+ <a step you discovered mid-flight; this line adds plan item 3a>
MM:SS #2 question <a question you need answered>
MM:SS #2 answer <the user's reply, or the assumption you took>
MM:SS #2 note <an assumption you rely on, or a dead end not to repeat>
```

## Log entries

Each log entry is one line: `MM:SS`, then `#<item>` (the plan step it belongs to),
then one tag, then the text — fields separated by single spaces. Do not pad the
columns to line up by hand. Two rules hold every entry together:

- **One entry per line.** Never put two entries on one line, and never split one
  entry across lines. A `question` and its later `answer` are separate lines,
  written when each actually happens.
- **Every entry names a plan item.** No work happens that the plan does not
  contain: if what you are about to do fits no existing item, append a `plan+`
  entry to add it first, then work under that item. `#<item>` is how the log proves
  every action was planned.

Use this fixed set of tags, so the stream stays scannable:

- **`think`** — a deliberation: the options you are weighing before you commit.
  Append one whenever you have to reason something out.
- **`find`** — a fact you learned, with its **source**: file and lines, `"user
  said X"`, or a URL. When the source has a URL — a Confluence or Jira page, a doc —
  record the URL itself, not an internal page or ticket ID, so the source is one
  click away. A finding with no source is just an assertion.
- **`decide`** — a choice: **what** you decided, **why** (including the options you
  rejected), and the **source** it rests on (same URL rule as `find`).
- **`done`** — closes the entry's plan item: say what it produced and the result.
  `plan+` opens an item and `done` closes it, so every plan item earns a `done`
  before the task is complete; if one turns out unnecessary, still close it with a
  `done` that says why. This tracks progress in place of ticking a checkbox — the
  `#<item>` says which step.
- **`plan+`** — a step you discovered mid-flight. You cannot edit the plan, so
  append the new step here; the entry's `#<item>` is the number you are adding (for
  example `#3a`), and later entries reference it.
- **`question`** — a question you need answered. When it is blocking, ask the user
  in the session; when it is non-blocking, proceed under a stated assumption.
- **`answer`** — the answer to an earlier `question`: the user's reply, or the
  assumption you took. Append an `answer` for every `question`, so none is resolved
  silently.
- **`note`** — an assumption you are relying on, or a dead end worth not repeating.

For a full worked example, see `assets/worklog_example.txt` — a shape to follow,
not content to copy.
