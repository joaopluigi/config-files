---
name: worklog
description: "Maintain an append-only, server-coordinated worklog for a task."
---

# Worklog

Use the worklog MCP tools for the full lifecycle. The server creates the session, IDs,
paths, capability tokens, and peer logs. Never invent any of them.

The MCP project is self-contained at `llm/mcp/worklog/`. Install its dependencies with
`cd llm/mcp/worklog && npm ci`; its local `npm test` owns the worklog-MCP tests. The
ECA install symlink points directly to `server.mjs`.

Reference index: [`references/REFERENCE.md`](references/REFERENCE.md). Read it before
using the detailed MCP reference or worklog example.

## Lifecycle

1. Create one session with a goal, done condition, and plan steps.
2. Create one peer log for each delegated worker, recording its actor.
3. Append short entries with a positive plan item, valid actor, and valid tag.
4. If an interrupted child must continue, the session owner must use `worklog_subagent_replace` with the existing session context and these exact handoff fields: `predecessorPeerId`, replacement `actor`, `goal`, `done`, `steps`, and a non-empty `continuationReason`. This creates a new peer ID and token; it never transfers or reuses the predecessor token or actor. The predecessor remains unchanged, and only the new peer may write to the new log.
5. Use linked questions and answers when a worker needs bounded clarification.
6. Read or inspect status with the capability appropriate to the session or peer.
7. Close only after every plan item is done and every linked question is answered.
8. When a candidate session is known, the session owner must call `worklog_session_status` before deciding whether to reuse it or create a new session. Status discovery is discovery-only and does not grant mutation authority. Same-session reuse requires the exact existing orchestration ID and session capability token, materially matching goal/done/steps, incomplete status, and a compatible open plan item. If status is ambiguous, do not guess IDs or tokens; treat it as a non-match and create a new session or ask the user as appropriate. A follow-up session uses a new orchestration ID and token, records `predecessorOrchestrationId` and a non-empty `continuationReason`, preserves the goal/done/steps structure as appropriate, and never inherits old worker tokens.

Follow-up entries may be appended repeatedly to an existing open item with existing non-`plan` tags. Plan items are creation-time-only, closed items reject later entries, and completion does not change until the item is closed. For an interrupted worker, use `worklog_subagent_replace` to create a new authorized peer linked to the predecessor, never reuse the predecessor token, pass the new peer context and continuation reason to the replacement, and preserve old peer history. These contracts specify required behavior and documented boundaries; prompt text does not prove hidden runtime prompt injection, coordination sequencing, authorization, or other enforcement.

The server is append-only and rejects invalid actors, tags, items, unsourced `find`
entries, unauthorized peers, duplicate answers, and invalid capability tokens. The
session token is for the main log and authorized session-owner inspection; each peer
token is for that peer's log and answers. Preserve the returned IDs and tokens exactly.

## Child actor and capability rules

`actor` is an authorization identity, not a session-owner designation and not the
agent that happens to call the tool. When a child peer is created, record the exact actor
registered for that peer and reuse that exact value for every child `worklog_append`,
`worklog_answer`, and `worklog_close` call. An actor value is valid for a child only
when that child was registered with the same actor value; otherwise the worker must
use its own registered actor (for example, `executor`). Do not default child
mutations to an unregistered actor.

Every child mutation must include `orchestrationId`, `peerId`, `capabilityToken`,
`actor`, and the operation-specific fields. Those fields are, respectively:
`item`, `tag`, and `message` for append; `questionId`, `item`, and `answer` for
answer; and `item` and `message` for close. The `peerId`, capability token, and
actor must belong to the same registered child peer; ownership checks remain in
force.

`worklog_read` and `worklog_status` are capability-gated operations. They require
the appropriate `orchestrationId`, `capabilityToken`, and optional `peerId`, but do
not use `actor` in the same authorization way and must not be treated as child
mutations. A peer token authorizes that peer's read/status access; the session token
can inspect registered child logs as allowed by the server.

## Active child-worklog use protocol

When a registered worklog context is supplied, read the supplied worklog context or previous work as the first action before substantive work or any other worklog mutation. This is a workflow requirement, not currently a runtime guarantee unless existing code supports it. The initial read is only a prerequisite; it is not active worklog use. During execution, append entries through the authorized child context so the log records the work as it happens. The following are recording purposes, not server tags or tag categories:

