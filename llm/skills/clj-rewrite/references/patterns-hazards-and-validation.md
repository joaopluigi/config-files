# Patterns, hazards, and validation

Use a `rightmost` helper with repeated `z/right` when needed. A string scan can
check whether a map contains a key, but structural recognition is safer.

Insert spaces explicitly; rewrite-clj preserves existing layout but does not add
spaces. `z/insert-right` inserts within the current parent, so move to the
top-level node before top-level insertion.

After a transform, `z/next` may visit inserted matching nodes; skip past them
when necessary.

Print matched forms before writing. Run `lein test`, `clj -X:test`, or the
smallest available parser/test check. Keep the script one-shot and delete it;
work in a recoverable Git state, noting that checkout recovery discards all
uncommitted edits in the target file.
