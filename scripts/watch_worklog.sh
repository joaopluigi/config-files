#!/bin/sh
#
# watch-worklog — follow a worklog and colorize its entry tags at view time.
#
# The worklog file stays plain text; color is added only here, so re-reading or
# grepping the worklog is never polluted by escape codes. Ctrl-C to stop.
#
# Usage:
#   watch-worklog [path]        # default path: /tmp/worklog.txt

case "$1" in
    -h|--help)
        echo "Usage: watch-worklog [path]   (default: /tmp/worklog.txt)"
        exit 0
        ;;
esac

FILE="${1:-/tmp/worklog.txt}"

# Let the user start watching before the agent has created the file.
until [ -f "$FILE" ]; do sleep 0.2; done

# Wrap long entries to the terminal width so continuation lines stay under the
# entry column. Width is read once at startup; resize the window and restart to
# re-measure. Falls back to 100 columns when the size cannot be read.
WIDTH=$( { stty size </dev/tty | awk '{print $2}'; } 2>/dev/null )
[ -n "$WIDTH" ] || WIDTH=100

# Follow from the top so the Goal and Plan scroll past first, then stream the log.
tail -n +1 -f "$FILE" | awk -v maxw="$WIDTH" '
  BEGIN {
    if (maxw + 0 < 40) maxw = 100
    reset = "\033[0m"; dim = "\033[90m"
    color["think"]    = "\033[36m"   # cyan    — deliberation
    color["find"]     = "\033[34m"   # blue    — a fact learned
    color["decide"]   = "\033[35m"   # magenta — a choice
    color["done"]     = "\033[32m"   # green   — a step finished
    color["done+"]    = "\033[92m"   # bright green — an added step finished
    color["plan+"]    = "\033[33m"   # yellow  — a step discovered
    color["question"] = "\033[31m"   # red     — needs an answer
    color["answer"]   = "\033[31m"   # red     — the answer
    color["note"]     = "\033[90m"   # grey    — assumption / dead end
  }
  function pad(n,   s) { s = ""; while (length(s) < n) s = s " "; return s }
  /── log ──/ || /── follow-up/ {
    print
    print dim "time" pad(1) " " "item" pad(1) "tag" pad(6) "entry" reset
    next
  }
  /^[0-9][0-9]:[0-9][0-9] / {
    ts = substr($0, 1, 5)
    rest = substr($0, 7); sub(/^ +/, "", rest)
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
      indent = 6
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
