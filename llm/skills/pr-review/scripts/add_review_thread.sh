#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

require_args "$(basename "$0") <review-thread-json>" 1 "$@"
require_gh

INPUT="$1"
require_json_file "$INPUT"

gh api graphql --input "$INPUT"
