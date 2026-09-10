#!/bin/sh
#
# worklog — one tool for the worklog: create it, append to it, or check it.
#
# Ships inside this skill (scripts/worklog.sh); not on PATH. Run it by its full
# path — shown below as `worklog.sh` for brevity: `sh <skill>/scripts/worklog.sh …`.
#
#   worklog.sh new [--peer-of <main-worklog>] "<goal>" "<what done looks like>" "<step>"...
#                              create a new worklog (records the invoking working directory in the header)
#   worklog.sh --worklog <path> [--actor <actor>] <item> <tag> <text...>
#                                       append one actor-attributed entry
#   worklog.sh --worklog <path> followup "<one line>" ["<step>"...]
#                                       mark a segment in the selected worklog
#   worklog.sh --worklog <path> check   completion gate: strict lint of the whole file
#   worklog.sh path                     print the most recent main worklog's path
#
# New worklogs are grouped by run under /tmp/worklogs/<id>/. The main file is
# <id>-main.txt and peer files are <id>-peer-<actor>-<peer-id>.txt. Operations on
# an existing log require an explicit --worklog <path> selector. WORKLOG=<path> is
# also accepted for callers that prefer an environment variable. Never fall back
# to the most recent worklog for writes: concurrent agents can race.
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

is_main_file() {
    f=$1
    case "$f" in
        "$WL_DIR"/*/*-main.txt)
            dir=${f%/*}
            dir_id=${dir##*/}
            name=${f##*/}
            file_id=${name%-main.txt}
            case "$dir_id" in
                ????????) : ;;
                *) return 1 ;;
            esac
            case "$dir_id" in
                *[!0123456789abcdef]*) return 1 ;;
            esac
            [ "$dir_id" = "$file_id" ] || return 1
            return 0
            ;;
        "$WL_DIR"/????????.txt)
            name=${f##*/}
            id=${name%.txt}
            case "$id" in
                *[!0123456789abcdef]*|'') return 1 ;;
            esac
            return 0
            ;;
    esac
    return 1
}

