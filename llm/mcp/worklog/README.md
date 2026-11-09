# Local stdio MCP server

This directory contains a local MCP server that communicates over stdio.

## Install

From this directory, install the locked dependencies:

```sh
npm ci
```

## Test

Run the test suite from the repository root or with an npm prefix:

```sh
npm --prefix llm/mcp/worklog test
```

## Configure

Add a server entry to the MCP client's configuration. The ECA-managed
configuration launches `supervisor.mjs`, which keeps stdio MCP output clean
while also starting the local HTTP server and browser frontend:

```json
{
  "mcpServers": {
    "worklog": {
      "command": "node",
      "args": ["/absolute/path/to/llm/mcp/worklog/supervisor.mjs"],
      "env": {
        "WORKLOG_DIR": "/absolute/path/to/data",
        "WORKLOG_MCP_TOKEN": "a-local-token"
      }
    }
  }
}
```

`command` is the executable, `args` are passed in order, and `env` supplies
optional process variables. The supervisor uses fixed loopback host `127.0.0.1`,
shares `WORKLOG_DIR` and `WORKLOG_MCP_TOKEN` across its children, and reports
HTTP/Vite readiness on stderr. Use absolute paths when the client does not
guarantee a working directory.

## Start the browser HTTP server

Start the standalone, read-only HTTP MCP server from this directory:

```sh
npm run start:http
```

The launcher prints a machine-readable `WORKLOG_MCP_ENDPOINT=http://127.0.0.1:<port>/mcp WORKLOG_MCP_TOKEN=<token>` line to stderr. The HTTP server always binds to loopback at `127.0.0.1`; its host is fixed and is not user-configurable. Configure the remaining settings with these environment variables:

- `WORKLOG_HTTP_PORT` (default `0`, which selects an available port)
- `WORKLOG_MCP_TOKEN` (optional; a local token is generated when absent)
- `WORKLOG_DIR` (existing worklog data directory, default `/tmp/worklogs`)

The browser frontend is served separately by Vite. From `app/`, set the endpoint and token before starting Vite:

```sh
VITE_MCP_ENDPOINT=http://127.0.0.1:<port>/mcp \\
VITE_MCP_TOKEN=<token> \\
npm run dev
```

Do not restore Electron or REST/SSE transports.
