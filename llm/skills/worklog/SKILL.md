---
name: worklog
description: "Write and maintain an append-only worklog for any task — a fixed Goal and Plan at the top, then a live stream of tagged entries (thinking, findings, decisions, progress, questions) appended as you work, so progress can be followed live. Use whenever a worklog will be written to plan and track work."
---

# worklog

How to write and keep your **worklog** for any task. The `scripts/worklog.sh` tool
that ships with this skill owns the worklog — where it is kept, how it is named, the
header, and how each line is written — so you drive everything through it and never
build a worklog path by hand.

The tool lives in this skill's own directory, so it is self-contained — nothing is
installed on your `PATH`. Invoke it by its **full path**: this skill's directory is
shown to you when the skill loads (its base directory), and the tool is
`scripts/worklog.sh` under it. In the commands below `worklog.sh` is shorthand for
that absolute path — `<this skill's directory>/scripts/worklog.sh` — so always run
`sh worklog.sh …` with the real path filled in, from any working directory, rather
than as a bare relative path like `scripts/worklog.sh` (which resolves only from the
skill directory, not from wherever you happen to be).

Create one with a **goal**, a sentence on what **done** looks like, and the
numbered **plan steps**:

    sh worklog.sh new "<one-line goal>" "<what done looks like>" "<step 1>" "<step 2>" ...

It writes the header, keeps the file in an ephemeral, out-of-repo location, and
prints the file's path. **Tell the user that path** so they can follow along as you
work. You create a worklog once per piece of work; every later command finds it on
its own, so you never pass or remember the path. (When several agents run at once,
put `WORKLOG=<path>` in front of a command to aim it at one specific file.)

The worklog is **append-only**: only ever add lines at the end, and never edit or
rewrite a line already written. Add each log entry with the tool:

    sh worklog.sh <item> <tag> <text...>

It stamps the time, then rejects an entry that can never be right — an unknown tag,
a non-numeric item, or a `find` with no `src:` — before writing it, and after each
write prints what is still open (see **Before you finish**). Because the log is
append-only a bad line is permanent, so the tool refuses it rather than let it
land; when it refuses, nothing is written — fix the entry and run it again.
Appending is what lets the user watch your progress stream in live; it also keeps
the file a truthful history, since a record you can only add to cannot be quietly
rewritten after the fact.

The file has two parts. The **header** — a **Goal** and the numbered **plan
items**, written for you by `new`; each item is what the log's `#<item>` column
refers back to. The plan items carry no checkboxes, because ticking one would mean
editing a line already written; you record progress instead by appending to the log
below. Then the **log**: an append-only stream of short, tagged entries that grows
at the end of the file as you work. Each entry opens with the **wall-clock time it
happened**, `HH:MM:SS`, which the tool stamps as it appends — nothing to capture up
front or compute. A viewer only colorizes and aligns these for display, showing the
time as-is; the file keeps the real times, which read fine raw too. There is no
start file to manage: the start of a segment is simply its first entry.

Before starting, check whether a worklog for this work already exists — ask the
tool for the current one and read it if there is one:

    sh worklog.sh path   # prints the current worklog, nothing if none yet

If its **Goal** is the task you are now working on, keep working in it — append and
continue. If it is leftover from unrelated work, start your own with `new`: that
mints a separate file and every later command follows the new one, so you leave the
old worklog untouched rather than writing over it.

A worklog you reopen records what a past run *claimed*, not what is still true.
Before building on a step it marks `done`, confirm the result still holds in the
code — a revert or an outside change can leave a `done` step undone while the log
still reads finished. When the log looks already complete but you have been asked
to run the task again, verify the current state and ask the user whether it still
stands or should be redone; never read a full log and silently conclude there is
nothing left to do.

On a follow-up that **continues the same goal**, keep working in the same worklog.
Mark the new segment first, so each part of the log stays self-describing the way
the header's `goal:` does:

    sh worklog.sh followup "<one line on what this request asks>"

