# Agent Jr.

`llm/` contains durable agent behavior, task procedures, role profiles, and runtime configuration.

## Ownership

- `rules/` — always-on character and universal principles.
- `skills/` — reusable procedures for named task types; mandatory discovery and prior-art behavior is defined in `skills/discovery/SKILL.md`, with the result contract in `skills/discovery/discovery-result.schema.json`.
- `agents/` — role boundaries for the orchestrator and worker profiles.
- `eca/` — runtime configuration for the personal and professional setups.
- `mcp/worklog/` — the sole worklog implementation: sessions, peer logs, authorization, questions, status, locks, and completion.

The orchestrator profile is canonical at `agents/orchestrator.md`. The worklog usage guide is canonical at `skills/worklog/SKILL.md`; runtime behavior belongs to `mcp/worklog/server.mjs`. Configured tool allowlists and the delegation contract remain integration boundaries.
