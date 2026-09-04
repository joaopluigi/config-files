#!/bin/sh
#
# worklog — one tool for the worklog: create it, append to it, or check it.
#
# Ships inside this skill (scripts/worklog.sh); not on PATH. Run it by its full
# path — shown below as `worklog.sh` for brevity: `sh <skill>/scripts/worklog.sh …`.
#
#   worklog.sh new [--peer-reviews-disabled] [--peer-of <main-worklog>] "<goal>" "<what done looks like>" "<step>"...
#                              create a new worklog (records the invoking working directory in the header)
#   worklog.sh --worklog <path> [--actor <actor>] result [response-file]
#                                       publish the executor's expected result
#   worklog.sh --worklog <path> [--actor <actor>] <item> <tag> <text...>
#                                       append one actor-attributed entry
#   worklog.sh --worklog <path> followup "<one line>" ["<step>"...]
#                                       mark a segment in the selected worklog
#   worklog.sh --worklog <path> check   completion gate: strict lint of the whole file
#   worklog.sh path                     print the most recent worklog's path (discovery only)
#
# The worklog's location lives only in this script — `new` mints the path and
# prints it; operations on an existing log require an explicit --worklog <path>
# selector. WORKLOG=<path> is also accepted for callers that prefer an environment
# variable. Never fall back to the most recent worklog: concurrent agents can race.
#
# Append mode stamps the wall-clock time and actor, rejects an entry that can never be
# right — an unknown actor or tag, a non-numeric item, a `find` with no `src:`, or a
# second `done` on an item already closed — before writing it (the log is append-only,
# so a bad line is permanent). It then prints the running `Open items:` /
# `Open questions:` status, nudging you to close what you have finished. Nothing is
# written when it refuses; fix the entry and run it again. Three further guards are
# heuristics — likely-wrong, not always-wrong — so each can be overridden with a
# leading `--force`: closing an item while a lower-numbered one is still open; closing
# an item that has no reasoning recorded (no `think` or `decide`); and adding any
# non-`done` entry to an item already closed (usually a mis-numbered line, e.g. a
# stale item number reused after a follow-up). The always-wrong checks above have no
# such escape.
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
    f="${WORKLOG:-}"
    if [ -z "$f" ]; then
        echo "worklog: select a worklog explicitly with: worklog.sh --worklog <path> ..." >&2
        return 1
    fi
    if [ ! -f "$f" ]; then
        echo "worklog: no such worklog: $f" >&2
        return 1
    fi
    printf '%s\n' "$f"
}

result_file_for() {
    f=$1
    dir=${f%/*}
    name=${f##*/}
    id=${name%.txt}
    printf '%s/%s-result.txt\n' "$dir" "$id"
}

