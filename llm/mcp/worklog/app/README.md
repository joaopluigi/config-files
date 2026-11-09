# Worklog viewer

## Start the browser viewer

The supported runtime is a browser served by Vite. From this directory, install dependencies and start the development server:

```sh
npm install
npm run dev
```

The viewer uses the standalone HTTP MCP endpoint at `POST /mcp`. Start that server from the parent directory with `npm run start:http`; it prints `WORKLOG_MCP_ENDPOINT` and `WORKLOG_MCP_TOKEN` for the browser setup. Set `VITE_MCP_ENDPOINT` and `VITE_MCP_TOKEN` when the endpoint and token are not already provided by the browser origin:

```sh
VITE_MCP_ENDPOINT=http://127.0.0.1:<port>/mcp \\
VITE_MCP_TOKEN=<token> \\
npm run dev
```

The frontend is served separately by Vite. The viewer uses the read-only MCP tools `worklog_session_status` and `worklog_read`.

The standalone HTTP adapter uses a per-launch bearer token and binds only to `127.0.0.1`. MCP clients must send both `application/json` and `text/event-stream` in `Accept` and must initialize before calling tools. The local stdio server remains available for MCP clients that launch `server.mjs` directly.

Do not open the renderer HTML from a static file server. Use Vite for development or build the browser assets with `npm run build` and serve the output from a browser-compatible static host that can reach the HTTP MCP endpoint.

## Troubleshooting “failed to fetch”

Start the HTTP MCP server and make sure the browser can reach the configured `VITE_MCP_ENDPOINT`. The viewer includes the HTTP status and MCP error in its message when a request reaches a server but fails.

## Development checks

```sh
npm run format:check
npm run lint
npm test
npm run build
```

## Styling

The viewer uses Tailwind CSS v4 through the official Vite integration (`tailwindcss` and `@tailwindcss/vite`). The CSS entrypoint imports Tailwind with `@import "tailwindcss"`; no Tailwind v3 configuration or PostCSS setup is used.

## Source links

Log messages keep their raw text and render `src:` values as links. HTTP and HTTPS values remain web links. POSIX, Windows, and UNC paths are normalized to canonical `file:` URLs. Relative paths resolve from the session working directory; `~/...` paths resolve from a macOS, Unix, or Windows user-home prefix derived from that directory. If no home context is available, the source stays visible but is not linked. Values that escape the working directory or use an unsafe scheme are not linked. Source parsing accepts semicolons, em dashes, literal `\\n`, and actual newlines as delimiters.

In a browser, the viewer can display the canonical target, but local-file opening remains subject to browser security settings. HTTP and HTTPS links open in the browser; unsupported schemes and invalid or unavailable local files are denied.
