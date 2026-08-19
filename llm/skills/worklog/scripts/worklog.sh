#!/bin/sh
#
# worklog — one tool for the worklog: create it, append to it, or check it.
#
# Ships inside this skill (scripts/worklog.sh); not on PATH. Run it by its full
# path — shown below as `worklog.sh` for brevity: `sh <skill>/scripts/worklog.sh …`.
#
#   worklog.sh new "<goal>" "<what done looks like>" "<step>"...   create a new worklog
#   worklog.sh <item> <tag> <text...>   append one entry, then show what is open
#   worklog.sh followup "<one line>"    mark a new same-goal follow-up segment
#   worklog.sh check [path]             completion gate: strict lint of the whole file
#   worklog.sh path                     print the current worklog's path (empty if none)
#
# The worklog's location lives only in this script — every command resolves it the
# same way, so nothing else needs to know where worklogs are kept. `new` mints the
# path; the other commands find it automatically as the most recent worklog. When
# several agents run at once, point each at its own file with WORKLOG=<path> in
# front of the command.
#
# Append mode stamps the wall-clock time, rejects an entry that can never be
# right — an unknown tag, a non-numeric item, or a `find` with no `src:` — before
# writing it (the log is append-only, so a bad line is permanent), then prints the
# running `Open items:` / `Open questions:` status. Nothing is written when it
# refuses; fix the entry and run it again.
#
# Check mode re-scans the whole file — the header and anything carried over from a
# reopened worklog too, not just the entries that passed through append — and exits
# non-zero while any item is open, any question unanswered, or any `find` missing
# its `src:`. Run it before calling a task done.
#
# Exit status: 0 clean / appended / created, 1 the gate found a problem, 2 rejected
# (nothing written) or a usage error.

# Where worklogs live — the one place this is written down. Everything else, and
# the viewer, resolves the worklog through this directory.
WL_DIR=/tmp/worklogs

resolve_file() {
    f="${WORKLOG:-$(ls -t "$WL_DIR"/*.txt 2>/dev/null | head -n1)}"
    if [ -z "$f" ] || [ ! -f "$f" ]; then
        echo "worklog: no worklog yet — create one with: worklog.sh new \"<goal>\" \"<done looks like>\" \"<step>\"..." >&2
        return 1
    fi
    printf '%s\n' "$f"
}

# scan <mode> <file>   mode: status (open items/questions only) | gate (strict lint)
scan() {
    awk -v mode="$1" '
      BEGIN {
        in_items = 0; maxN = 0; hard = 0
        validtags = " think find decide done plan question answer note "
      }

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

        if (index(validtags, " " tag " ") == 0) {
          nb++; bad_line[nb] = FNR; bad_text[nb] = $0; hard++
          next
        }
        if (tag == "plan") planned[item] = 1
        if (tag == "done") done[item]    = 1
        if (tag == "question") q[item]++
        if (tag == "answer")   a[item]++
        if (tag == "find" && index($0, "src:") == 0) {
          nf++; find_line[nf] = FNR; find_text[nf] = $0; hard++
        }
        next
      }

      END {
        for (i = 1; i <= maxN; i++)
          if (seen[i] && !planned[i]) { no++; off[no] = i; hard++ }

        # Hard errors: only the gate lints them; append mode just shows status.
        if (mode == "gate") {
          for (k = 1; k <= nf; k++) { print "  x `find` without a source at line " find_line[k] ":"; print "      " find_text[k] }
          for (k = 1; k <= nb; k++) { print "  x unknown tag at line " bad_line[k] ":"; print "      " bad_text[k] }
          for (k = 1; k <= no; k++)   print "  x entries reference item " off[k] ", not in the plan (add a `plan` line first)"
          if (hard > 0) print ""
        }

        oi = ""; for (i = 1; i <= maxN; i++) if (planned[i] && !done[i]) oi = oi (oi == "" ? "" : ", ") i
        oq = ""; for (i = 1; i <= maxN; i++) if (q[i] > a[i])           oq = oq (oq == "" ? "" : ", ") "#" i
        print "Open items:     " (oi == "" ? "none" : oi)
        print "Open questions: " (oq == "" ? "none" : oq)

        if (mode != "gate") exit 0
        if (hard > 0 || oi != "" || oq != "") {
          print ""; print "not done yet — clear the errors above, close the open items, answer the open questions"
          exit 1
        }
        print ""; print "ok  worklog clean: every item closed, every find sourced, every question answered"
        exit 0
      }
    ' "$2"
}