# scan <mode> <file>   mode: status (open items/questions only) | gate (strict lint)
scan() {
    awk -v mode="$1" '
      BEGIN {
        in_items = 0; in_header = 0; header_seen = 0
        maxN = 0; header_max = 0; hard = 0; peer_reviews = 0
        validtags = " think find decide done plan question answer note "
        validactors = " main explorer planner executor tester reviewer "
      }

      # Legacy headers opt into peer-review dependencies; new logs infer them from
      # their explicit review plan items.
      /^peer reviews:[[:space:]]+required[[:space:]]*$/ { peer_reviews = 1; next }
      /^initial review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
        initial_review_target = $0; sub(/^initial review item:[[:space:]]*/, "", initial_review_target); initial_review_target += 0; next
      }
      /^final review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
        final_review_target = $0; sub(/^final review item:[[:space:]]*/, "", final_review_target); final_review_target += 0; next
      }
      # Read the old singular header so existing worklogs remain checkable.
      /^review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
        initial_review_target = $0; sub(/^review item:[[:space:]]*/, "", initial_review_target); initial_review_target += 0; next
      }

      # Plan-items blocks: the first block is the initial plan; later blocks are
      # follow-ups. Review targets for new logs are inferred from the first plan
      # block explicit review items.
      /^plan items[[:space:]]*$/ {
        in_items = 1
        in_header = !header_seen
        header_seen = 1
        next
      }
      /^── log ──/               { in_items = 0; in_header = 0 }
      in_items && /^[[:space:]]+[0-9]+\./ {
        n = $0; sub(/^[[:space:]]+/, "", n); sub(/\..*$/, "", n); n += 0
        planned[n] = 1; if (n > maxN) maxN = n
        if (in_header) {
          if (n > header_max) header_max = n
          if ($0 ~ /worklog-peer review of the initial plan[[:space:]]*$/) inferred_initial = n
          if ($0 ~ /worklog-peer review of the executed work[[:space:]]*$/) inferred_final = n
        }
        next
      }

      # Log entries: HH:MM:SS #N actor tag text.
      /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
        rest = substr($0, 10)                       # drop the "HH:MM:SS " prefix
        item = rest; sub(/ .*$/, "", item); sub(/^#/, "", item); item += 0
        after = rest; sub(/^#[0-9]+ +/, "", after)
        first = after; sub(/ .*$/, "", first)
        actor = "executor"
        if (index(validactors, " " first " ") == 0) {
          nb++; bad_line[nb] = FNR; bad_text[nb] = $0; hard++
          next
        }
        actor = first
        sub(/^[^ ]+ +/, "", after)
        tag = after; sub(/ .*$/, "", tag)
        text = after; sub(/^[^ ]+ +/, "", text)
        if (index(validtags, " " tag " ") == 0) {
          nb++; bad_line[nb] = FNR; bad_text[nb] = $0; hard++
          next
        }
        seen[item] = 1; if (item > maxN) maxN = item

        if (tag == "plan") {
          planned[item] = 1
          if (text ~ /^peer-review-for:#/) {
            target = text; sub(/^peer-review-for:#/, "", target); sub(/ .*/, "", target)
            dynamic_review_item[item] = 1
            review_for[item] = target + 0; reviews[target + 0] = item
          }
        }
        if (tag == "done") { done[item] = 1; done_actor[item] = actor }
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

        if (!initial_review_target && inferred_initial) {
          initial_review_target = inferred_initial
          final_review_target = inferred_final
          peer_reviews = 1
        }
        if (peer_reviews) {
          if (initial_review_target && !done[initial_review_target]) {
            nr++; review_line[nr] = initial_review_target; hard++
          }
          if (final_review_target && !done[final_review_target]) {
            nr++; review_line[nr] = final_review_target; hard++
          }
          if (initial_review_target && done[initial_review_target] && q[initial_review_target] > a[initial_review_target]) {
            nq_review++; review_question_line[nq_review] = initial_review_target; hard++
          }
          if (final_review_target && done[final_review_target] && q[final_review_target] > a[final_review_target]) {
            nq_review++; review_question_line[nq_review] = final_review_target; hard++
          }
        }

        # Hard errors: only the gate lints them; append mode just shows status.
        if (mode == "gate") {
          for (k = 1; k <= nf; k++) { print "  x `find` without a source at line " find_line[k] ":"; print "      " find_text[k] }
          for (k = 1; k <= nb; k++) { print "  x unknown actor or tag at line " bad_line[k] ":"; print "      " bad_text[k] }
          for (k = 1; k <= no; k++)   print "  x entries reference item " off[k] ", not in the plan (add a `plan` line first)"
          for (k = 1; k <= nr; k++)   print "  x review item " review_line[k] " is not closed"
          for (k = 1; k <= nq_review; k++) print "  x review item " review_question_line[k] " has unanswered questions"
          if (hard > 0) print ""
        }

        oi = ""; for (i = 1; i <= maxN; i++) if (planned[i] && !done[i]) oi = oi (oi == "" ? "" : ", ") i
        oq = ""; for (i = 1; i <= maxN; i++) if (q[i] > a[i])           oq = oq (oq == "" ? "" : ", ") "#" i
        print "Open items:     " (oi == "" ? "none" : oi)
        print "Open questions: " (oq == "" ? "none" : oq)

        if (mode != "gate") {
          if (oi != "") print "  -> if any of items " oi " are now finished, close them: worklog.sh <item> done <what it produced> -- do not move on leaving a finished item open"
          if (oq != "") print "  -> once an open question is resolved, record it: worklog.sh <item> answer <the answer>"
          exit 0
        }
        if (hard > 0 || oi != "" || oq != "") {
          print ""; print "not done yet — clear the errors above, close the open items, answer the open questions"
          exit 1
        }
        print ""; print "ok  worklog clean: every item closed, every find sourced, every question answered"
        exit 0
      }
    ' "$2"
}

# An explicit worklog path is required for every operation that reads or writes an
# existing log. This prevents concurrent agents from selecting one another's files.
if [ "$1" = --worklog ]; then
    [ -n "$2" ] || {
        echo "usage: worklog.sh --worklog <path> [--actor <actor>] <item> <tag> <text...>" >&2
        exit 2
    }
    WORKLOG=$2
    shift 2
fi

actor=main
if [ "$1" = --actor ]; then
    [ -n "$2" ] || {
        echo "usage: worklog.sh --worklog <path> --actor <main|explorer|planner|executor|tester|reviewer> ..." >&2
        exit 2
    }
    actor=$2
    shift 2
fi
case "$actor" in
    main|explorer|planner|executor|tester|reviewer) : ;;
    *)
        echo "worklog: unknown actor: $actor (use main, explorer, planner, executor, tester, or reviewer)" >&2
        exit 2 ;;
