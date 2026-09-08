---
name: pr-review
description: "Review a GitHub pull request with evidence-grounded, actionable comments, using the GitHub CLI for inspection, pending review comments, verification, and optional submission."
---

# Pull Request Review

This skill reviews a GitHub pull request and produces focused, evidence-grounded
review comments. It can stay read-only, prepare a pending review, or submit a
review only after the user explicitly asks for that action.

## When to use

Use this skill when the user asks to:

    /pr-review <owner/repository> <number>
    /pr-review <pull-request-url>

The user may also provide local guidance, such as a `CONTRIBUTING.md`, review
rubric, architecture document, or team-specific checklist. Treat that guidance as
part of the review criteria only when the user provides it or explicitly points to
it.

If the repository, pull request number, or review mode is unclear, ask before
fetching or writing anything.

## Review modes

Resolve the mode before acting:

- **Read-only** — inspect the PR and return suggested comments in chat. Do not
  write to GitHub.
- **Pending review** — create or update a GitHub review that remains pending. Do
  not submit it.
- **Submit review** — add the comments and submit the review as `COMMENT`,
  `APPROVE`, or `REQUEST_CHANGES`. Require explicit confirmation immediately
  before submission.

Default to **read-only** when the user has not asked to post comments. Never submit
an approval or change request implicitly.

### Comment breadth by mode

Use the mode to decide how broadly to report findings:

- **Read-only and pending review — exhaustive pass.** Report every independent,
  actionable, evidence-grounded comment found by the required full-file and recursive
  analysis. Do not stop after three comments or use any other arbitrary numeric cap.
  Include lower-confidence but still well-supported maintainability suggestions so the
  user can triage and remove unwanted comments before submission. Keep one concern per
  comment and combine repeated instances into a file-level or review-level comment when
  that is clearer.
- **Submit review — conservative pass.** Submit only the strongest comments: each must
  be independently actionable, clearly supported by the evidence boundary, and worth
  posting without further triage. Omit borderline, redundant, or preference-only
  suggestions. This is a quality filter, not a fixed numeric cap.

The breadth rule changes how many qualified comments survive selection; it does not
weaken the evidence boundary, the requirement for concrete maintenance costs, or the
instruction not to invent comments merely to reach a count.

### Peer-review disclaimer

Before declaring the review complete, have another peer agent independently review the
work and proposed comments. Treat that second review as a required sanity check, not as
a replacement for the evidence and verification steps below.

## Evidence boundary

Review only what can be grounded in a real source:

1. The pull request description and changed files.
2. The complete diff and nearby repository code needed to understand it.
3. Tests changed by the pull request and tests covering the affected behavior.
4. Repository-local guidance supplied by the user or present in the repository,
   such as `AGENTS.md`, `CONTRIBUTING.md`, or review checklists.
5. Documents and pull requests explicitly linked by the PR.
6. Official documentation for an external API or library when the PR depends on
   behavior not established by the repository.

Do not report a suspected bug from memory. If the behavior depends on an external
API, read its official documentation or say that the point is unverified.

For every proposed comment, keep an internal record of:

- the file and changed line;
- the behavior observed;
- the source supporting it;
- the impact or failure mode;
- the requested change;
- a small code example when an example makes the fix clearer.

## Review process

### 1. Identify the review target

Normalize a URL or `OWNER/REPOSITORY` plus number into:

- owner;
- repository;
- pull request number;
- base and head commit IDs;
- current reviewer identity.

Confirm authentication before any write operation:

```bash
scripts/check_auth.sh
```

If the authenticated user is not the intended reviewer, stop and ask.

### 2. Read the pull request

Fetch the PR description, changed files, commits, reviews, and conversation:

```bash
scripts/read_pr.sh OWNER/REPOSITORY NUMBER metadata
scripts/read_pr.sh OWNER/REPOSITORY NUMBER diff
```

For checks and merge state:

```bash
scripts/read_pr.sh OWNER/REPOSITORY NUMBER checks
```

Read changed files at the PR head commit. The script resolves the head commit
itself before retrieving pinned raw content:

```bash
scripts/read_file.sh OWNER/REPOSITORY NUMBER PATH
```

Do not modify the user's checkout. For experiments, prepare an isolated repository
copy outside the user's working tree:

```bash
scripts/prepare_workspace.sh OWNER/REPOSITORY NUMBER [TEMP_DESTINATION]
```

The script downloads an exact source snapshot at the PR head commit and prints the
workspace path. It does not modify the user's checkout. Apply the proposed change
only in that temporary workspace, then remove it after the experiment finishes.

### 3. Read repository guidance

Look for review instructions at the repository root and relevant parent
directories. Read only files that are in scope for the review, including:

```bash
find .. -name AGENTS.md -o -name CONTRIBUTING.md -o -name REVIEW.md
```

When the user points to a specific guidance file, read it directly and cite its
path and line range in the review notes.

