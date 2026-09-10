---
name: pr-review
description: "Operate on a GitHub pull request for review: read its content, work in an isolated git worktree or snapshot at the PR head, and create, update, verify, or submit pending review comments through the GitHub CLI. Pairs with the reviewing skill, which decides what to look for and how to write findings."
---

# Pull Request Review -- GitHub Mechanics

This skill is the operational side of reviewing a GitHub pull request: how to
read it, how to get an isolated copy of the repository to experiment in, and
how to write comments back to GitHub. It does not define what to look for or
how to judge the work -- load the `reviewing` skill for that.

## When to use

Use this skill when the user asks to:

    /pr-review <owner/repository> <number>
    /pr-review <pull-request-url>

If the repository, pull request number, or review mode is unclear, ask before
fetching or writing anything.

## Pair with the reviewing skill

1. Use this skill to identify the pull request, read its content, and prepare
   an isolated worktree or snapshot for any local experiment.
2. Load the `reviewing` skill to decide what to check, run the review, and
   shape findings into concrete comments.
3. Come back to this skill's write workflow below to post, verify, and
   optionally submit those comments.

## Review modes

Resolve the mode before acting:

- **Read-only** -- inspect the PR and return suggested comments in chat. Do
  not write to GitHub.
- **Pending review** -- create or update a GitHub review that remains
  pending. Do not submit it.
- **Submit review** -- add the comments and submit the review as `COMMENT`,
  `APPROVE`, or `REQUEST_CHANGES`. Require explicit confirmation immediately
  before submission.

Default to **read-only** when the user has not asked to post comments. Never
submit an approval or change request implicitly.

The mode only controls which GitHub write operations are allowed below; it does
not change how many findings the `reviewing` skill should look for.

## Review comment formatting

When a proposed review comment includes an example or code change, present every
code example as a fenced Markdown code block with an appropriate language tag,
including single-line examples. Do not put code examples in inline backticks.
Keep inline backticks for short identifiers, expressions, and file names only.

For example:

```clojure
(defn normalize-value [value]
  ...)
```

## The implementation lives in `scripts/`

Run scripts by their absolute path when the current working directory is not
the skill directory:

```bash
/path/to/pr-review/scripts/<script>.sh ...
```

The examples below use `scripts/` for readability. See
`references/gh-commands.md` for the full command reference.

## 1. Identify the review target and authenticate

Normalize a URL or `OWNER/REPOSITORY` plus number into owner, repository,
pull request number, base and head commit IDs, and current reviewer identity.

Confirm authentication before any write operation:

```bash
scripts/check_auth.sh
```

If the authenticated user is not the intended reviewer, stop and ask.

## 2. Read the pull request

Fetch the PR description, changed files, commits, reviews, and conversation:

```bash
scripts/read_pr.sh OWNER/REPOSITORY NUMBER metadata
scripts/read_pr.sh OWNER/REPOSITORY NUMBER diff
scripts/read_pr.sh OWNER/REPOSITORY NUMBER checks
```

Read changed files at the PR head commit; the script resolves the head commit
itself before retrieving pinned raw content:

```bash
scripts/read_file.sh OWNER/REPOSITORY NUMBER PATH
```

## 3. Create an isolated copy of the repository

Do not modify the user's checkout and never check out the PR branch there.
When a local clone is available, resolve the PR head commit and use an
isolated, detached worktree at that exact commit for any local test or
experiment, never the user's current checkout:

```bash
git fetch origin "pull/NUMBER/head"  # only if the head commit is not local yet
```

If no local clone is available, use the isolated snapshot fallback instead:

```bash
workspace="$(scripts/prepare_workspace.sh OWNER/REPOSITORY NUMBER)"
printf '%s\n' "$workspace"
```

That script downloads an exact source snapshot at the PR head commit into a
temporary directory and does not touch the user's checkout. Apply any
proposed change only inside that directory, then remove it afterward:

```bash
rm -rf "$workspace"
```

## 4. Locate repository guidance

Look for review instructions at the repository root and relevant parent
directories:

```bash
find .. -name AGENTS.md -o -name CONTRIBUTING.md -o -name REVIEW.md
```

Hand any file found here to the `reviewing` skill as an evidence source; this
skill only locates the files.

## 5. Read existing review discussion

Read published issue comments, review comments, and review summaries:

```bash
scripts/read_reviews.sh OWNER/REPOSITORY NUMBER
```

Pending review threads are not reliably visible through the basic REST
listing. Use the pending-review script for the current pending review or
inline thread state:

```bash
scripts/read_pending_review.sh OWNER/REPOSITORY NUMBER
```

Comment node IDs from this output are needed to delete comments; the pending
review node ID is needed to add threads. Hand this discussion to the
`reviewing` skill so it does not repeat what is already covered.

## GitHub write workflow

### Create a new pending review

A pending review is created through the reviews API. Do not pass an `event`
field; `APPROVE`, `COMMENT`, and `REQUEST_CHANGES` submit the review
immediately.

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

The response contains the pending review ID. Save it before adding more
comments.

When validating this workflow, distinguish commands that were actually run
from commands that are documented only. Read commands and non-submitting
comment mutations may be tested against a review the user authorized. Do not
execute the submission command merely to validate its syntax; report it as
untested unless the user explicitly asks to submit a review.

### Add a comment to an existing pending review

Get the GraphQL review node ID from the pending-review query, then create one
thread at a time. Create `add-review-thread.json`:

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

Use the changed-file line number and `side: RIGHT` for a normal added or
modified line. Use `side: LEFT` only when the comment targets the deleted side
of the diff. If a line is not part of the diff, anchor the comment to a
nearby changed line and name the relevant symbol or block in the body.

### Delete a pending review comment

Delete only a comment the user explicitly asked to remove. Use the comment's
GraphQL node ID, not the thread ID:

```bash
scripts/delete_review_comment.sh COMMENT_NODE_ID
```

### Submit a pending review

Submitting is a separate, explicit action. Confirm the final comment set and
the requested event immediately before submitting:

```bash
scripts/submit_review.sh OWNER/REPOSITORY NUMBER REVIEW_ID COMMENT \
  "Review submitted after verification." --confirm
```

Possible review events are `COMMENT`, `APPROVE`, and `REQUEST_CHANGES`. Never
use `APPROVE` or `REQUEST_CHANGES` unless the user explicitly chooses that
outcome. The script requires `--confirm` as a second guard against accidental
submission.

### Verify the result

After creating, deleting, or submitting comments, query GitHub again:

```bash
scripts/verify_review.sh OWNER/REPOSITORY NUMBER
```

Report exactly what was posted and whether the review is still pending or was
submitted.

## Handle an empty finding set

If the `reviewing` skill's pass produces no actionable, evidence-grounded
comment, stop after verification. Do not create or update a pending GitHub
review, add a review summary, submit a review, or post any other GitHub
comment. In read-only mode, report the assessment only in chat; in
pending-review and submit-review modes, leave GitHub unchanged.

## Output

For read-only mode, return:

1. the assessment and findings produced by the `reviewing` skill;
2. each comment's file and line;
3. the proposed review text;
4. any unverified concern or missing source;
5. tests or commands run, including worktree setup and cleanup.

For pending-review mode, when comments were added, return the same output
plus the GitHub review status and the number of comments added. When no
comments were found, return only the assessment and state that GitHub was
left unchanged. Do not claim that a review was submitted unless the
verification query shows a submitted state.
