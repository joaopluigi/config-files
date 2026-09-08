#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <owner/repository> <pr-number>" 2 "$@"
require_gh

REPO="$1"
PR="$2"

OWNER="${REPO%%/*}"
NAME="${REPO#*/}"

read -r -d '' QUERY <<'GRAPHQL' || true
query($owner:String!, $name:String!, $number:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reviews(first:100, states:PENDING) {
        nodes {
          id
          databaseId
          author { login }
          state
        }
      }
      reviewThreads(first:100) {
        nodes {
          isResolved
          comments(first:100) {
            nodes {
              id
              author { login }
              path
              line
              originalLine
              body
              url
            }
          }
        }
      }
    }
  }
}
GRAPHQL

gh api graphql \
  -f query="$QUERY" \
  -F owner="$OWNER" \
  -F name="$NAME" \
  -F number="$PR"
