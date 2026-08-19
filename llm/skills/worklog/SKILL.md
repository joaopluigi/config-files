---
name: worklog
description: "Write and maintain an append-only worklog for any task — a fixed Goal and Plan at the top, then a live stream of tagged entries (thinking, findings, decisions, progress, questions) appended as you work, so progress can be followed live. Use whenever a worklog will be written to plan and track work."
---

# worklog

How to write and keep your **worklog** for any task. Give each worklog its own
file at **`/tmp/worklog-<id>.txt`**, where `<id>` is any short unique token — so
two agents working in parallel never collide on one path. Use a session id your
host exposes if there is one, otherwise generate a few random characters; either
way, **generate it once and reuse that exact path for the rest of the session** —
do not re-roll it per append, or you will scatter the log across many files:

    id=$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')   # or a host session id
    wl="/tmp/worklog-$id.txt"                                  # e.g. /tmp/worklog-3f9a1c02.txt

Using `/tmp` keeps it ephemeral, so it is discarded on its own and never lands in
the repo. When you first create the file, **tell the user its path** so they can
follow along as you work.

The worklog is **append-only**: only ever add lines at the end, and never edit or
rewrite a line you have already written. Append with a shell append — `>> "$wl"`,
or a `cat >> "$wl" <<'EOF' … EOF` heredoc — rather than any tool that rewrites the
whole file. Appending is what lets the user watch your progress stream in live; it
also keeps the file a truthful history, since a record you can only add to cannot be
quietly rewritten after the fact. This governs a worklog once
it exists; the first write that creates it — or a fresh start after the user
discards an unrelated one — is the one time you write into an empty file.

The file has two parts. Write the **header once**, when you create the worklog: a
**Goal** and the **plan items** — the numbered roadmap of sequential steps, each an
item the log's `#<item>` column refers back to. The plan items carry no checkboxes,
because ticking one would mean editing a line you already wrote; you record progress
instead by appending to the log below. Then comes the
**log**: an append-only stream of short, tagged entries that grows at the end of
the file as you work. Prefix each entry with the **wall-clock time it happened**,
`HH:MM:SS` — just `date +%H:%M:%S` at the moment you append, with nothing to
capture up front and nothing to compute. A viewer only colorizes and aligns these
for display, showing the time as-is; the file keeps the real times, which read fine
raw too. That is why there is no start file to manage: the
start of a segment is simply its first entry.

Within a session you reuse the same worklog file across tasks, so it may already
hold a worklog when a new task begins. Before creating one, check whether your file
exists and read it if so: if its **Goal** is the task you are now working on, append
to that same log and continue; if it is leftover from unrelated work, ask the user
whether to continue or discard it before touching it — never silently discard it.
When the user says discard, **overwrite the file from empty** and let the new
worklog be its only content: a discarded worklog is gone, not pushed below the new
one.

A worklog you reopen records what a past run *claimed*, not what is still true.
Before building on a step it marks `done`, confirm the result still holds in the
code — a revert or an outside change can leave a `done` step undone while the log
still reads finished. When the log looks already complete but you have been asked
to run the task again, verify the current state and ask the user whether it still
stands or should be redone; never read a full log and silently conclude there is
nothing left to do.

Within a session the worklog is cumulative. On a follow-up request, keep
everything already there and add below it — never overwrite the file or start a
new one. When the follow-up **continues the same goal**, append a
`── follow-up: <one line on what this request asks> ──` divider — the label keeps
each segment self-describing, the way the header's `goal:` does, and keep working
under the existing plan items; its new steps join the plan as `plan` items (closed
by `done`), so the numbering continues instead of restarting at `#1`. When the follow-up is a
**different piece of work**, append a fresh header (its own **Goal** and **plan
items**) and a new `── log ──` beneath the previous block. Either way the file grows
into a chronological record of the whole session.

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

Each log entry is one line: `HH:MM:SS` (the wall-clock time it happened), then
`#<item>` (the plan step it belongs to), then one tag, then the text — fields
separated by single spaces. Do not pad the
columns to line up by hand. Two rules hold every entry together:

- **One entry per line.** Never put two entries on one line, and never split one
  entry across lines. A `question` and its later `answer` are separate lines,
  written when each actually happens.
- **Every entry names a plan item.** No work happens that the plan does not
  contain: if what you are about to do fits no existing item, append a `plan`
  entry to add it first, then work under that item. `#<item>` is how the log proves
  every action was planned — and it is the item you are *currently* on, so stay on
  it until you close it with `done` before advancing to the next, rather
  than letting the number run ahead of the work.

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

For a full worked example, see `assets/worklog_example.txt` — a shape to follow,
not content to copy.
