#!/usr/bin/env bash

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ECA="$HOME/.config/eca"
CLAUDE="$HOME/.claude"
LOCAL_BIN="$HOME/.local/bin"

link() {
  local target="$1" linkname="$2"
  mkdir -p "$(dirname "$linkname")"
  ln -sfn "$target" "$linkname"
  printf '  %s -> %s\n' "$linkname" "$target"
}

echo "Linking config from: $REPO"

## ECA
link "$REPO/llm/eca/config.json" "$CONFIG_ECA/config.json"
link "$REPO/llm/rules"           "$CONFIG_ECA/rules"
link "$REPO/llm/skills"          "$CONFIG_ECA/skills"

## Claude
link "$REPO/llm/skills" "$CLAUDE/skills"

## Neovim
link "$REPO/nvim" "$HOME/.config/nvim"

## Scripts — one command per script in scripts/, named without the .sh suffix
## and with underscores turned into dashes (rewrite_text.sh -> rewrite-text).
if [ -d "$LOCAL_BIN" ]; then
  for script in "$REPO"/scripts/*.sh; do
    [ -e "$script" ] || continue
    name="$(basename "$script" .sh | tr '_' '-')"
    link "$script" "$LOCAL_BIN/$name"
  done
else
  printf '  skipped scripts: %s does not exist\n' "$LOCAL_BIN" >&2
fi

echo "Done."
