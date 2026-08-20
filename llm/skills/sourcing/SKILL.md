---
name: sourcing
description: "Use whenever you need information you do not already have in front of you — to answer a question, read a pull request's review comments, look up how an API or tool works, check a convention, gather requirements from a doc or a discussion, or find prior art — and want it from a real source instead of memory. Works for reading and answering, not only before acting. A precedence ladder with a concrete tool for each rung: the task's own files and this repo's dependencies first, then your org's own knowledge (its GitHub repos and pull-request discussions, plus internal docs in Confluence or Google Docs, discussions in Slack, and meeting notes and transcripts reached through the calendar, when those tools are connected), then the official docs, and only then the whole of public GitHub. Ships a gh_find.sh helper that turns GitHub code/repo/PR search into ready-to-cite URLs and reads a PR's discussion with bots filtered out."
compatibility: The gh_find.sh helper needs the GitHub CLI (`gh`) authenticated (`gh auth status`) and `jq`. The Confluence, Slack, and Google Workspace (Docs, Drive, Calendar) avenues need their MCP tools connected in the session — skip them if not. The rest use ripgrep/git and the web tools.
---

# sourcing

How to **go get grounded** on a specific fact — an API's behavior, a project
convention, the right way to do something — instead of answering from memory. Your
character already says *trust the source, not recall*; this skill is the **how**: a
fixed order of places to look and the exact tool for each.

Work the ladder **top to bottom**, and keep going **until the question is fully
answered and you understand the range of possibilities** — not merely until the first
hit. Each rung is closer to your actual context, or more authoritative for it, than
the one below, so when two rungs disagree you trust the higher one; but a partial or
single answer is not the whole picture. If **any doubt remains**, or you have seen
only one way to do the thing, drop to the next rung to confirm it and to learn the
alternatives. Stop when the doubt is gone and you could explain the options, not the
moment one source says something.

1. **Local — the code you already have.** The task's own files, the rest of this
   repo, and the real source of its dependencies. This is ground truth for *this*
   project, so it always comes first.
2. **Your org's own knowledge — how *we* do it.** Prior art and shared conventions
   inside your own organization: code in a sibling repo, a written decision or
   runbook in the internal wiki (Confluence), or the discussion where something was
   decided (Slack). More trustworthy than a stranger's, because it reflects the
   conventions you are expected to follow. Use whichever of these your session has
   tools for.
3. **Official docs — the authoritative word.** The project's own documentation, the
   API reference, the RFC or standard. The primary source for anything external.
4. **All of public GitHub — the wide net.** Prior art anywhere: who else uses this
   API, who built something similar. Last because it is the least filtered — a hit
   is a lead to verify, not an authority.

Whatever answers, **record it with a citation** (see *Record what you find*), so the
claim traces back to a re-openable source and never decays into recall.

And **say where you stopped — do not silently decide a rung was enough.** Even when
you judge that the source you found answers the question, tell the user which rung you
grounded it in and offer to climb further, as a question: *"this is how the local
code does it — want me to confirm it against your org's convention or the official
docs, or is local enough here?"* Then let them point you to a better source before you
build on it. Stopping at rung 1 is often right, but that is the user's call to
confirm, not yours to assume.

## The gh_find helper

Rungs 2 and 4 both search GitHub. This skill ships a helper for that,
`scripts/gh_find.sh`, which runs `gh` and prints each hit as a ready-to-cite
line (repo, path, and the URL you record as `src:`). It is **self-contained** —
nothing on your `PATH` — so invoke it by its **full path**: this
skill's directory is shown when the skill loads, and the tool is `scripts/gh_find.sh`
under it. Below, `gh_find.sh` is shorthand for that absolute path; always run
`sh gh_find.sh …` with the real path filled in, from any working directory.

    sh gh_find.sh code  <query...> [gh flags]    # who does this / who uses this API
    sh gh_find.sh repos <query...> [gh flags]    # a whole repo doing something similar
    sh gh_find.sh prs   <query...> [gh flags]    # pull requests that discuss something
    sh gh_find.sh pr    <owner/repo> <number>    # read one PR's human discussion

Narrow the searches with any `gh search` flag — `--language`, `--extension`,
`--filename`, `--repo owner/name`, `--limit`, and for `prs` also `--author`,
`--commenter`, `--state`. The one that turns rung 4 into rung 2 is
**`--owner <org>`**: it restricts the search to your organization.

`pr` reads a single pull request's **human discussion** — its description,
conversation, inline review comments, and review summaries — merged in time order,
each with its author and a citeable permalink. **Bot comments are dropped by
default** (dependabot, codecov, CI — anything whose account is a Bot or ends in
`[bot]`), because they are noise for sourcing; pass `--include-bots` on the rare
occasion you want what a bot reported. A human service account with no `[bot]`
marker cannot be told from a person and will show — spot it by name.

## The avenues, rung by rung

### 1. Local — the code you already have

