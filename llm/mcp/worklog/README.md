# Worklog MCP

This directory is a self-contained Node.js project for the worklog MCP server.
It owns the server dependencies and all worklog-MCP tests.

Install and test it from this directory:

```sh
cd llm/mcp/worklog
npm ci
npm test
```

From the repository root, the equivalent explicit command is:

```sh
npm --prefix llm/mcp/worklog test
```

The ECA installation keeps its symlink to `server.mjs`. The deleted
`scripts/watch_worklog.sh` was a legacy read-only terminal viewer, not part of the
MCP server, so it is intentionally not replaced.
