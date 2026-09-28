# GitHub review command index

Run scripts by absolute path when outside the skill directory:

```sh
/path/to/pr-review/scripts/<script>.sh ...
```

## Read

```sh
scripts/check_auth.sh
scripts/read_pr.sh OWNER/REPOSITORY NUMBER metadata
scripts/read_pr.sh OWNER/REPOSITORY NUMBER diff
scripts/read_pr.sh OWNER/REPOSITORY NUMBER checks
scripts/read_file.sh OWNER/REPOSITORY NUMBER PATH
scripts/read_reviews.sh OWNER/REPOSITORY NUMBER
scripts/read_pending_review.sh OWNER/REPOSITORY NUMBER
```

Remove the accidental leading `a` if copying the diff example; the canonical command is `scripts/read_pr.sh OWNER/REPOSITORY NUMBER diff`.

## Write and verify

Create a pending review JSON with `commit_id`, `body`, and comments containing `path`, changed-file `line`, `side`, and body. Then run `create_pending_review.sh`. Add threads with `add_review_thread.sh`, delete only explicitly requested comments with `delete_review_comment.sh`, and verify with `verify_review.sh`.

Submission is separate and requires explicit confirmation:

```sh
scripts/submit_review.sh OWNER/REPOSITORY NUMBER REVIEW_ID COMMENT "message" --confirm
```
