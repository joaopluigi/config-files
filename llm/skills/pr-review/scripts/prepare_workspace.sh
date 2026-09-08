#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number> [destination]" 2 "$@"
require_gh

REPO="$1"
PR="$2"
HEAD_SHA="$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)"
DESTINATION="${3:-$(mktemp -d -t pr-review.XXXXXX)}"

if [[ -e "$DESTINATION" ]] && [[ -n "$(find "$DESTINATION" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "pr-review: destination is not empty: $DESTINATION" >&2
  exit 2
fi

mkdir -p "$DESTINATION"
ARCHIVE="$(mktemp -t pr-review-archive.XXXXXX)"
trap 'rm -f "$ARCHIVE"' EXIT

gh api \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/tarball/${HEAD_SHA}" > "$ARCHIVE"
tar -xzf "$ARCHIVE" \
  --strip-components=1 \
  -C "$DESTINATION"

printf '%s\n' "$DESTINATION"