### 4. Inspect existing review discussion

Read published issue comments, review comments, and review summaries:

```bash
scripts/read_reviews.sh OWNER/REPOSITORY NUMBER
```

Pending review threads are not reliably visible through the basic REST listing.
Use the pending-review script when you need the current pending review or inline
thread state:

```bash
scripts/read_pending_review.sh OWNER/REPOSITORY NUMBER
```

Treat existing comments as review context, not as a stopping point. For each
existing comment that identifies a structural issue, inspect the whole surrounding
block for a smaller, independent operation that should also be named. If the
additional operation is part of the same concern, strengthen the existing comment
or add a focused follow-up in that thread; do not duplicate the original request.
If a comment was moved, edited, or removed, use the current thread state as the
source of truth.

### 5. Analyze the diff

Review readability and maintainability only unless the user explicitly asks for a
correctness review. Do not produce correctness, security, lifecycle-correctness, or
contract findings by default. Structural comments about lifecycle orchestration,
cleanup ownership, and recovery sequencing are still in scope when they identify a
concrete readability or maintainability cost.

For every changed production file, inspect whether:

1. names clearly describe transformations, decisions, predicates, and lifecycle states;
2. functions expose their main flow instead of hiding it in callbacks or bindings;
3. nested bindings or optional-value branches conceal meaningful operations;
4. repeated expressions should be evaluated once and reused by the branch that consumes them;
5. boolean arguments or positional flags hide distinct operations at call sites;
6. classifiers, parsers, or protocol dispatchers are mixed with the handling for each case;
7. pure state calculation is mixed with mutation, publication, I/O, or other effects;
8. tests separate independent scenarios, group related cases clearly, and explain their assertions;
9. a small private helper would make future changes safer or easier to review;
10. the structure makes the code harder to extend or review than necessary;
11. build, lint, or task configuration puts each command in the configuration that owns it and makes composed steps visible.

This pass is mandatory for every changed production file. Build a function inventory
from the diff and inspect every changed function; do not stop after finding one or
two comments. Continue until each changed function and relevant test has either a
concrete comment or a recorded reason why no comment applies. Do not invent a
comment just to fill a quota.

Pay special attention to these repeatable structures:

- large output, formatting, lifecycle, or orchestration functions with several
  independent print, render, response, setup, cleanup, or recovery branches;
- functions whose binding block contains several intermediate values, especially
  when nested bindings make preparation and the main operation difficult to see;
- repeated lookups or computations in one branch that should be bound once before
  they are consumed or transformed;
- collection or completion callbacks that transform one item, map a result to a
  terminal state, or contain conditionals or multiple bindings;
- conditional branches whose body performs a complete transformation, even when
  the surrounding function already has a broader extraction candidate;
- input or protocol handlers that classify a frame, message, or result and also
  perform the work for one or more classifications;
- stateful handlers that combine parsing, state reconciliation, publication,
  mutation, resource setup, or retry behavior;
- recursive map transformations that can separate item handling from map traversal;
- boolean flags whose values select different operations or modes at call sites;
- compound conditions whose names would explain the decision more clearly than
  the individual predicates;
- tests with multiple behaviors or assertions whose failure messages are unclear;
- task, build, or lint configuration where a composite command may belong in a
  task runner rather than a dependency or tool declaration.

When a function has nested bindings, inspect whether the outer function can keep a
single visible orchestration binding by moving preparation into a private helper.
When a branch already has a useful structural comment, inspect the branch body too:
a helper for the branch's decision or transformation may be a separate, more
focused follow-up. Apply this recursively until each meaningful operation in the
changed function has either a concrete comment or a recorded reason why extraction
would not improve the code. Also inspect whether the function crosses a boundary
between classification and handling, pure state calculation and effects, or resource
setup and lifecycle orchestration; these are separate extraction candidates when
future changes to either side would be independent.

For every proposed structural change, run the smallest safe experiment that can
show the suggestion is valid. Inspect the repository's tooling and use its narrowest
appropriate interpreter, REPL, compiler, type checker, formatter, linter, unit test,
or equivalent. Do not assume a launcher or command, and do not execute destructive
commands or change the repository unless the user asks.

A useful review comment has this shape:

> Could we move or rename X so the main flow is easier to follow? That could give us
> better separation of responsibilities.
> Here is a small example of the intended shape when it removes ambiguity.

Keep the wording short and directed. Do not enumerate every operation already visible
in the code. Do not make a comment only because a different style would be preferable;
name the concrete readability or maintenance benefit and keep one concern per comment.

Before writing comments, read `references/review-patterns.md` and
`assets/review-examples.md`. Apply the behavior rules and use the pseudocode examples
for readability and maintainability findings, personal wording, optional severity
classification, concise wording, helper extraction, nested bindings, conditional
forms, test behavior, comment placement, and code examples. Translate the examples
into the language and conventions of the repository under review. Do not post vague
style comments, but do post concrete readability and maintainability comments by
default.

