#!/bin/sh
#
# watch-worklog — follow a worklog and colorize it at view time.
#
# The worklog file stays plain text; color and the elapsed-time column are added
# only here, so re-reading or grepping the worklog is never polluted by escape
# codes. Ctrl-C to stop.
#
# Usage:
#   watch-worklog [path]
#
# With no path it looks at /tmp/worklog*.txt: none yet -> waits for one; exactly
# one -> follows it; several -> lists them by goal so you can pick.

case "$1" in
    -h|--help)
        echo "Usage: watch-worklog [path]   (default: pick among /tmp/worklog*.txt)"
        exit 0
        ;;
esac

# The goal line ("# worklog — <goal>") of a worklog, falling back to its name.
worklog_goal() {
    _g=$(sed -n 's/^# worklog — //p' "$1" 2>/dev/null | head -n1)
    [ -n "$_g" ] || _g=$(basename "$1")
    printf %s "$_g"
}

# A short "12s ago" / "3m ago" age for a file, best-effort across BSD/GNU stat.
file_age() {
    _m=$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null)
    [ -n "$_m" ] || return 0
    _d=$(( $(date +%s) - _m ))
    if   [ "$_d" -lt 60 ];   then printf '%ds ago' "$_d"
    elif [ "$_d" -lt 3600 ]; then printf '%dm ago' "$((_d / 60))"
    else                          printf '%dh ago' "$((_d / 3600))"
    fi
}

if [ -n "$1" ]; then
    FILE="$1"
    # Let the user start watching before the agent has created the file.
    until [ -f "$FILE" ]; do sleep 0.2; done
else
    # Wait until at least one worklog exists.
    until [ -n "$(ls /tmp/worklog*.txt 2>/dev/null)" ]; do sleep 0.2; done
    # Collect matches newest-first (POSIX sh has no arrays, so index into vars).
    n=0
    for f in $(ls -t /tmp/worklog*.txt 2>/dev/null); do
        n=$((n + 1)); eval "wl_$n=\$f"
    done
    if [ "$n" -eq 1 ]; then
        FILE="$wl_1"
    else
        echo "$n worklogs in /tmp:"
        echo
        j=1
        while [ "$j" -le "$n" ]; do
            eval "f=\$wl_$j"
            printf '  %d  %-44s (%s)\n' "$j" "$(worklog_goal "$f")" "$(file_age "$f")"
            j=$((j + 1))
        done
        echo
        printf 'which one? [1-%d]: ' "$n"
        read choice </dev/tty
        case "$choice" in
            ''|*[!0-9]*) echo "not a number: $choice"; exit 1 ;;
        esac
        eval "FILE=\${wl_$choice}"
        [ -n "$FILE" ] && [ -f "$FILE" ] || { echo "no such worklog: $choice"; exit 1; }
    fi
fi

# Wrap long entries to the terminal width so continuation lines stay under the
# entry column. Width is read once at startup; resize the window and restart to
# re-measure. Falls back to 100 columns when the size cannot be read.
WIDTH=$( { stty size </dev/tty | awk '{print $2}'; } 2>/dev/null )
[ -n "$WIDTH" ] || WIDTH=100

# Follow from the top so the Goal and Plan scroll past first, then stream the log.
# Entries carry the wall-clock time they happened (HH:MM:SS); this shows that time
# as-is, only adding color and column alignment.
tail -n +1 -f "$FILE" | awk -v maxw="$WIDTH" '
  BEGIN {
    if (maxw + 0 < 40) maxw = 100
    reset = "\033[0m"; dim = "\033[90m"
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
  /── log ──/ || /── follow-up/ {
    print
    print dim "time" pad(4) " " "item" pad(1) "tag" pad(6) "entry" reset
    next
  }
  /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9] / {
    ts = substr($0, 1, 8)
    rest = substr($0, 10); sub(/^ +/, "", rest)
    item = ""
    if (substr(rest, 1, 1) == "#") {
      sp = index(rest, " ")
      if (sp > 0) { item = substr(rest, 1, sp - 1); rest = substr(rest, sp + 1); sub(/^ +/, "", rest) }
    }
    sp = index(rest, " ")
    if (sp > 0) { tag = substr(rest, 1, sp - 1); text = substr(rest, sp + 1) }
    else        { tag = rest; text = "" }
    sub(/^ +/, "", text)
    if (tag in color) {
      indent = 9
      head = dim ts reset " "
      if (item != "") { ip = 5 - length(item); if (ip < 1) ip = 1; head = head dim item reset pad(ip); indent += 5 }
      tp = 9 - length(tag); if (tp < 1) tp = 1
      head = head color[tag] tag reset pad(tp)
      indent += 9
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
  { print; fflush() }
'
