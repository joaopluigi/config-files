#!/bin/sh
#
# gh_find — GitHub as a sourcing tool. Find prior art, real usage of an API, or a
# repo doing something similar, printed as ready-to-cite lines: each result comes
# with the URL you record as its `src:`.
#
# Ships inside the sourcing skill (scripts/gh_find.sh); not on PATH. Run it by its
# full path — shown here as `gh_find.sh` for brevity: `sh <skill>/scripts/gh_find.sh …`.
#
#   gh_find.sh code  <query...> [gh flags]   who does this / who uses this API
#   gh_find.sh repos <query...> [gh flags]   a whole repo doing something similar
#
# Extra `gh search` flags pass straight through, so you can narrow the search:
#   --language clojure   --repo owner/name   --owner org   --extension clj
#   --filename deps.edn  --limit 10          (code & repos both default to 30)
#
# Examples:
#   gh_find.sh code 'core.async pipeline' --language clojure --limit 5
#   gh_find.sh code 'toolCall approval' --repo eclipse-eca/eca
#   gh_find.sh repos 'mcp server' --language go
#
# A code hit's URL is pinned to a commit SHA, so it keeps pointing at the exact
# lines you read. Open it, confirm it really says what you think, then cite it —
# a search hit is a lead, not yet a verified source.
#
# Needs gh installed and authenticated (gh auth status) and jq. Exit: 0 ok (even
# with no matches), 2 usage error or a missing/unauthenticated tool.

set -eu

usage() {
    echo "usage: gh_find.sh code <query...> [gh flags]   |   gh_find.sh repos <query...> [gh flags]" >&2
    exit 2
}

command -v gh >/dev/null 2>&1 || { echo "gh_find: gh (GitHub CLI) not found — install it first" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "gh_find: jq not found — install it first" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "gh_find: gh is not authenticated — run: gh auth login" >&2; exit 2; }

mode=${1:-}
[ -n "$mode" ] || usage
shift
[ "$#" -gt 0 ] || usage

case "$mode" in
    code)
        out=$(gh search code "$@" --json repository,path,url \
            --jq '.[] | "\(.repository.nameWithOwner)  \(.path)\n  \(.url)"')
        ;;
    repos)
        out=$(gh search repos "$@" --json fullName,stargazersCount,description,url \
            --jq '.[] | "\(.fullName)  (\(.stargazersCount)★)\n  \(.description // "(no description)")\n  \(.url)"')
        ;;
    *)
        usage
        ;;
esac

if [ -z "$out" ]; then
    echo "gh_find: no matches — broaden the query or drop a filter, then try another avenue" >&2
    exit 0
fi

printf '%s\n' "$out"
echo "  -> open a hit, confirm it says what you think, then cite its URL as src:" >&2
