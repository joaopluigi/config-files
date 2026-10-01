---
name: worklog
description: "Maintain an append-only worklog for any task."
---

# Worklog

A worklog is the agent's incremental working notebook or execution diary for a task. Use the worklog MCP tools.

## Lifecycle

### 1. Create

Create one session with a goal, done condition, and plan steps. Use the agent that happens to call the tool as `actor` . The server creates the session, IDs, paths, capability tokens, and peer logs. Never invent any of them.

> When working in the same session, check its status before deciding whether to reuse it or create a new session. If you create a new one, ensure the previous is closed or replaced. This keeps the worklog history clean.

The session token is for the main log and authorized session-owner inspection. Preserve the returned IDs and tokens exactly.

### 2. Record

Append short entries with a positive plan item, valid actor, and valid tag. Entries must be logged in real time rather than batched. Tasks must be handled strictly in sequential order (e.g., complete all entries for #1 before proceeding to #2).

### 3. Close

Close only after every plan item is done and every question is answered. The session must always be closed.

## Entry tags

Every entry must be associated with a tag that describes its purpose:

- `progress`: Records a simple progress update, such as “I’ll start by looking at the component files.”
- `think`: Records reasoning or a hypothesis, such as “I need to understand the current state of the repository and the latest commit.”
- `find`: Records an observed finding and must include a source, such as “React lets you build user interfaces out of individual pieces called components. src: https://react.dev/”.
- `decision`: Records a decision between alternatives, such as “I will style the date red because it aligns with the provided example.”
- `question`: Records a blocking question that must be answered before work can continue, such as “Should I apply the changes while preserving the other changes that are already in place?”
- `done`: Completes a plan item. Every worklog must contain a `done` entry for each plan item.

## When working with subagents (peers)

Whenever a session coordinates delegated participants, the session owner creates one peer log per participant, records the participant's actor explicitly, passes the exact server-returned payload and the `actor` is the subagent being spwaned. The owner must instruct the participant to read its supplied peer worklog and load the worklog skill before executing any substantive step, then use all five values verbatim for every operation, must not use a parent token, and must not create or recreate another worklog or invent any identifier or path. The delegated prompt must identify these values as the server-created peer worklog context. Instruct the peer to stop immediately if they are unable to access or update their worklog.

> For an interrupted participant, replace the worklog peer with a new authorized peer linked to the predecessor, never reuse the predecessor token, pass the new peer context and continuation reason to the replacement, and preserve old peer history.

Before closing a session, the owner must also close all worklogs of subagents, if the subagent did not close them itself.