Start in the files in front of you, then widen to the repo, then to the real source
of its dependencies (read the installed source — never guess a dependency's API from
memory):

    rg -n 'defn build-request' src/            # find a definition or usage in this repo
    git log -S'build_request' --oneline        # find when/why a symbol appeared
    git grep -n 'FEATURE_FLAG'                  # every reference, tracked files only

    # a dependency's real source, by ecosystem — read it, don't recall it:
    rg -n 'export function parse' node_modules/<pkg>/       # node
    find ~/.m2/repository -type d -iname '*<artifact>*'     # jvm / maven
    ls ~/go/pkg/mod/<module>@*/                             # go
    ls /opt/homebrew/lib/python*/site-packages/<pkg>/       # python
    find ~/.cargo/registry/src -maxdepth 2 -iname '*<crate>*'   # rust

Cite these as `file:line` (repo files) so the exact line is one click away.

Local code tells you **how this project already does it** — copy that to stay
consistent; that is the point of starting here. But it does **not** tell you whether
that way is correct, current, or right for what you are now adding. So do not stop at
rung 1 by default: if the task is new behavior, or you have any doubt the local
pattern actually fits, climb to confirm it against your org's convention (rung 2) or
the authoritative docs (rung 3) before you rely on it. "It matches the existing code"
answers *how we do it*, not *whether it is right*.

### 2. Your org's own knowledge — how *we* do it

Several internal avenues, in descending order of how settled the source is — code
that runs, then a written doc, then a conversation or spoken record. Reach for
whichever your session has tools for, and skip any whose tools are not connected.

**Org code** — the GitHub helper, scoped to your organization with `--owner`:

    sh gh_find.sh code 'idempotency key' --owner <your-org> --language clojure
    sh gh_find.sh repos 'retry middleware' --owner <your-org>

**Pull request discussion** — the review thread is where a code decision was argued
and settled, so it often explains *why* the code is the way it is. Find the PR, then
read its discussion (bots dropped by default):

    sh gh_find.sh prs 'retry backoff' --owner <your-org> --state merged   → find the PR
    sh gh_find.sh pr <your-org>/<repo> <number>                           → read it; cite the comment permalink

**Internal docs (Confluence)** — when a Confluence/Atlassian tool is connected,
search the wiki for the written decision or runbook, then read the page:

    searchConfluenceUsingCql  (or the `search` tool)   → find the page
    getConfluencePage                                  → read it; cite the page URL

**Internal docs (Google Docs)** — when the Google Workspace tools are connected,
search Drive for the doc, then read its text:

    drive_search   → find the doc
    docs_getText   → read it; cite the doc URL

**Discussion (Slack)** — when a Slack tool is connected, search for where something
was decided or asked, then read the whole thread:

    conversations_search_messages   → find the message
    conversations_replies           → read the thread; cite the message permalink

**Meeting notes & transcripts (Calendar → Docs)** — when the Google Workspace tools
are connected, find the meeting on the calendar, open the event to reach its attached
notes or recording transcript, then read that doc:

    calendar_listEvents (or calendar_getEvent)   → find the meeting and its attachments
    docs_getText (or drive_downloadFile)         → read the notes/transcript; cite its URL

Prefer a match here over one from the wider public search — it already follows the
conventions your change is expected to match. Trust them in the order above: Slack
messages and meeting transcripts are the softest — a chat line, or something someone
said aloud in a call, is a lead and a pointer to a person, so confirm what it says
against code or a doc before you rely on it.

### 3. Official docs — the authoritative word

For anything external — an API, a language feature, a standard — read the primary
documentation, not a blog or recall. Find the official URL, then read the relevant
section:

    WebSearch: "<thing> official documentation"   # locate the primary source
    WebFetch:  <that URL>                          # read the exact section

Go to the project's own docs, the API reference, or the RFC/standard; use a search
engine or Wikipedia only to *find* that primary source, never as the source itself.
Cite the URL and the section.

### 4. All of public GitHub — the wide net

When nothing closer answers, search all public code for real usage or prior art —
and the pull requests where others hit and discussed the same problem:

    sh gh_find.sh code 'core.async pipeline' --language clojure --limit 5
    sh gh_find.sh repos 'mcp server' --language go
    sh gh_find.sh prs 'flaky test retry' --language go --state merged
    sh gh_find.sh pr <owner>/<repo> <number>   # read that PR's discussion

A search hit is a **lead, not yet a source**: open it, read enough to confirm it
truly does what you think, and only then cite it. The URL a code hit prints is
pinned to a commit SHA, so it keeps pointing at the exact lines you read.

## Record what you find

An answer you do not write down decays back into memory. Record each thing you learn
as you go, and pin every claim to its **source** — a URL (not an internal ticket ID)
or `file:line` — so anyone, you included, can reopen exactly what you read and check
it still holds. A claim without a source is just an assertion. If no rung answers,
that is itself worth recording: say so plainly and ask, rather than filling the gap
from memory.

Then **share what you found** with the user — the source, what it says, and how it
shaped what you did. The user is learning alongside you, so a fact you dug up and
kept to yourself only helps once; the same fact explained, with its source, teaches
them where to look next time.

## When to use this skill

- You need a specific fact about an API, a convention, or how something is done, and
  you are reaching for memory — go get a source instead.
- You are about to introduce a pattern and want to copy how it is already done here
  (rung 1) or in your org (rung 2) rather than invent one.
- You want prior art for an unfamiliar problem — someone has likely solved it (rung
  4).

Skip it for general mechanics you are not guessing about — plain language syntax or
how a common tool works — where there is no project- or domain-specific claim to
ground.
