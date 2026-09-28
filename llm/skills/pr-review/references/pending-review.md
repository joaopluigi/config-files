# Pending review workflow

Read published reviews with `scripts/read_reviews.sh` and pending state with
`scripts/read_pending_review.sh`. The pending response supplies the review node
ID for threads and comment node IDs for deletion.

Create a pending review JSON with `commit_id`, optional `body`, and comments:

```json
{"commit_id":"HEAD_SHA","body":"Summary","comments":[{"path":"src/file","line":42,"side":"RIGHT","body":"Comment"}]}
```

Run `scripts/create_pending_review.sh OWNER/REPOSITORY NUMBER FILE`. Add one
thread at a time with a GraphQL JSON payload containing `pullRequestReviewId`,
`body`, `path`, `line`, and `side`, passed to `scripts/add_review_thread.sh`.
Use `RIGHT` for changed/added lines and `LEFT` only for deleted lines; anchor to
a nearby changed line when the target is outside the diff.

Delete only an explicitly requested comment by its comment node ID with
`scripts/delete_review_comment.sh`. Submit only after confirming the final set:
`scripts/submit_review.sh OWNER/REPOSITORY NUMBER REVIEW_ID EVENT MESSAGE --confirm`.
Do not run submission just to test syntax. Verify every mutation with
`scripts/verify_review.sh` and report whether the review remains pending or was
submitted.
