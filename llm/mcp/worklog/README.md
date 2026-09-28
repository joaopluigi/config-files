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
