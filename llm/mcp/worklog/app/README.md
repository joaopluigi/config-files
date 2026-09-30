# Worklog viewer

## Start the supported viewer

From this directory, install dependencies and start Vite:

```sh
npm install
npm run viewer
```

Open <http://127.0.0.1:4173/>. The viewer and its read-only API are served by the same Vite process. The API endpoint is `GET /api/worklogs`; individual worklogs use `GET /api/worklogs/<orchestration-id>`.

The API is development-only Vite middleware. A static build does not include the API, so `npm run build` is a build check and does not produce a standalone API-backed viewer. Do not open the HTML from a static file server or another host and expect `/api/worklogs` to be available.

## Troubleshooting “failed to fetch”

Run `npm run viewer` from this `app` directory and use the exact loopback URL above. The API is bound to `127.0.0.1`, not a separate static preview server or an IPv6-only `localhost` address. The viewer now includes the HTTP status and API error in its message when the same-origin request reaches a server but fails.

## Development checks

```sh
npm run format:check
npm run lint
npm test
npm run build
```

## Styling

The viewer uses Tailwind CSS v4 through the official Vite integration (`tailwindcss` and `@tailwindcss/vite`). The CSS entrypoint imports Tailwind with `@import "tailwindcss";`; no Tailwind v3 configuration or PostCSS setup is used.
