#!/bin/sh
#
# rewrite-text — rewrite text to be simple, direct, and objective.
#
# Thin launcher: this script only does shell plumbing (gather input, handle the
# -l flag) and delegates the actual rewrite rules to the `rewrite-text` skill,
# which it invokes through a headless `claude` call.
#
# Usage:
#   rewrite-text [-l lang] [text...]
#   rewrite-text [-l lang] < file.txt
#   pbpaste | rewrite-text [-l lang]

TARGET_LANG=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        -l|--lang)
            TARGET_LANG="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: rewrite-text [-l lang] [text...]"
            echo "       rewrite-text [-l lang] < file.txt"
            echo "       pbpaste | rewrite-text [-l lang]"
            exit 0
            ;;
        *)
            break
            ;;
    esac
done

if [ "$#" -gt 0 ]; then
    TEXT="$*"
elif [ ! -t 0 ]; then
    TEXT="$(cat)"
else
    echo "rewrite-text: no input (provide text as args or via stdin)" >&2
    exit 1
fi

if [ -n "$TARGET_LANG" ]; then
    LANG_NOTE=" Target language: $TARGET_LANG."
else
    LANG_NOTE=""
fi

PROMPT="/rewrite-text Rewrite the text inside the <text> tags below.${LANG_NOTE}

<text>
${TEXT}
</text>"

claude --print --no-session-persistence "$PROMPT"