esac

# --- new mode ---------------------------------------------------------------
if [ "$1" = new ]; then
    shift
    peer_reviews_disabled=0
    peer_of=""
    if [ "$1" = --peer-reviews-disabled ]; then
        peer_reviews_disabled=1
        shift
    fi
    if [ "$1" = --peer-of ]; then
        [ -n "$2" ] || {
            echo "usage: worklog.sh new [--peer-reviews-disabled] [--peer-of <main-worklog>] \"<goal>\" \"<what done looks like>\" \"<step>\"..." >&2
            exit 2
        }
        peer_of=$2
        shift 2
    fi
    if [ -n "$peer_of" ] && [ "$peer_reviews_disabled" -eq 0 ]; then
        echo "worklog: --peer-of requires --peer-reviews-disabled" >&2
        exit 2
    fi
    goal=$1
    done_desc=$2
    [ -n "$goal" ] && [ -n "$done_desc" ] || {
        echo "usage: worklog.sh new [--peer-reviews-disabled] [--peer-of <main-worklog>] \"<goal>\" \"<what done looks like>\" \"<step>\"..." >&2
        exit 2
    }
    shift 2
    [ "$#" -gt 0 ] || {
        echo "worklog: give at least one plan step after the goal" >&2
        exit 2
    }
    parent_id=""
    if [ -n "$peer_of" ]; then
        case "$peer_of" in
            */*) parent_file=$peer_of ;;
            *)   parent_file="$WL_DIR/$peer_of.txt" ;;
        esac
        [ -f "$parent_file" ] || {
            echo "worklog: peer parent does not exist: $parent_file" >&2
            exit 2
        }
        parent_name=${parent_file##*/}
        case "$parent_name" in
            ????????.txt) parent_id=${parent_name%.txt} ;;
            *)
                echo "worklog: peer parent must be a main worklog named <8-hex-id>.txt" >&2
                exit 2
                ;;
        esac
        case "$parent_id" in
            *[!0123456789abcdef]*)
                echo "worklog: peer parent must be a main worklog named <8-hex-id>.txt" >&2
                exit 2
                ;;
        esac
    fi
    mkdir -p "$WL_DIR"
    while :; do
        id=$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')
        [ "$id" != "$parent_id" ] || continue
        if [ -n "$parent_id" ]; then
            FILE="$WL_DIR/$parent_id-peer-$id.txt"
        else
            FILE="$WL_DIR/$id.txt"
        fi
        [ ! -e "$FILE" ] && break
    done
    if [ "$peer_reviews_disabled" -eq 0 ]; then
        RESULT_FILE=$(result_file_for "$FILE")
        : > "$RESULT_FILE"
    fi
    {
        printf '# worklog — %s\n\n' "$goal"
        printf 'working directory: %s\n\n' "$PWD"
        printf 'goal: %s\n\n' "$done_desc"
        if [ "$peer_reviews_disabled" -eq 0 ]; then
            printf 'result file: %s\n\n' "$RESULT_FILE"
        fi
        if [ "$peer_reviews_disabled" -eq 1 ]; then
            printf 'peer reviews: disabled\n\n'
        fi
        printf 'plan items\n'
        i=1
        for step in "$@"; do
            printf '  %d. %s\n' "$i" "$step"
            i=$((i + 1))
        done
        if [ "$peer_reviews_disabled" -eq 0 ]; then
            printf '  %d. worklog-peer review of the executed work\n' "$i"
        fi
        printf '\n── log ──\n'
    } > "$FILE"
    printf '%s\n' "$FILE"
    echo "worklog created — tell the user this path so they can follow along: $FILE" >&2
    if [ "$peer_reviews_disabled" -eq 0 ]; then
        echo "result file — publish the expected response here: $RESULT_FILE" >&2
    fi
    exit 0
