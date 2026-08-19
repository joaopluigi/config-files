#!/bin/sh
#
# check-worklog — lint a worklog for the drifts that are easy to miss by eye:
#   * a plan item that never got a `done` (left unclosed),
#   * a `find` with no source (`src:`),
#   * a `question` with no matching `answer`,
#   * an entry pointing at an item the plan never declared.
#
# Run it before treating a task as finished — it is the mechanical half of the
# "re-read the whole worklog and confirm nothing was left open" step.
#
# Usage:
#   check_worklog.sh [path]     # default: the newest /tmp/worklog*.txt
#
# Exit status: 0 if the worklog is clean, 1 if any problem is found (so it can
# gate "am I done?"), 2 on a usage error.

FILE="$1"
[ -n "$FILE" ] || FILE=$(ls -t /tmp/worklog*.txt 2>/dev/null | head -n1)
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "check-worklog: no worklog to check (pass a path, or create /tmp/worklog*.txt)" >&2
    exit 2
fi

awk '
  BEGIN { in_items = 0; maxN = 0 }

  # Header plan-items block: from the "plan items" line to the log divider. A
  # fresh header later in the session re-opens it, so added segments count too.
  /^plan items[[:space:]]*$/ { in_items = 1; next }
  /^── log ──/               { in_items = 0 }
  in_items && /^[[:space:]]+[0-9]+\./ {
    n = $0; sub(/^[[:space:]]+/, "", n); sub(/\..*$/, "", n); n += 0
    planned[n] = 1; if (n > maxN) maxN = n
    next
  }

  # Log entries: HH:MM:SS #N tag text
  /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
    rest = substr($0, 10)                       # drop the "HH:MM:SS " prefix
    item = rest; sub(/ .*$/, "", item); sub(/^#/, "", item); item += 0
    after = rest; sub(/^#[0-9]+ +/, "", after)
    tag = after; sub(/ .*$/, "", tag)

    seen[item] = 1; if (item > maxN) maxN = item
    if (tag == "plan") planned[item] = 1
    if (tag == "done") done[item]    = 1
    if (tag == "question") q[item]++
    if (tag == "answer")   a[item]++
    if (tag == "find" && index($0, "src:") == 0) {
      nf++; find_line[nf] = FNR; find_text[nf] = $0
    }
    next
  }

  END {
    problems = 0
    for (i = 1; i <= maxN; i++)
      if (planned[i] && !done[i]) {
        print "  x item " i " has no `done` — it was never closed"; problems++
      }
    for (i = 1; i <= maxN; i++)
      if (seen[i] && !planned[i]) {
        print "  x entries reference item " i ", but the plan never declares it (add a `plan` line)"; problems++
      }
    for (i = 1; i <= maxN; i++)
      if (q[i] > a[i]) {
        print "  x item " i " has " q[i] " question(s) but " a[i] " answer(s)"; problems++
      }
    for (k = 1; k <= nf; k++) {
      print "  x `find` without a source at line " find_line[k] ":"; problems++
      print "      " find_text[k]
    }

    if (problems == 0) {
      print "ok  worklog clean: every item closed, every find sourced, every question answered"
      exit 0
    }
    print ""
    print problems " problem(s) — fix these before calling the task done"
    exit 1
  }
' "$FILE"
