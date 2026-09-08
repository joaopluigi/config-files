#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <comment-node-id>" 1 "$@"
require_gh

COMMENT_ID="$1"

read -r -d '' QUERY <<'GRAPHQL' || true
mutation($id:ID!) {
  deletePullRequestReviewComment(input:{id:$id}) {
    clientMutationId
  }
}
GRAPHQL

gh api graphql \
  -f query="$QUERY" \
  -f id="$COMMENT_ID"