fi

# --- result mode ------------------------------------------------------------
if [ "$1" = result ]; then
    FILE=$(resolve_file) || exit 2
    if [ "$actor" = reviewer ]; then
        echo "worklog: actor reviewer cannot publish the executor's result" >&2
        exit 2
    fi
    if grep -q '^peer reviews: disabled$' "$FILE"; then
        echo "worklog: result artifacts require peer review" >&2
        exit 2
    fi
    RESULT_FILE=$(result_file_for "$FILE")
    if [ -n "$2" ]; then
        [ "$2" != "$RESULT_FILE" ] || {
            echo "worklog: response source must not be the result artifact" >&2
            exit 2
        }
        cat "$2" > "$RESULT_FILE" || exit 1
    else
        cat > "$RESULT_FILE" || exit 1
    fi
    printf '%s\n' "$RESULT_FILE"
    exit 0
fi

# --- follow-up mode ---------------------------------------------------------
# Mark a new same-goal segment, optionally with its own plan steps. Steps join the
# existing plan with numbering continued from the highest item so far — never
# restarting at 1 — so every `#<item>` in the log stays unambiguous. The segment
# always ends with a `── log ──` divider so entries under it read as their own block.
if [ "$1" = followup ]; then
    shift
    line=$1
    [ -n "$line" ] || {
        echo "usage: worklog.sh followup \"<one line on what this request asks>\" [\"<step>\"...]" >&2
        exit 2
    }
    shift
    FILE=$(resolve_file) || exit 2
    # Next item number = one past the highest item, counting header plan items,
    # follow-up plan items, and any item referenced in the log (added via `plan`).
    next=$(awk '
      /^plan items[[:space:]]*$/ { inp = 1; next }
      /^── log ──/               { inp = 0 }
      inp && /^[[:space:]]+[0-9]+\./ { m = $0; sub(/^[[:space:]]+/, "", m); sub(/\..*$/, "", m); if (m + 0 > mx) mx = m + 0; next }
      /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / { r = substr($0, 10); it = r; sub(/ .*$/, "", it); sub(/^#/, "", it); if (it + 0 > mx) mx = it + 0 }
      END { print mx + 1 }
    ' "$FILE")
    {
        printf '\n── follow-up: %s ──\n' "$line"
        if [ "$#" -gt 0 ]; then
            printf 'plan items\n'
            i=$next
            for step in "$@"; do
                printf '  %d. %s\n' "$i" "$step"
                i=$((i + 1))
            done
        fi
        printf '\n── log ──\n'
    } >> "$FILE"
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
# A leading --force overrides the heuristic guards below (out-of-order close,
# no-reasoning close, and a non-done entry on a closed item); it never bypasses the
# always-wrong checks (unknown tag, non-numeric item, `find` without `src:`, a second
# `done`).
force=0
if [ "$1" = --force ]; then force=1; shift; fi

item=$1
tag=$2
[ -n "$item" ] && [ -n "$tag" ] || {
    echo "usage: worklog.sh --worklog <path> [--force] <item> <tag> <text...>   |   worklog.sh --worklog <path> check" >&2
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

reviewer_state=$(awk -v target="$item" '
  BEGIN {
    in_items = 0; in_header = 0; header_seen = 0
    initial = 0; final = 0; inferred_initial = 0; inferred_final = 0
    disabled = 0; questions = 0; answers = 0
  }
  /^peer reviews:[[:space:]]+disabled[[:space:]]*$/ { disabled = 1; next }
  /^initial review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
    r = $0; sub(/^initial review item:[[:space:]]*/, "", r); initial = r + 0; next
  }
  /^final review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
    r = $0; sub(/^final review item:[[:space:]]*/, "", r); final = r + 0; next
  }
  /^review item:[[:space:]]*[0-9]+[[:space:]]*$/ {
    r = $0; sub(/^review item:[[:space:]]*/, "", r); initial = r + 0; next
  }
  /^plan items[[:space:]]*$/ {
    in_items = 1; in_header = !header_seen; header_seen = 1; next
  }
  /^── log ──/ { in_items = 0; in_header = 0 }
  in_items && in_header && /^[[:space:]]+[0-9]+\./ {
    n = $0; sub(/^[[:space:]]+/, "", n); sub(/\..*$/, "", n); n += 0
    if ($0 ~ /worklog-peer review of the initial plan[[:space:]]*$/) inferred_initial = n
    if ($0 ~ /worklog-peer review of the executed work[[:space:]]*$/) inferred_final = n
    next
  }
  /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
    r = substr($0, 10); it = r; sub(/ .*$/, "", it); sub(/^#/, "", it); it += 0
    sub(/^#[0-9]+ +/, "", r)
    first = r; sub(/ .*$/, "", first)
    sub(/^[^ ]+ +/, "", r)
    tg = r; sub(/ .*$/, "", tg)
    if (it == target && tg == "question") questions++
    if (it == target && tg == "answer") answers++
  }
  END {
    if (!initial && inferred_initial) initial = inferred_initial
    if (!final && inferred_final) final = inferred_final
    if (disabled) print "disabled"
    else if (target != initial && target != final) print "not-review"
    else if (questions > answers) print "open-questions"
    else print "review"
  }
' "$FILE")

if [ "$tag" = done ] && [ "$force" -eq 0 ]; then
    case "$reviewer_state" in
      open-questions)
        echo "worklog: review item #$item still has unanswered questions" >&2
        exit 2 ;;
      review)
        ;;
      not-review|disabled)
        if [ "$actor" = reviewer ]; then
            echo "worklog: actor reviewer may close only a peer-review item" >&2
            exit 2
        fi
        ;;
    esac
fi

# An item is closed exactly once. Refuse a second `done` on an item already
# closed — don't re-close everything at the end; close only what is still open.
if [ "$tag" = done ]; then
    prev=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|explorer|planner|executor|tester|reviewer) done " "$FILE" | head -n1)
    if [ -n "$prev" ]; then
        when=${prev%% *}
        echo "worklog: item $item is already closed (done at $when) — an item is closed once, so nothing was written. Close only the items still shown as open." >&2
        exit 2
    fi
