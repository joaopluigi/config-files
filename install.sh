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

materialize_eca_config() {
  local baseline="$REPO/llm/eca/$PROFILE.json"
  mkdir -p "$CONFIG_ECA"
  python3 - "$baseline" "$PROFILE" "$CONFIG_ECA/config.json" "$REPO/llm/eca/professional.local.json" <<'PY'
import json, os, stat, sys, tempfile
baseline, profile, destination, overlay = sys.argv[1:]

def read_object(path):
    try:
        with open(path, encoding="utf-8") as handle:
            value = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid {os.path.basename(path)}: {exc}")
    if not isinstance(value, dict):
        raise SystemExit(f"invalid {os.path.basename(path)}: expected a JSON object")
    return value

config = read_object(baseline)
if profile == "professional" and os.path.lexists(overlay):
    local = read_object(overlay)
    if set(local) != {"mcpServers"} or not isinstance(local["mcpServers"], dict):
        raise SystemExit("invalid professional.local.json: only an mcpServers object is allowed")
    if not isinstance(config.get("mcpServers"), dict):
        raise SystemExit("invalid professional baseline: mcpServers must be an object")
    config = dict(config)
    config["mcpServers"] = dict(config["mcpServers"])
    config["mcpServers"].update(local["mcpServers"])

fd, temporary = tempfile.mkstemp(prefix="config.json.", dir=os.path.dirname(destination), text=True)
os.close(fd)
os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
try:
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")
    os.replace(temporary, destination)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

echo "Linking config from: $REPO"

## ECA
if [ "$PROFILE" = professional ]; then
  materialize_eca_config
else
  # Validate before changing any links, then preserve personal-profile behavior.
  materialize_eca_config
  link "$REPO/llm/eca/$PROFILE.json" "$CONFIG_ECA/config.json"
fi
link "$REPO/llm/agents" "$CONFIG_ECA/agents"
link "$REPO/llm/rules" "$CONFIG_ECA/rules"
link "$REPO/llm/skills" "$CONFIG_ECA/skills"

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