- **start/progress:** record the intended action and current status before or at the first substantive action.
- **milestone:** record meaningful advances and the plan item(s) they cover.
- **evidence/findings:** record required evidence with source path and section, observed fact, supported claim, validation result, assumptions or gaps, and stop status.
- **question/answer:** use linked question and answer entries whenever clarification occurs; unanswered clarification is not complete.
- **completion:** record final scope, evidence, validation, assumptions, open questions, stop status, and completion state before returning.

Every append must use exactly one supported server tag: `think`, `find`, `decide`, `done`, `plan`, `question`, `answer`, or `note`. These tags are the server vocabulary; recording purposes describe why an entry is made and do not form a one-to-one tag mapping. For example, evidence/findings may use `find` with a source, question/answer use `question` and `answer`, and completion commonly uses `done`; other purposes may use the supported tag that best fits the entry.

Cadence is mandatory: record start/progress before substantive work, milestone/progress after meaningful milestones, an entry covering each completed plan item, evidence/findings when evidence is required, question/answer entries after clarification, and completion before return or close. A `tag=done` append terminally completes the addressed plan item; do not call `worklog_close` afterward for that same item. `worklog_close` remains the whole-log completion operation and does not replace the required completion entry.

Before close or return, every plan item must be covered; evidence must be present or have an explicit no-evidence rationale; all questions must be answered; status must be `complete=true`, `openItems=[]`, and `openQuestions=[]`; and a completion entry must be present. This protocol requires active append usage, not merely an initial read, while preserving the existing lifecycle, tags, actor authorization, and capability rules.

## When working with subagents

Use this section whenever a session coordinates child workers. The session owner
creates one peer log per worker with `worklog_subagent_create`, records the
worker's actor explicitly, and passes the exact server-returned
`orchestrationId`, `peerId`, child `capabilityToken`, child log `path`, and
returned `actor` to that worker before work begins. The worker must read its
supplied child worklog before executing any substantive step, then use all five
values verbatim for every operation, must not use a parent token, and must not
create or recreate another worklog or invent any identifier or path. The child
prompt must identify these values as the server-created child worklog context.

A child uses its peer token for its own log and linked answers. Child
`worklog_append`, `worklog_answer`, and `worklog_close` calls must use the exact
registered actor for that peer; actor identity is an authorization identity,
not a role inferred from the caller. An actor value is valid only when that exact
value was registered for the peer. `worklog_read` and `worklog_status` are
capability-gated and use the appropriate session or peer context; they are not
child mutations and do not use actor authorization in the same way. The session
token may inspect permitted child logs, while a peer token authorizes that peer's
log, answers, and close. Before returning, the child must append its evidence and
completion record, confirm status, and close its child log after every plan item
and linked question is complete.

Use linked questions for bounded clarification: the source peer asks the target
peer with `worklog_ask`, and the target answers with its own peer token through
`worklog_answer`. Answers must not be duplicated. Read and status calls must
use the exact server-created identifiers and capability appropriate to the
session or peer. Append entries only to valid open plan items, with valid
actors and tags; follow-up entries use additional non-`plan` tags on the
existing open item. Plan entries are creation-time-only, closed items reject
later entries, and completion does not change until `done`.

For session reuse, first run `worklog_session_status` when a candidate is known.
Reuse requires the exact existing orchestration ID and session token, materially
matching goal/done/steps, incomplete status, and a compatible open plan item.
Discovery grants no mutation authority. If status is ambiguous, treat it as a
non-match rather than guessing identifiers or tokens. A follow-up session is a
new orchestration ID and token with `predecessorOrchestrationId` and a
non-empty `continuationReason`; preserve the goal/done/steps structure as
appropriate and never inherit old worker tokens.

For an interrupted worker, the session owner uses
`worklog_subagent_replace` with the existing session context, the exact
`predecessorPeerId`, replacement `actor`, `goal`, `done`, `steps`, and a
non-empty `continuationReason`. This creates a new authorized peer and returns
new context; never reuse the predecessor token or transfer its actor. Pass the
new context to the replacement worker and preserve the predecessor history.

Close a session or peer only after every plan item is done and every linked
question is answered. The session owner must retain and track the primary session
context and every server-created peer context, and must check their statuses to
verify closure before final reporting. If the server explicitly authorizes the
session owner to close a completed child using owner context, the session owner
may do so; otherwise never reuse the child's token or invent authority, and
report or escalate the authorization failure. The completion record must include
the final log path, evidence, validation, open questions, and stop status. Keep
one independent worklog per agent and never write into another agent's log.

## Completion report

Use status and close to confirm the final log path, evidence, validation, open
questions, and stop status. The session owner must check the primary and every
peer status before final reporting and must not report while any required record
is incomplete or open. Keep one independent worklog per agent and do not write
into another agent's log.
