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

Add a server entry to the MCP client's configuration. Use the server launch
command and arguments required by the local project; environment variables are
optional:

```json
{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["/absolute/path/to/server.mjs"],
      "env": {
        "WORKLOG_DIR": "/absolute/path/to/data"
      }
    }
  }
}
```

`command` is the executable, `args` are passed in order, and `env` supplies
optional process variables. If `WORKLOG_DIR` is omitted, the server uses its
default data location. Use absolute paths when the client does not guarantee a
working directory.

## Start the browser HTTP server

Start the standalone, read-only HTTP MCP server from this directory:

```sh
npm run start:http
```

The launcher prints a machine-readable `WORKLOG_MCP_ENDPOINT=http://127.0.0.1:<port>/mcp WORKLOG_MCP_TOKEN=<token>` line to stderr. Configure it with these environment variables:

- `WORKLOG_HTTP_HOST` (default `127.0.0.1`)
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