then carry on under the existing plan — its new steps join as `plan` items (closed
by `done`), so the numbering continues instead of restarting at `#1`. When the
follow-up is a **different piece of work**, start a fresh worklog with `new`; it
becomes its own file, and a running `watch-worklog` follows it automatically.

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
HH:MM:SS #1 think <what you are weighing before you commit>
HH:MM:SS #1 find <a fact you learned — src: file:line / URL / "user said X">
HH:MM:SS #1 done <what item 1 established or produced — closes item 1>
HH:MM:SS #2 decide <what — why; options rejected — src: where it rests>
HH:MM:SS #2 question <a question you need answered>
HH:MM:SS #2 answer <the user's reply, or the assumption you took>
HH:MM:SS #2 done <what plan item 2 produced — closes item 2>
HH:MM:SS #4 plan <a step you discovered mid-flight; this line adds it as plan item 4>
HH:MM:SS #4 note <an assumption you rely on, or a dead end not to repeat>
HH:MM:SS #4 done <what item 4 produced — closes item 4>
HH:MM:SS #3 done <final item validated — closes item 3>

── follow-up: <one line on what this request asks> ──   (steps via plan)
HH:MM:SS #5 plan <the follow-up's new step joins the plan as item 5>
HH:MM:SS #5 done <closes the follow-up's added item 5>
```

## Log entries

You pass the tool three things — `<item> <tag> <text>` — and it builds the line:
`HH:MM:SS` (the wall-clock time it happened), then `#<item>` (the plan step it
belongs to), then the tag, then the text, separated by single spaces. Two rules
hold every entry together:

- **One entry per line.** Never put two entries on one line, and never split one
  entry across lines. A `question` and its later `answer` are separate lines,
  written when each actually happens.
- **Every entry names a plan item.** No work happens that the plan does not
  contain: if what you are about to do fits no existing item, append a `plan`
  entry to add it first, then work under that item. `#<item>` is how the log proves
  every action was planned — and it is the item you are *currently* on, so stay on
  it until you close it with `done` before advancing to the next, rather
  than letting the number run ahead of the work. The tool enforces this: a `done`
  that closes an item while a lower-numbered one is still open is refused — close
  them in order, or, when an out-of-order close is genuinely intended, repeat it
  with a leading `--force` (`sh worklog.sh --force <item> done <text>`).

Use this fixed set of tags, so the stream stays scannable:

- **`think`** — a deliberation: the options you are weighing before you commit.
  Append one whenever you have to reason something out.
- **`find`** — a **fact you learned**, with its **source**: file and lines, `"user
  said X"`, or a URL. Record what you *learned*, not what you *did*: implementing
  code, writing a test, or running a command is finished work — close its item with
  `done` instead. When the source is a page or ticket, record its **URL**, not an
  internal ID, so it is one click away. Every `find` carries a source; one without
  is just an assertion.
- **`decide`** — a choice: **what** you decided, **why** (including the options you
  rejected), and the **source** it rests on (same URL rule as `find`).
- **`done`** — closes a plan item and says what it established or produced — a
  header item or one you added with `plan`, closed the same way. It tracks progress
  in place of ticking a checkbox; the `#<item>` says which step. Every item earns a
  `done` before the task is complete — including a read-only one like *inspect the
  repo*, *read the source*, or *research X*: its `done` records what you learned,
  since such a step is finished when you have the understanding, not only when it
  yields a file. If one turns out unnecessary, still close it with a `done` that
  says why.
- **`plan`** — adds a step you discovered mid-flight. You cannot edit the header, so
  add the step here; give it the **next number after the highest item so far**
  (header items are `1, 2, 3, …`, so the first added step is `4`), and later entries
  use that `#<item>`. Close it with `done`, exactly like a header item.
- **`question`** — a question you need answered. When it is blocking, ask the user
  in the session; when it is non-blocking, proceed under a stated assumption.
- **`answer`** — the answer to an earlier `question`: the user's reply, or the
  assumption you took. Append an `answer` for every `question`, so none is resolved
  silently.
- **`note`** — an assumption you are relying on, or a dead end worth not repeating.

## Before you finish

Every append already shows a status footer — `Open items:` (plan items with no
`done`) and `Open questions:` (a `question` with no matching `answer`) — so you can
watch what is still open as you work; mid-flight those lines are just a running
to-do list, not a problem.

When you think you are done, re-read the whole worklog top to bottom, then run the
same tool as the completion gate:

    sh worklog.sh check

`check` re-scans the whole file — the header and anything carried over from a
reopened log too, not just the entries you appended — and is strict: it exits
non-zero while **any** item is open, any question unanswered, or any `find` missing
its `src:`. Drive it to `Open items: none`, `Open questions: none`, and the final
`ok` line; fix whatever it lists, then finish.

For a full worked example, see `references/worklog_example.txt` in this skill — a
shape to follow, not content to copy.
