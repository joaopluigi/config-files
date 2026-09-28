---
name: worklog
description: "Maintain an append-only, server-coordinated worklog for a task."
---

# Worklog

Use the worklog MCP tools for the full lifecycle. The server creates the session, IDs,
paths, capability tokens, and peer logs. Never invent any of them.

## Lifecycle

1. Create one session with a goal, done condition, and plan steps.
2. Create one peer log for each delegated worker, recording its actor.
3. Append short entries with a positive plan item, valid actor, and valid tag.
4. Use linked questions and answers when a worker needs bounded clarification.
5. Read or inspect status with the capability appropriate to the session or peer.
6. Close only after every plan item is done and every linked question is answered.

The server is append-only and rejects invalid actors, tags, items, unsourced `find`
entries, unauthorized peers, duplicate answers, and invalid capability tokens. The
session token is for the main log and orchestrator inspection; each peer token is
for that peer's log and answers. Preserve the returned IDs and tokens exactly.

## Completion report

Use status and close to confirm the final log path, evidence, validation, open
questions, and stop status. Keep one independent worklog per agent and do not
write into another agent's log.
