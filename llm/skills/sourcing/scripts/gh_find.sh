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
#   gh_find.sh prs   <query...> [gh flags]   pull requests that discuss something
#   gh_find.sh pr    <owner/repo> <number> [--include-bots]   read one PR's discussion
#
# For code/repos/prs, extra `gh search` flags pass straight through, so you can
# narrow the search:
#   --language clojure   --repo owner/name   --owner org   --extension clj
#   --author me          --commenter alice   --limit 10     (searches default to 30)
#
# `pr` reads one pull request's human discussion — its description, conversation
# comments, inline review comments, and non-empty review summaries — merged in
# time order, each with its author and a citeable permalink. Bot comments
# (dependabot, codecov, CI, anything whose account is a Bot or ends in `[bot]`)
# are dropped by default, since they are noise for sourcing; pass --include-bots
# to keep them. A human service account with no `[bot]` marker cannot be told from
# a person and will show — spot it by name.
#
# Examples:
#   gh_find.sh code 'core.async pipeline' --language clojure --limit 5
#   gh_find.sh code 'toolCall approval' --repo eclipse-eca/eca
#   gh_find.sh repos 'mcp server' --language go
#   gh_find.sh prs 'retry backoff' --owner my-org --state merged
#   gh_find.sh pr my-org/service 482
#
# A code hit's URL is pinned to a commit SHA, so it keeps pointing at the exact
# lines you read. Open it, confirm it really says what you think, then cite it —
# a search hit is a lead, not yet a verified source.
#
# Needs gh installed and authenticated (gh auth status) and jq. Exit: 0 ok (even
# with no matches), 2 usage error or a missing/unauthenticated tool.

set -eu

usage() {
    echo "usage: gh_find.sh code|repos|prs <query...> [gh flags]   |   gh_find.sh pr <owner/repo> <number> [--include-bots]" >&2
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
    prs)
        out=$(gh search prs "$@" --json repository,number,title,state,url \
            --jq '.[] | "\(.repository.nameWithOwner) #\(.number)  [\(.state)]  \(.title)\n  \(.url)"')
        ;;
    pr)
        repo=${1:-}
        num=${2:-}
        case "$repo" in
            */*) : ;;
            *)   echo "gh_find: pr needs <owner/repo> <number>, e.g. gh_find.sh pr my-org/service 482" >&2; exit 2 ;;
        esac
        case "$num" in
            ''|*[!0-9]*) echo "gh_find: pr needs a numeric <number>, e.g. gh_find.sh pr my-org/service 482" >&2; exit 2 ;;
        esac
        shift 2
        include_bots=false
        for a in "$@"; do
            [ "$a" = --include-bots ] && include_bots=true
        done
        raw=$(
            gh api "repos/$repo/pulls/$num" \
                --jq '{kind:"description", login:.user.login, type:.user.type, at:.created_at, body:.body, url:.html_url, path:null}'
            gh api --paginate "repos/$repo/issues/$num/comments" \
                --jq '.[] | {kind:"comment", login:.user.login, type:.user.type, at:.created_at, body:.body, url:.html_url, path:null}'
            gh api --paginate "repos/$repo/pulls/$num/comments" \
                --jq '.[] | {kind:"review-inline", login:.user.login, type:.user.type, at:.created_at, body:.body, url:.html_url, path:.path}'
            gh api --paginate "repos/$repo/pulls/$num/reviews" \
                --jq '.[] | select((.body // "") != "") | {kind:"review", login:.user.login, type:.user.type, at:.submitted_at, body:.body, url:.html_url, path:null}'
        )
        out=$(printf '%s\n' "$raw" | grep -v '^[[:space:]]*$' | jq -rs --argjson bots "$include_bots" '
            map(select($bots or ((.type != "Bot") and ((.login // "") | test("\\[bot\\]$") | not))))
            | sort_by(.at)
            | .[]
            | "\(.at[0:10])  @\(.login)  [\(.kind)\(if .path then " " + .path else "" end)]\n  \((.body // "") | gsub("\r"; "") | gsub("\n"; "\n  "))\n  \(.url)"')
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
