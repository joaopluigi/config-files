#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number> [metadata|diff|checks]" 2 "$@"
require_gh

REPO="$1"
PR="$2"
MODE="${3:-metadata}"

case "$MODE" in
  metadata)
    gh pr view "$PR" --repo "$REPO" \
      --json title,body,author,baseRefName,headRefName,headRefOid,commits,files,reviews,comments
    ;;
  diff)
    gh pr diff "$PR" --repo "$REPO"
    ;;
  checks)
    gh pr checks "$PR" --repo "$REPO"
    ;;
  *)
    echo "Usage: $(basename "$0") <owner/repository> <pr-number> [metadata|diff|checks]" >&2
    exit 2
    ;;
esac
