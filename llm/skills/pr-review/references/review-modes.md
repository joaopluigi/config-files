# Review modes and output

Resolve the mode before acting:

- **Read-only:** inspect and return suggested comments; write nothing.
- **Pending:** create or update a review, but do not submit it.
- **Submit:** require explicit confirmation immediately before submission; the
  only events are `COMMENT`, `APPROVE`, and `REQUEST_CHANGES`.

Default to read-only. Never approve or request changes implicitly. Format every
code example in a proposed comment as a fenced Markdown block with a language
tag. Keep one concern per comment and report file, line, proposed text, sources,
commands, workspace setup/cleanup, and exact review status. If there are no
actionable findings, leave GitHub unchanged.
