# Agent and LLM configuration

This directory contains configuration and guidance for agents and LLM tools.

## Ownership map

- `rules/` — shared behavior and principles.
- `skills/` — reusable task procedures and their references.
- `agents/` — role boundaries and responsibilities.
- `mcp/` — local protocol services and their projects.
- `eca/` — runtime configuration.

## Professional ECA configuration

`eca/professional.json` is the tracked baseline. To add private, machine-specific MCP servers or disabled-tool patterns, create the ignored `eca/professional.local.json` file and edit it locally. It is never loaded automatically unless it is named exactly `professional.local.json`.

Run `./install.sh professional` to validate the baseline and, when present, merge the local file into `$HOME/.config/eca/config.json`. The overlay may contain a top-level `mcpServers` object and/or `disabledTools` list of strings. Local server entries replace baseline entries with the same server name or add new names. Disabled-tool patterns are appended to the baseline list with stable de-duplication. Other baseline settings cannot be changed by the overlay. The merged file is written atomically.
