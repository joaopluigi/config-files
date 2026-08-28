#!/bin/sh
#
# watch-worklog — follow the active worklog and colorize it at view time.
#
# The worklog file stays plain text; color and column alignment are added only
# here, so re-reading or grepping the worklog is never polluted by escape codes.
# Ctrl-C to stop.
#
# Usage:
#   watch-worklog            follow the active worklog, and auto-switch to a new
#                            one the moment the agent starts a fresh worklog
#   watch-worklog [path]     pin one file and follow only it
#
# With no path it watches the worklog directory: it tails whichever worklog is
# most recently written, and when a newer one appears — a new piece of work — it
# switches to that one on its own, so you start it once and never touch it again.

# Where worklogs live — keep in sync with the worklog tool (worklog skill's
# scripts/worklog.sh).
WL_DIR=/tmp/worklogs

case "$1" in
    -h|--help)
        echo "Usage: watch-worklog [path]   (no path: follow the active worklog, auto-switching)"
        exit 0
        ;;
esac

# The goal line ("# worklog — <goal>") of a worklog, falling back to its name.
worklog_goal() {
    _g=$(sed -n 's/^# worklog — //p' "$1" 2>/dev/null | head -n1)
    [ -n "$_g" ] || _g=$(basename "$1")
    printf %s "$_g"
}

# Read the whole stream on stdin and render it: color per tag, align the columns,
# wrap long entries under the entry column. Everything else passes through as-is,
# including the "── switching ──" banners the follower prints between worklogs.
colorize() {
    WIDTH=$( { stty size </dev/tty | awk '{print $2}'; } 2>/dev/null )
    [ -n "$WIDTH" ] || WIDTH=100
    awk -v maxw="$WIDTH" '
      BEGIN {
        if (maxw + 0 < 40) maxw = 100
        reset = "\033[0m"; dim = "\033[90m"; bold = "\033[1m"
        color["think"]    = "\033[36m"   # cyan    — deliberation
        color["find"]     = "\033[34m"   # blue    — a fact learned
        color["decide"]   = "\033[35m"   # magenta — a choice
        color["done"]     = "\033[32m"   # green   — a step finished
        color["plan"]     = "\033[33m"   # yellow  — a step added to the plan
        color["question"] = "\033[31m"   # red     — needs an answer
        color["answer"]   = "\033[31m"   # red     — the answer
        color["note"]     = "\033[90m"   # grey    — assumption / dead end
      }
      function pad(n,   s) { s = ""; while (length(s) < n) s = s " "; return s }
      # The log divider prints the column header. A follow-up banner does not — it is
      # always followed by its own `── log ──` (with an optional plan block between),
      # which prints the header, so the banner just passes through bold below.
      /── log ──/ {
        print
        print dim "time" pad(4) " " "item" pad(1) "actor" pad(4) "tag" pad(6) "entry" reset
        fflush(); next
      }
      /^── follow-up/ { print bold $0 reset; fflush(); next }
      /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] / {
        ts = substr($0, 1, 8)
        rest = substr($0, 10); sub(/^ +/, "", rest)
        item = ""
        if (substr(rest, 1, 1) == "#") {
          sp = index(rest, " ")
          if (sp > 0) { item = substr(rest, 1, sp - 1); rest = substr(rest, sp + 1); sub(/^ +/, "", rest) }
        }
        actor = "executor"
        sp = index(rest, " ")
        if (sp > 0) { first = substr(rest, 1, sp - 1); rest = substr(rest, sp + 1); sub(/^ +/, "", rest) }
        else        { first = rest; rest = "" }
        if (first == "executor" || first == "reviewer") {
          actor = first
          sp = index(rest, " ")
          if (sp > 0) { tag = substr(rest, 1, sp - 1); text = substr(rest, sp + 1) }
          else        { tag = rest; text = "" }
        } else {
          tag = first; text = rest
        }
        sub(/^ +/, "", text)
        if (tag in color) {
          indent = 9
          head = dim ts reset " "
          if (item != "") { ip = 5 - length(item); if (ip < 1) ip = 1; head = head dim item reset pad(ip); indent += 5 }
          ap = 9 - length(actor); if (ap < 1) ap = 1
          head = head dim actor reset pad(ap)
          tp = 9 - length(tag); if (tp < 1) tp = 1
          head = head color[tag] tag reset pad(tp)
          indent += 18
          # Wrap long text to the window; continuation lines hang under the entry column.
          wrapw = maxw - indent; if (wrapw < 24) wrapw = 24
          nw = split(text, words, " ")
          line = ""; firstline = 1
          for (i = 1; i <= nw; i++) {
            cand = (line == "" ? words[i] : line " " words[i])
            if (line != "" && length(cand) > wrapw) {
              print (firstline ? head : pad(indent)) line; firstline = 0
              line = words[i]
            } else {
              line = cand
            }
          }
          print (firstline ? head : pad(indent)) line
          fflush(); next
        }
      }
      # Header: bold title, a bold "goal:" label, and plan-item numbers in the same
      # yellow as the `plan` tag so the plan reads as one thing top to bottom.
      /^# worklog — / { print bold $0 reset; fflush(); next }
      /^goal:/        { print bold "goal:" reset substr($0, 6); fflush(); next }
      /^[[:space:]]+[0-9]+\. / {
        match($0, /^[[:space:]]+/); ind = substr($0, 1, RLENGTH); r = substr($0, RLENGTH + 1)
        dot = index(r, "."); num = substr(r, 1, dot - 1); after = substr(r, dot)
        print ind color["plan"] num reset after
        fflush(); next
      }
      { print; fflush() }
    '
}

# --- pinned mode: one explicit file, no switching ---------------------------
if [ -n "$1" ]; then
    FILE="$1"
    until [ -f "$FILE" ]; do sleep 0.2; done   # let the user start before the file exists
    tail -n +1 -f "$FILE" | colorize
    exit 0
fi

# --- follow mode: track the active worklog, auto-switching ------------------
# Tail the newest worklog from the top; when a different one becomes newest — the
# agent started or reopened another worklog — stop and pick that one up instead.
follow_dir() {
    trap 'kill "$tpid" 2>/dev/null; exit 0' INT TERM
    until [ -n "$(ls "$WL_DIR"/*.txt 2>/dev/null)" ]; do sleep 0.3; done
    active=""
    while :; do
        newest=$(ls -t "$WL_DIR"/*.txt 2>/dev/null | head -n1)
        [ -n "$newest" ] || { sleep 0.3; continue; }
        active="$newest"
        printf '\n── following: %s ──\n' "$(worklog_goal "$active")"
        tail -n +1 -f "$active" &
        tpid=$!
        while kill -0 "$tpid" 2>/dev/null; do
            cur=$(ls -t "$WL_DIR"/*.txt 2>/dev/null | head -n1)
            [ -n "$cur" ] && [ "$cur" != "$active" ] && { kill "$tpid" 2>/dev/null; break; }
            sleep 0.5
        done
        wait "$tpid" 2>/dev/null
    done
}

follow_dir | colorize
