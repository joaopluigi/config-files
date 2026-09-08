#!/usr/bin/env bash
set -euo pipefail

require_gh() {
  command -v gh >/dev/null 2>&1 || {
    echo "pr-review: gh CLI is required" >&2
    exit 2
  }
  gh auth status >/dev/null 2>&1 || {
    echo "pr-review: gh is not authenticated; run: gh auth login" >&2
    exit 2
  }
}

require_args() {
  local usage="$1"
  local expected="$2"
  shift 2
  if (( $# < expected )); then
    echo "Usage: $usage" >&2
    exit 2
  fi
}

require_json_file() {
  local path="$1"
  [[ -f "$path" ]] || {
    echo "pr-review: JSON input does not exist: $path" >&2
    exit 2
  }
}
