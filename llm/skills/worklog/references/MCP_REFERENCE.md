# MCP reference

The self-contained server in `llm/mcp/worklog/server.mjs` registers these tools:

- `worklog_session_create(actor, goal, done, steps)` creates the main log and
  returns `orchestrationId`, `capabilityToken`, and `path`.
- `worklog_peer_create(orchestrationId, capabilityToken, actor, goal, done,
  steps)` creates a peer log and returns its `peerId`, token, and path.
- `worklog_append(..., peerId?, item, actor, tag, message)` appends an entry. A
  `tag=done` append terminally completes that addressed plan item; do not call
  `worklog_close` afterward for the same item.
- `worklog_append_batch(orchestrationId, capabilityToken, peerId?, actor,
  entries)` appends a non-empty ordered array of `{item, tag, message}` entries
  using one shared actor. The session capability authorizes the main log and the
  peer capability authorizes that peer log; actor ownership is checked for peer
  operations. The request is authorized and the full batch is validated before a
  single locked write. Validation proceeds in supplied array order against the
  progressively accumulated content, and any validation failure leaves the log
  unchanged. The response is the rendered array in the same caller-supplied
  order; item numbers are not automatically sorted. It follows the same
  validation and error conventions as `worklog_append`, including positive
  planned items, supported tags, non-empty messages, and `src:` for `find`
  entries. This does not promise crash-durable transactionality.
- `worklog_read(..., peerId?, since?)` reads a log from a byte offset.
- `worklog_ask(..., sourcePeerId?, targetPeerId, item, actor, question)` creates
  a linked question; `worklog_answer(..., peerId, questionId, item, actor,
  answer)` answers it with the target peer token.
- `worklog_status(..., peerId?)` returns path, content, and completion state.
- `worklog_close(..., peerId?, item, actor, message)` finalizes the entire
  session or peer log by appending the final `done` only when items and linked
  questions are complete. It is whole-log completion, not item completion, and
  must not follow `worklog_append(tag=done)` for the same item.

IDs are eight lowercase hexadecimal characters. Capability tokens are opaque
hex strings: the session token authorizes the main log and orchestrator
inspection; a peer token authorizes only that peer's log, answers, and close.
Actor ownership is checked for peer operations. Valid actors are
`orchestrator`, `investigator`, `ideator`, `executor`, `tester`, `reviewer`,
`critic`, `maintainer`, and `researcher`; tags are `think`, `find`, `decide`,
`done`, `plan`, `question`, `answer`, and `note`. Entries reject newlines,
unknown items, duplicate answers, unsourced `find` text, and out-of-order close.

## Storage and lifecycle

`WORKLOG_DIR` selects the root; the default is `/tmp/worklogs`. The server creates
one directory per orchestration, a registry, a main log, and peer logs. It uses
per-log lock directories and in-process queues. `WORKLOG_LOCK_STALE_MS` defaults
to `30000`; `WORKLOG_LOCK_WAIT_MS` defaults to `10000`. Stale locks are replaced
only when no local queue owns the key; lock cleanup is owner-checked.

A session is complete only when every planned item is done and all linked
questions are answered. Read/status are capability-gated. Close is atomic with
completion validation and does not append an incomplete final entry.

## Migration boundary

The deleted shell CLI and its hand-managed paths, actors, timestamps, and tokens
are not restored. Use the MCP tools and returned IDs, tokens, and paths instead;
`WORKLOG_DIR` is the supported storage boundary. The example remains at
[`worklog_example.txt`](worklog_example.txt) as a format example, not a CLI
contract.
