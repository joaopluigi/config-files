#!/usr/bin/env bash

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ECA="$HOME/.config/eca"
CLAUDE="$HOME/.claude"
LOCAL_BIN="$HOME/.local/bin"

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [personal|professional]\n' "$0" >&2
  exit 2
fi

PROFILE="${1:-personal}"
case "$PROFILE" in
  personal|professional) ;;
  *)
    printf 'Usage: %s [personal|professional]\n' "$0" >&2
    exit 2
    ;;
esac

link() {
  local target="$1" linkname="$2"
  mkdir -p "$(dirname "$linkname")"
  ln -sfn "$target" "$linkname"
  printf '  %s -> %s\n' "$linkname" "$target"
}

link_mcp_contents() {
  local source_dir="$1" destination_dir="$2" source_entry destination_entry

  mkdir -p "$destination_dir"
  for source_entry in "$source_dir"/*; do
    [ -e "$source_entry" ] || [ -L "$source_entry" ] || continue
    destination_entry="$destination_dir/$(basename "$source_entry")"

    if [ -d "$source_entry" ] && [ ! -L "$source_entry" ]; then
      if [ -e "$destination_entry" ] || [ -L "$destination_entry" ]; then
        if [ ! -d "$destination_entry" ] || [ -L "$destination_entry" ]; then
          rm -rf "$destination_entry"
        fi
      fi
      link_mcp_contents "$source_entry" "$destination_entry"
    else
      if [ -e "$destination_entry" ] || [ -L "$destination_entry" ]; then
        rm -rf "$destination_entry"
      fi
      ln -s "$source_entry" "$destination_entry"
    fi
  done
}

link_mcp() {
  local target="$1" linkname="$2"
  mkdir -p "$(dirname "$linkname")"
  if [ ! -e "$linkname" ] && [ ! -L "$linkname" ]; then
    ln -s "$target" "$linkname"
  elif [ -L "$linkname" ]; then
    ln -sfn "$target" "$linkname"
  elif [ -d "$linkname" ]; then
    link_mcp_contents "$target" "$linkname"
  else
    printf 'MCP conflict: %s is not a directory or symlink\n' "$linkname" >&2
    return 1
  fi
  printf '  %s -> %s\n' "$linkname" "$target"
}

echo "Linking config from: $REPO"

## ECA
link "$REPO/llm/eca/$PROFILE.json" "$CONFIG_ECA/config.json"
link "$REPO/llm/agents" "$CONFIG_ECA/agents"
link "$REPO/llm/rules" "$CONFIG_ECA/rules"
link "$REPO/llm/skills" "$CONFIG_ECA/skills"
link_mcp "$REPO/llm/mcp" "$CONFIG_ECA/mcp"

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