# scan <mode> <file>   mode: status (open items/questions only) | gate (strict lint)
scan() {
    awk -v mode="$1" '
      BEGIN {
        in_items = 0; hard = 0
        maxN = 0
        validtags = " think find decide done plan question answer note "
        validactors = " main investigator ideator executor tester reviewer critic maintainer researcher "
      }

      # Plan-items blocks: the first block is the initial plan; later blocks are
      # follow-ups.
      /^plan items[[:space:]]*$/ {
        in_items = 1
        next
      }
      /^── log ──/               { in_items = 0 }
      in_items && /^[[:space:]]+[0-9]+\./ {
        n = $0; sub(/^[[:space:]]+/, "", n); sub(/\..*$/, "", n); n += 0
        planned[n] = 1; if (n > maxN) maxN = n
        next
      }

      # Log entries: HH:MM:SS #N actor tag text.
      /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #[0-9]+ / {
        rest = substr($0, 10)                       # drop the "HH:MM:SS " prefix
        item = rest; sub(/ .*$/, "", item); sub(/^#/, "", item); item += 0
        after = rest; sub(/^#[0-9]+ +/, "", after)
        first = after; sub(/ .*$/, "", first)
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

        if (tag == "plan") { planned[item] = 1 }
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

        # Hard errors: only the gate lints them; append mode just shows status.
        if (mode == "gate") {
          for (k = 1; k <= nf; k++) { print "  x `find` without a source at line " find_line[k] ":"; print "      " find_text[k] }
          for (k = 1; k <= nb; k++) { print "  x unknown actor or tag at line " bad_line[k] ":"; print "      " bad_text[k] }
          for (k = 1; k <= no; k++)   print "  x entries reference item " off[k] ", not in the plan (add a `plan` line first)"
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
actor_explicit=0
if [ "$1" = --actor ]; then
    [ -n "$2" ] || {
        echo "usage: worklog.sh --worklog <path> --actor <main|investigator|ideator|executor|tester|reviewer|critic|maintainer|researcher> ..." >&2
        exit 2
    }
    actor=$2
    actor_explicit=1
    shift 2
fi
case "$actor" in
    main|investigator|ideator|executor|tester|reviewer|critic|maintainer|researcher) : ;;
    *)
        echo "worklog: unknown actor: $actor (use main, investigator, ideator, executor, tester, reviewer, critic, maintainer, or researcher)" >&2
        exit 2 ;;
esac

# --- new mode ---------------------------------------------------------------
if [ "$1" = new ]; then
    shift
    peer_of=""
    if [ "$1" = --peer-of ]; then
        [ -n "$2" ] || {
            echo "usage: worklog.sh new [--peer-of <main-worklog>] \"<goal>\" \"<what done looks like>\" \"<step>\"..." >&2
            exit 2
        }
        peer_of=$2
        shift 2
    fi
    if [ -n "$peer_of" ] && { [ "$actor_explicit" -eq 0 ] || [ "$actor" = main ]; }; then
        echo "worklog: peer worklogs require an explicit non-main --actor" >&2
        exit 2
    fi
    goal=$1
    done_desc=$2
    [ -n "$goal" ] && [ -n "$done_desc" ] || {
        echo "usage: worklog.sh new [--peer-of <main-worklog>] \"<goal>\" \"<what done looks like>\" \"<step>\"..." >&2
        exit 2
    }
    shift 2
    [ "$#" -gt 0 ] || {
        echo "worklog: give at least one plan step after the goal" >&2
        exit 2
    }
    parent_id=""
    parent_dir=""
    if [ -n "$peer_of" ]; then
        case "$peer_of" in
            */*) parent_file=$peer_of ;;
            *)
                if [ -f "$WL_DIR/$peer_of/$peer_of-main.txt" ]; then
                    parent_file="$WL_DIR/$peer_of/$peer_of-main.txt"
                else
                    parent_file="$WL_DIR/$peer_of.txt"
                fi
                ;;
        esac
        [ -f "$parent_file" ] || {
            echo "worklog: peer parent does not exist: $parent_file" >&2
            exit 2
        }
        parent_name=${parent_file##*/}
        case "$parent_name" in
            ????????.txt)
                parent_id=${parent_name%.txt}
                parent_dir="$WL_DIR/$parent_id"
                ;;
            ????????-main.txt)
                parent_id=${parent_name%-main.txt}
                parent_dir=${parent_file%/*}
                ;;
            *)
                echo "worklog: peer parent must be a main worklog named <id>-main.txt or legacy <id>.txt" >&2
                exit 2
                ;;
        esac
        case "$parent_id" in
            ????????) : ;;
            *)
                echo "worklog: peer parent id must be exactly 8 hexadecimal characters" >&2
                exit 2
                ;;
        esac
        case "$parent_id" in
            *[!0123456789abcdef]*)
                echo "worklog: peer parent id must be exactly 8 hexadecimal characters" >&2
                exit 2
                ;;
        esac
    fi
    mkdir -p "$WL_DIR"
    while :; do
        id=$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')
        [ "$id" != "$parent_id" ] || continue
        if [ -n "$parent_id" ]; then
            mkdir -p "$parent_dir"
            FILE="$parent_dir/$parent_id-peer-$actor-$id.txt"
        else
            mkdir -p "$WL_DIR/$id"
            FILE="$WL_DIR/$id/$id-main.txt"
        fi
        [ ! -e "$FILE" ] && break
    done
    {
        printf '# worklog — %s\n\n' "$goal"
        printf 'working directory: %s\n\n' "$PWD"
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
    if [ -n "${WORKLOG:-}" ]; then
        if [ -f "$WORKLOG" ] && is_main_file "$WORKLOG"; then
            printf '%s\n' "$WORKLOG"
        fi
        exit 0
    fi
    for f in $(ls -t "$WL_DIR"/*/*-main.txt "$WL_DIR"/*.txt 2>/dev/null); do
        if is_main_file "$f"; then
            printf '%s\n' "$f"
            break
        fi
    done
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

# An item is closed exactly once. Refuse a second `done` on an item already
# closed — don't re-close everything at the end; close only what is still open.
if [ "$tag" = done ]; then
    prev=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|investigator|ideator|executor|tester|reviewer|critic|maintainer|researcher) done " "$FILE" | head -n1)
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
    closed=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|investigator|ideator|executor|tester|reviewer|critic|maintainer|researcher) done " "$FILE" | head -n1)
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
if [ "$tag" = done ]; then
    reasoned=$(grep -E "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] #$item (main|investigator|ideator|executor|tester|reviewer|critic|maintainer|researcher) (think|decide) " "$FILE" | head -n1)
    if [ -z "$reasoned" ] && [ "$force" -eq 0 ]; then
        echo "worklog: item $item closes with no reasoning recorded — no \`think\` or \`decide\` entry for it. Record what you weighed first: worklog.sh $item think <what you weighed>. If the item is genuinely trivial, repeat with: worklog.sh --force $item done <text>" >&2
        exit 2
    fi
fi

printf '%s #%s %s %s %s\n' "$(date +%H:%M:%S)" "$item" "$actor" "$tag" "$text" >> "$FILE"
[ "$tag" = done ] && [ -n "$lower" ] && echo "note: closed #$item out of order (--force); lower item(s) still open: $lower"
scan status "$FILE"
