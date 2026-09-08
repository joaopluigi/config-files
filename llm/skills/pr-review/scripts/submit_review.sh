#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number> <review-id> <COMMENT|APPROVE|REQUEST_CHANGES> <body> --confirm" 6 "$@"
require_gh

REPO="$1"
PR="$2"
REVIEW_ID="$3"
EVENT="$4"
BODY="$5"
CONFIRM="$6"

case "$EVENT" in
  COMMENT|APPROVE|REQUEST_CHANGES) ;;
  *)
    echo "Usage: $(basename "$0") <owner/repository> <pr-number> <review-id> <COMMENT|APPROVE|REQUEST_CHANGES> <body> --confirm" >&2
    exit 2
    ;;
esac

if [[ "$CONFIRM" != "--confirm" ]]; then
  echo "pr-review: pass --confirm only after the user explicitly approves submission" >&2
  exit 2
fi

gh api \
  "repos/${REPO}/pulls/${PR}/reviews/${REVIEW_ID}/events" \
  --method POST \
  --raw-field "event=${EVENT}" \
  --raw-field "body=${BODY}"