### 6. Handle an empty finding set

If the final review contains no actionable, evidence-grounded comments, stop after
verification. Do not create or update a pending GitHub review, add a review summary,
submit a review, or post any other GitHub comment. In read-only mode, report the
assessment only in chat; in pending-review and submit-review modes, leave GitHub
unchanged.

### 7. Write comments

Use inline comments for code-local issues and a review summary for cross-cutting
issues. Each default inline comment should:

- point to a changed line;
- concern a concrete readability, maintainability, or implementation-logic issue;
- describe observed code or behavior, not a guessed intention;
- explain the concrete maintenance cost or consequence;
- use a personal tone without visible priority markers by default;
- ask one clear question or request;
- include a concise, repository-matching code example or concrete suggested shape for every comment that requests a code or test change; do not leave a refactor suggestion without showing the intended boundary, names, or assertion structure;
- avoid repeating another reviewer's comment.

Use a file-level or review-level comment when the same issue appears repeatedly.
Do not add ten identical comments to similar tests.

### 8. Verify before reporting or posting

Before returning suggested comments or writing them to GitHub:

- re-read every proposed comment;
- verify its line still belongs to the PR diff;
- check that the example matches the surrounding names and argument order;
- check that the issue is not already covered by an existing comment;
- separate correctness blockers from style suggestions;
- run the smallest relevant test or command when the environment permits it.

## GitHub write workflow

### Create a new pending review

A pending review is created through the reviews API. Do not pass an `event` field;
`APPROVE`, `COMMENT`, and `REQUEST_CHANGES` submit the review immediately.

Create a JSON input file, for example `pending-review.json`:

```json
{
  "commit_id": "HEAD_SHA",
  "body": "Additional review comments.",
  "comments": [
    {
      "path": "src/example-file",
      "line": 42,
      "side": "RIGHT",
      "body": "Could we move this transformation into a named helper?\n\n```text\nprivate normalize-value(value):\n  ...\n```"
    }
  ]
}
```

Execute it with:

```bash
scripts/create_pending_review.sh OWNER/REPOSITORY NUMBER pending-review.json
```

The response contains the pending review ID. Save it before adding more comments.

When validating this workflow, distinguish commands that were actually run from
commands that are documented only. Read commands and non-submitting comment
mutations may be tested against a review the user authorized. Do not execute the
submission command merely to validate its syntax; report it as untested unless the
user explicitly asks to submit a review.

### Add a comment to an existing pending review

Get the GraphQL review node ID from the pending-review query, then create one
thread at a time:

```json
{
  "query": "mutation($input: AddPullRequestReviewThreadInput!) { addPullRequestReviewThread(input: $input) { thread { id } } }",
  "variables": {
    "input": {
      "pullRequestReviewId": "PENDING_REVIEW_NODE_ID",
      "body": "Could we extract this transformation?\n\n```text\nprivate transform-value(value):\n  ...\n```",
      "path": "src/example-file",
      "line": 42,
      "side": "RIGHT"
    }
  }
}
```

Execute it with:

```bash
scripts/add_review_thread.sh add-review-thread.json
```

Use the changed-file line number and `side: RIGHT` for a normal added or modified
line. Use `side: LEFT` only when the comment targets the deleted side of the diff.
If a line is not part of the diff, anchor the comment to a nearby changed line and
name the relevant symbol or block in the body.

### Delete a pending review comment

Delete only a comment that the user explicitly asked to remove. Use the comment's
GraphQL node ID, not the thread ID:

```bash
scripts/delete_review_comment.sh COMMENT_NODE_ID
```

### Submit a pending review

Submitting is a separate, explicit action. Confirm the final comment set and the
requested event immediately before submitting:

```bash
scripts/submit_review.sh OWNER/REPOSITORY NUMBER REVIEW_ID COMMENT \
  "Review submitted after verification." --confirm
```

Possible review events are `COMMENT`, `APPROVE`, and `REQUEST_CHANGES`. Never use
`APPROVE` or `REQUEST_CHANGES` unless the user explicitly chooses that outcome.
The script requires `--confirm` as a second guard against accidental submission.

### Verify the result

After creating, deleting, or submitting comments, query GitHub again:

```bash
scripts/verify_review.sh OWNER/REPOSITORY NUMBER
```

Report exactly what was posted and whether the review is still pending or was
submitted.

## Output

For read-only mode, return:

1. a short overall assessment;
2. comments grouped by severity;
3. each comment's file and line;
4. the proposed review text;
5. any unverified concern or missing source;
6. tests or commands run.

For pending-review mode, when comments were added, return the same assessment plus
the GitHub review status and the number of comments added. When no comments were
found, return only the assessment and state that GitHub was left unchanged. Do not
claim that a review was submitted unless the verification query shows a submitted
state.
