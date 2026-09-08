#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number>" 2 "$@"
require_gh

REPO="$1"
PR="$2"

gh api --paginate "repos/${REPO}/issues/${PR}/comments?per_page=100"
echo "---INLINE REVIEW COMMENTS---"
gh api --paginate "repos/${REPO}/pulls/${PR}/comments?per_page=100"
echo "---REVIEWS---"
gh api --paginate "repos/${REPO}/pulls/${PR}/reviews?per_page=100"