fi

# Once an item is closed, new reasoning belongs to an item still open — not to a
# finished one. A non-`done` entry on an already-closed item is almost always a
# mis-numbered line (e.g. after a follow-up, logging against a stale item number from
# an earlier segment). Refuse it and point at the open items; --force allows the rare
# legit case, like a late `note` on finished work.
if [ "$tag" != done ]; then
    closed=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|explorer|planner|executor|tester|reviewer) done " "$FILE" | head -n1)
    if [ -n "$closed" ] && [ "$force" -eq 0 ]; then
        when=${closed%% *}
        open=$(awk '
          /^plan items[[:space:]]*$/ { inp = 1; next }
          /^── log ──/               { inp = 0 }
          inp && /^[[:space:]]+[0-9]+\./ { m = $0; sub(/^[[:space:]]+/, "", m); sub(/\..*$/, "", m); planned[m + 0] = 1; if (m + 0 > mx) mx = m + 0; next }
          /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
            r = substr($0, 10); it = r; sub(/ .*$/, "", it); sub(/^#/, "", it); it += 0; if (it > mx) mx = it
            a = r; sub(/^#[0-9]+ +/, "", a)
            first = a; sub(/ .*$/, "", first)
            sub(/^[^ ]+ +/, "", a); tg = a; sub(/ .*$/, "", tg)
            if (tg == "plan") planned[it] = 1
            if (tg == "done") done[it]    = 1
          }
          END { out = ""; for (i = 1; i <= mx; i++) if (planned[i] && !done[i]) out = out (out == "" ? "" : ", ") i; print out }
        ' "$FILE")
        [ -n "$open" ] && hint=" The items still open are: $open." || hint=""
        echo "worklog: item $item is already closed (done at $when) — a \`$tag\` belongs to an item still open, not a finished one, so nothing was written. This is usually a mis-numbered line.${hint} Put it on the right open item, or, if it truly belongs on the closed item, repeat with: worklog.sh --force $item $tag <text>" >&2
        exit 2
    fi
fi

# Closing out of order is usually a sign an earlier item was left behind, so a
# `done` on item N while a lower-numbered item is still open is refused (non-zero,
# nothing written) — a note the agent might ignore is not enough. Plans aren't
# always linear, so it can be overridden deliberately with --force.
if [ "$tag" = done ]; then
    lower=$(awk -v n="$item" '
      /^plan items[[:space:]]*$/ { inp = 1; next }
      /^── log ──/               { inp = 0 }
      inp && /^[[:space:]]+[0-9]+\./ { m = $0; sub(/^[[:space:]]+/, "", m); sub(/\..*$/, "", m); planned[m + 0] = 1; next }
      /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
        r = substr($0, 10); it = r; sub(/ .*$/, "", it); sub(/^#/, "", it); it += 0
        a = r; sub(/^#[0-9]+ +/, "", a)
        sub(/^[^ ]+ +/, "", a); tg = a; sub(/ .*$/, "", tg)
        if (tg == "plan") planned[it] = 1
        if (tg == "done") done[it]    = 1
      }
      END { out = ""; for (i = 1; i < n; i++) if (planned[i] && !done[i]) out = out (out == "" ? "" : ", ") "#" i; print out }
    ' "$FILE")
    if [ -n "$lower" ] && [ "$force" -eq 0 ]; then
        echo "worklog: item $item closes before lower item(s) still open: $lower. Close those first; or if this out-of-order close is deliberate, repeat with: worklog.sh --force $item done <text>" >&2
        exit 2
    fi
fi

# Closing an item with no reasoning in the log — no `think`, and no `decide` (which
# carries its own why) — usually means the thinking never got written down: the log
# shows what was done but not why. Refuse the `done` so the reasoning is captured
# first; escapable with --force for a genuinely trivial item.
if [ "$tag" = done ] && [ "$actor" != reviewer ]; then
    reasoned=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|explorer|planner|executor|tester|reviewer) (think|decide) " "$FILE" | head -n1)
    if [ -z "$reasoned" ] && [ "$force" -eq 0 ]; then
        echo "worklog: item $item closes with no reasoning recorded — no \`think\` or \`decide\` entry for it. Record what you weighed first: worklog.sh $item think <what you weighed>. If the item is genuinely trivial, repeat with: worklog.sh --force $item done <text>" >&2
        exit 2
    fi
fi

printf '%s #%s %s %s %s\n' "$(date +%H:%M:%S)" "$item" "$actor" "$tag" "$text" >> "$FILE"
[ "$tag" = done ] && [ -n "$lower" ] && echo "note: closed #$item out of order (--force); lower item(s) still open: $lower"
scan status "$FILE"