# --- new mode ---------------------------------------------------------------
if [ "$1" = new ]; then
    shift
    goal=$1
    done_desc=$2
    [ -n "$goal" ] && [ -n "$done_desc" ] || {
        echo "usage: worklog.sh new \"<goal>\" \"<what done looks like>\" \"<step>\"..." >&2
        exit 2
    }
    shift 2
    [ "$#" -gt 0 ] || {
        echo "worklog: give at least one plan step after the goal" >&2
        exit 2
    }
    id=$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')
    mkdir -p "$WL_DIR"
    FILE="$WL_DIR/$id.txt"
    {
        printf '# worklog — %s\n\n' "$goal"
        printf 'goal: %s\n\n' "$done_desc"
        printf 'plan items\n'
        i=1
        for step in "$@"; do
            printf '  %d. %s\n' "$i" "$step"
            i=$((i + 1))
        done
        printf '\n── log ──\n'
    } > "$FILE"
    printf '%s\n' "$FILE"
    echo "worklog created — tell the user this path so they can follow along: $FILE" >&2
    exit 0
fi

# --- follow-up mode ---------------------------------------------------------
if [ "$1" = followup ]; then
    line=$2
    [ -n "$line" ] || {
        echo "usage: worklog.sh followup \"<one line on what this request asks>\"" >&2
        exit 2
    }
    FILE=$(resolve_file) || exit 2
    printf '\n── follow-up: %s ──\n' "$line" >> "$FILE"
    exit 0
fi

# --- path mode --------------------------------------------------------------
if [ "$1" = path ]; then
    f="${WORKLOG:-$(ls -t "$WL_DIR"/*.txt 2>/dev/null | head -n1)}"
    [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
    exit 0
fi

# --- check mode -------------------------------------------------------------
if [ "$1" = check ]; then
    FILE="$2"
    [ -n "$FILE" ] || FILE=$(resolve_file) || exit 2
    [ -f "$FILE" ] || { echo "worklog: no such worklog: $FILE" >&2; exit 2; }
    scan gate "$FILE"
    exit $?
fi

# --- append mode ------------------------------------------------------------
item=$1
tag=$2
[ -n "$item" ] && [ -n "$tag" ] || {
    echo "usage: worklog.sh <item> <tag> <text...>   |   worklog.sh check [path]" >&2
    exit 2
}
shift 2
text=$*

case "$item" in
    ''|*[!0-9]*)
        echo "worklog: item must be a plan-item number, got: $item" >&2
        exit 2 ;;
esac

case " think find decide done plan question answer note " in
    *" $tag "*) : ;;
    *)
        echo "worklog: unknown tag: $tag (use think find decide done plan question answer note)" >&2
        exit 2 ;;
esac

[ -n "$text" ] || {
    echo "worklog: entry text is empty" >&2
    exit 2
}

if [ "$tag" = find ] && ! printf '%s' "$text" | grep -q 'src:'; then
    echo "worklog: a \`find\` must cite its source — include \`src:\` (file:line, URL, or \"user said X\")" >&2
    exit 2
fi

FILE=$(resolve_file) || exit 2
printf '%s #%s %s %s\n' "$(date +%H:%M:%S)" "$item" "$tag" "$text" >> "$FILE"
scan status "$FILE"
