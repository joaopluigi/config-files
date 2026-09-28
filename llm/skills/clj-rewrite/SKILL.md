---
name: clj-rewrite
description: "Bulk rewrite Clojure forms with babashka and rewrite-clj."
---

# Clojure rewriting

Use this skill when one structural edit must apply to many Clojure forms. Do not use text replacement for s-expressions.

## Procedure

1. Confirm the target files, form shape, exclusions, and expected result.
2. Write a temporary Babashka script using `rewrite-clj.zip`.
3. Parse with `z/of-file`, walk with `z/next`, recognize structure, and transform with zipper operations.
4. Print or inspect matches before writing. Preserve whitespace and add explicit whitespace nodes.
5. Write with `spit` and `z/root-string`.
6. Run the smallest project test or parser check.
7. Delete the one-shot script and report files, matches, checks, and gaps.

Useful operations: `z/down`, `z/right`, `z/up`, `z/list?`, `z/map?`, `z/tag`, `z/sexpr`, `z/append-child`, `z/insert-left`, `z/insert-right`, `z/replace`, `z/remove`.

## References

See [`references/REFERENCE.md`](references/REFERENCE.md) for the script template,
rewrite-clj operations, node construction, examples, hazards, and validation.

## Stop conditions

Stop before writing if the recognizer is ambiguous, the scope is unclear, or the validation cannot distinguish a correct rewrite. Stop after the requested forms and checks are complete.
