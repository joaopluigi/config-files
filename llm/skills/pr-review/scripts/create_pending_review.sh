#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number> <review-json>" 3 "$@"
require_gh

REPO="$1"
PR="$2"
INPUT="$3"
require_json_file "$INPUT"

if jq -e 'has("event")' "$INPUT" >/dev/null; then
  echo "pr-review: omit event to keep the review pending" >&2
  exit 2
fi

gh api \
  "repos/${REPO}/pulls/${PR}/reviews" \
  --method POST \
  --input "$INPUT"
