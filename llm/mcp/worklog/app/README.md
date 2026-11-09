# Worklog viewer

## Start the supported viewer

The supported runtime is Electron. From the repository root, install dependencies and build the renderer, then launch Electron:

```sh
npm install
npm --prefix app run build
npm --prefix app run electron
```

Electron starts a loopback HTTP server for the renderer, read-only MCP viewer API, and legacy worklog API, then opens the viewer window. The MCP endpoint is `POST /mcp`; it accepts MCP JSON-RPC initialization, initialized notifications, and the read-only viewer tools `worklog_session_status` and `worklog_read`. The legacy endpoints remain available at `GET /api/worklogs`, `GET /api/worklogs/<orchestration-id>`, `/revision`, and `/events`.

The standalone HTTP adapter uses a per-launch bearer token and binds only to `127.0.0.1`. The Electron composition root keeps MCP on the same loopback origin for the bundled renderer and does not expose mutation tools over HTTP. MCP clients must send both `application/json` and `text/event-stream` in `Accept` and must initialize before calling tools.

Do not open the renderer HTML from a static file server or expect a separate browser/Vite server to provide the API. Vite remains the renderer build tool; `npm --prefix app run build` produces the assets consumed by Electron.

## Troubleshooting “failed to fetch”

Start the app with the Electron command above. The bundled server binds to `127.0.0.1` and serves both the renderer and API. The viewer includes the HTTP status and API error in its message when the request reaches a server but fails.

## Development checks

```sh
npm run format:check
npm run lint
npm test
npm run build
```

## Styling

The viewer uses Tailwind CSS v4 through the official Vite integration (`tailwindcss` and `@tailwindcss/vite`). The CSS entrypoint imports Tailwind with `@import "tailwindcss";`; no Tailwind v3 configuration or PostCSS setup is used.

## Source links

Log messages keep their raw text and render `src:` values as links. HTTP and HTTPS values remain web links. POSIX, Windows, and UNC paths are normalized to canonical `file:` URLs. Relative paths resolve from the session working directory; `~/...` paths resolve from a macOS, Unix, or Windows user-home prefix derived from that directory. If no home context is available, the source stays visible but is not linked. Values that escape the working directory or use an unsafe scheme are not linked. Source parsing accepts semicolons, em dashes, literal `\\n`, and actual newlines as delimiters.

In Electron, opening a `file:` source link is handled by the main process: only local file URLs without a remote host are considered, the target must exist and be readable, and Electron opens it with the native file handler. The renderer denies the navigation instead of loading `file:` content. HTTP and HTTPS links still open externally; unsupported schemes and invalid or unavailable local files are denied. In a browser, the viewer can display the canonical target, but local-file opening remains subject to browser security settings.
