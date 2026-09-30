---
name: worklog
description: "Maintain an append-only worklog for any task."
---

# Worklog

A worklog is the agent's incremental working notebook or execution diary for a task.

Use the worklog MCP tools for the full lifecycle. The server creates the session, IDs,
paths, capability tokens, and peer logs. Never invent any of them.

Reference index: [`references/REFERENCE.md`](references/REFERENCE.md). Read it before
using the detailed MCP reference or worklog example.

## Lifecycle

1. Create one session with a goal, done condition, and plan steps.
2. Append short entries with a positive plan item, valid actor, and valid tag.
3. Close only after every plan item is done and every question is answered.

The session must ALWAYS be closed!

> When working in the same session, call `worklog_session_status` before deciding whether to reuse it or create a new session.

The server is append-only and rejects invalid actors, tags, items, unsourced `find` entries, unauthorized peers, duplicate answers, and invalid capability tokens. The session token is for the main log and authorized session-owner inspection. Preserve the returned IDs and tokens exactly.

Other things to keep in mind:

- Plan items are creation-time-only;
- Closed items reject later entries; and
- `actor` is the agent that happens to call the tool.
- Completion does not change until all items are closed (must be closed in order #1, #2, ...).

## When working with subagents (peers)

Whenever a session coordinates delegated participants, the session owner creates one peer log per participant with `worklog_peer_create`, records the participant's actor explicitly, and passes the exact server-returned `orchestrationId`, `peerId`, peer `capabilityToken`, peer log `path`, and the `actor` is the subagent being spwaned. The owner must instruct the participant to read its supplied peer worklog before executing any substantive step, then use all five values verbatim for every operation, must not use a parent token, and must not create or recreate another worklog or invent any identifier or path. The delegated prompt must identify these values as the server-created peer worklog context.

> For an interrupted participant, use `worklog_subagent_replace` to create a new authorized peer linked to the predecessor, never reuse the predecessor token, pass the new peer context and continuation reason to the replacement, and preserve old peer history.

Before closing a session, the owner must also close all worklogs of subagents, if the subagent did not close them itself.
