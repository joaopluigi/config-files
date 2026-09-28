#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INSTALL="$ROOT/install.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

run_install() {
  HOME="$WORK/home" bash "$INSTALL" >/dev/null
}

mkdir -p "$WORK/home"

# An absent destination is linked as a whole directory.
run_install
[ -L "$WORK/home/.config/eca/mcp" ]
[ "$(readlink "$WORK/home/.config/eca/mcp")" = "$ROOT/llm/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]

# A real destination is merged without nesting. Repository-managed names may be
# replaced, while entries with different names survive.
rm "$WORK/home/.config/eca/mcp"
mkdir -p "$WORK/home/.config/eca/mcp/unrelated" "$WORK/home/.config/eca/mcp/worklog"
printf 'keep\n' > "$WORK/home/.config/eca/mcp/unrelated/keep.txt"
printf 'legacy\n' > "$WORK/home/.config/eca/mcp/worklog/server.mjs"
run_install
[ ! -e "$WORK/home/.config/eca/mcp/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]
[ "$(cat "$WORK/home/.config/eca/mcp/unrelated/keep.txt")" = keep ]
# Re-running the merge remains idempotent and preserves unrelated content.
run_install
[ ! -e "$WORK/home/.config/eca/mcp/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]
[ "$(cat "$WORK/home/.config/eca/mcp/unrelated/keep.txt")" = keep ]

# Managed legacy worklog directory and file are overwritten.
rm -rf "$WORK/home/.config/eca/mcp"
mkdir -p "$WORK/home/.config/eca/mcp"
printf 'legacy\n' > "$WORK/home/.config/eca/mcp/worklog"
run_install
[ -d "$WORK/home/.config/eca/mcp/worklog" ]
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]

rm -rf "$WORK/home/.config/eca/mcp"
mkdir -p "$WORK/home/.config/eca/mcp/worklog"
printf 'legacy\n' > "$WORK/home/.config/eca/mcp/worklog/server.mjs"
run_install
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]

# A legacy managed worklog symlink is overwritten.
rm -rf "$WORK/home/.config/eca/mcp"
mkdir -p "$WORK/home/.config/eca/mcp"
ln -s /tmp/legacy-worklog "$WORK/home/.config/eca/mcp/worklog"
run_install
[ -d "$WORK/home/.config/eca/mcp/worklog" ]
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]

# An existing correct symlink remains correct and rerunning is idempotent.
rm -rf "$WORK/home/.config/eca/mcp"
ln -s "$ROOT/llm/mcp" "$WORK/home/.config/eca/mcp"
run_install
[ -L "$WORK/home/.config/eca/mcp" ]
[ "$(readlink "$WORK/home/.config/eca/mcp")" = "$ROOT/llm/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]
run_install
[ -L "$WORK/home/.config/eca/mcp" ]
[ "$(readlink "$WORK/home/.config/eca/mcp")" = "$ROOT/llm/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]

# An empty real destination is merged successfully.
rm "$WORK/home/.config/eca/mcp"
mkdir -p "$WORK/home/.config/eca/mcp"
run_install
[ ! -e "$WORK/home/.config/eca/mcp/mcp" ]
[ -f "$WORK/home/.config/eca/mcp/worklog/server.mjs" ]
[ "$(readlink "$WORK/home/.config/eca/mcp/worklog/server.mjs")" = "$ROOT/llm/mcp/worklog/server.mjs" ]

echo "install MCP layout checks passed"
