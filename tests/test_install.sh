#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REPO="$TMP/repo"
cp -R "$ROOT" "$REPO"
rm -rf "$REPO/.git" "$REPO/tests"
HOME="$TMP/home"; export HOME
mkdir -p "$HOME/.local/bin"

json_object() { python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f: assert isinstance(json.load(f), dict)
PY
}

HOME="$HOME" "$REPO/install.sh" professional >/dev/null
json_object "$HOME/.config/eca/config.json"
[ ! -L "$HOME/.config/eca/config.json" ]
python3 - "$REPO/llm/eca/professional.json" "$HOME/.config/eca/config.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f: baseline=json.load(f)
with open(sys.argv[2]) as f: actual=json.load(f)
assert actual == baseline
PY
cp "$REPO/llm/eca/professional.local.example.json" "$REPO/llm/eca/professional.local.json"
python3 - "$REPO/llm/eca/professional.local.json" <<'PY'
import json, sys
p=sys.argv[1]
with open(p,'w') as f: json.dump({'mcpServers': {'atlassian': {'command':'local'}, 'new': {'command':'new'}}}, f)
PY
HOME="$HOME" "$REPO/install.sh" professional >/dev/null
python3 - "$HOME/.config/eca/config.json" "$REPO/llm/eca/professional.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f: actual=json.load(f)
with open(sys.argv[2]) as f: base=json.load(f)
assert actual['mcpServers']['atlassian'] == {'command':'local'}
assert actual['mcpServers']['new'] == {'command':'new'}
for key in ('providers','defaultAgent','defaultModel','disabledTools','toolCall'):
    assert actual[key] == base[key]
PY
before="$(sha256sum "$HOME/.config/eca/config.json")"
printf '{bad' > "$REPO/llm/eca/professional.local.json"
if HOME="$HOME" "$REPO/install.sh" professional >/dev/null 2>&1; then exit 1; fi
after="$(sha256sum "$HOME/.config/eca/config.json")"; [ "$before" = "$after" ]
printf '{"providers":{}}' > "$REPO/llm/eca/professional.local.json"
if HOME="$HOME" "$REPO/install.sh" professional >/dev/null 2>&1; then exit 1; fi
after="$(sha256sum "$HOME/.config/eca/config.json")"; [ "$before" = "$after" ]
rm "$REPO/llm/eca/professional.local.json"
ln -s missing-professional-overlay.json "$REPO/llm/eca/professional.local.json"
if HOME="$HOME" "$REPO/install.sh" professional >/dev/null 2>&1; then exit 1; fi
after="$(sha256sum "$HOME/.config/eca/config.json")"; [ "$before" = "$after" ]
[ -f "$ROOT/llm/mcp/decision-support/worker.clj" ]
python3 -m json.tool "$ROOT/llm/eca/professional.json" >/dev/null
python3 -m json.tool "$ROOT/llm/eca/professional.local.example.json" >/dev/null
echo 'install tests passed'
