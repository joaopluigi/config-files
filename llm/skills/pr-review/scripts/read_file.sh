#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number> <path>" 3 "$@"
require_gh

REPO="$1"
PR="$2"
PATH_IN_REPO="$3"
HEAD_SHA="$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)"

gh api \
  -H "Accept: application/vnd.github.raw" \
  "repos/${REPO}/contents/${PATH_IN_REPO}?ref=${HEAD_SHA}"
