# Agent and LLM configuration

This directory contains configuration and guidance for agents and LLM tools.

## Ownership map

- `rules/` — shared behavior and principles.
- `skills/` — reusable task procedures and their references.
- `agents/` — role boundaries and responsibilities.
- `mcp/` — local protocol services and their projects.
- `eca/` — runtime configuration.

## Professional ECA configuration

`eca/professional.json` is the tracked baseline. To add private, machine-specific MCP servers, copy `eca/professional.local.example.json` to `eca/professional.local.json` and edit the copy. The local file is ignored and is never loaded automatically unless it is named exactly `professional.local.json`.

Run `./install.sh professional` to validate the baseline and, when present, merge the local file into `$HOME/.config/eca/config.json`. The first version permits only a top-level `mcpServers` object; local entries replace baseline entries with the same server name or add new names. Providers, model/agent defaults, disabled tools, approvals, and all other baseline settings cannot be changed by the overlay. The merged file is written atomically; the example file is documentation only.
