# GitHub commands for pull-request review

The implementation lives in the sibling `scripts/` directory. Run scripts by their
absolute path when the current working directory is not the skill directory:

```bash
/path/to/pr-review/scripts/<script>.sh ...
```

The examples below use `scripts/` for readability.

## Authentication

```bash
scripts/check_auth.sh
```

This verifies that the GitHub CLI is authenticated and prints the current login.

## Read a pull request

```bash
scripts/read_pr.sh OWNER/REPOSITORY NUMBER metadata
scripts/read_pr.sh OWNER/REPOSITORY NUMBER diff
scripts/read_pr.sh OWNER/REPOSITORY NUMBER checks
```

The metadata output includes the head commit ID needed for pinned source retrieval.

## Read a changed file at the PR head

```bash
scripts/read_file.sh OWNER/REPOSITORY NUMBER PATH
```

The script obtains the PR head commit itself and reads the file from that commit.

## Prepare an isolated test workspace

```bash
workspace="$(scripts/prepare_workspace.sh OWNER/REPOSITORY NUMBER)"
printf '%s\n' "$workspace"
```

The script downloads an exact source snapshot at the PR head commit into a
temporary directory. Apply the proposed change only inside that directory, run the
narrowest repository-supported validation command there, compare it with the
unchanged behavior, and remove the directory afterward:

```bash
rm -rf "$workspace"
```

## Read published reviews and comments

```bash
scripts/read_reviews.sh OWNER/REPOSITORY NUMBER
```

This returns issue comments, inline review comments, and published reviews.

## Read pending reviews and threads

```bash
scripts/read_pending_review.sh OWNER/REPOSITORY NUMBER
```

This returns pending review node IDs and the current review-thread comments. Use
comment node IDs when deleting comments; use the pending review node ID when adding
threads.

## Create a pending review

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

Run:

```bash
scripts/create_pending_review.sh OWNER/REPOSITORY NUMBER pending-review.json
```

The input must not contain an `event` field. `COMMENT`, `APPROVE`, and
`REQUEST_CHANGES` are submission events, not pending-review values.

## Add a comment to an existing pending review

Create `add-review-thread.json`:

```json
{
  "query": "mutation($input: AddPullRequestReviewThreadInput!) { addPullRequestReviewThread(input: $input) { thread { id } } }",
  "variables": {
    "input": {
      "pullRequestReviewId": "PENDING_REVIEW_NODE_ID",
      "body": "Could we extract this operation?\n\n```text\nprivate operation(value):\n  ...\n```",
      "path": "src/example-file",
      "line": 42,
      "side": "RIGHT"
    }
  }
}
```

Run:

```bash
scripts/add_review_thread.sh add-review-thread.json
```

Use `RIGHT` for a normal added or modified line and `LEFT` for a deleted-side
line. If the target is not part of the diff, anchor the comment to a nearby changed
line and name the relevant symbol or block in the comment.

## Delete a pending review comment

Use the comment node ID, not the thread ID:

```bash
scripts/delete_review_comment.sh COMMENT_NODE_ID
```

The script should only be run after the user explicitly asks to remove a comment.

## Submit a pending review

Confirm the final comment set and requested event immediately before submitting:

```bash
scripts/submit_review.sh OWNER/REPOSITORY NUMBER REVIEW_ID COMMENT \
  "Review submitted after verification." --confirm
```

The event may be `COMMENT`, `APPROVE`, or `REQUEST_CHANGES`. The script requires
`--confirm`. Never use `APPROVE` or `REQUEST_CHANGES` unless the user explicitly
chooses that outcome.

## Verify after every write

```bash
scripts/verify_review.sh OWNER/REPOSITORY NUMBER
```

Check that the intended comments exist, unwanted comments are gone, and the review
state is still `PENDING` unless submission was explicitly requested.

## Validation boundary

Read scripts may be run during validation. Comment creation and deletion may be
run only against a review the user has authorized. The submission script should not
be run just to validate syntax; report it as untested unless the user explicitly
requests submission.
