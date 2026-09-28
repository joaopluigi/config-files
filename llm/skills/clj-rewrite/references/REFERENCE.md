# Reference

Detailed rewrite-clj guidance:

- **Script template** — start with the one-shot Babashka template below.
- **Operations and nodes** — use zipper navigation, inspection, modification,
  and explicit whitespace/node constructors.
- **Patterns and hazards** — recognize forms before changing them; watch zipper
  traversal, inserted whitespace, and insertion scope.
- **Validation** — inspect matches, run the narrowest project check, then remove
  the temporary script.

## Script template

```clojure
#!/usr/bin/env bb
(require '[rewrite-clj.zip :as z] '[rewrite-clj.node :as n])
(def file-path "path/to/file.clj")
(defn target-form? [loc]
  (and (z/list? loc) (= 'some/function (some-> loc z/down z/sexpr))))
(defn transform [loc] loc)
(defn process [loc]
  (if (z/end? loc) loc
      (recur (z/next (if (target-form? loc) (transform loc) loc)))))
(let [result (process (z/of-file file-path))]
  (spit file-path (z/root-string result)))
```

## Operations and construction

Navigation: `z/of-file`, `z/of-string`, `z/down`, `z/right`, `z/up`, `z/next`,
and `z/end?`. Inspection: `z/list?`, `z/map?`, `z/tag`, `z/sexpr`, and
`z/string`. Modification: `z/append-child`, `z/insert-left`, `z/insert-right`,
`z/replace`, `z/edit`, and `z/remove`.

Construct nodes with `n/token-node`, `n/keyword-node`, `n/whitespace-node`,
`n/map-node`, `n/list-node`, or `(z/node (z/of-string "{:k v}"))`.

```clojure
(z/append-child loc (n/map-node [(n/keyword-node :k)
                                 (n/whitespace-node " ")
                                 (n/token-node 'value)]))
```

## Patterns, hazards, validation

Use a `rightmost` helper with repeated `z/right` when needed. A string scan can
check whether a map contains a key, but structural recognition is safer. Insert
spaces explicitly; rewrite-clj preserves existing layout but does not add spaces.
`z/insert-right` inserts within the current parent, so move to the top-level node
before top-level insertion. After a transform, `z/next` may visit inserted
matching nodes; skip past them when necessary.

Print matched forms before writing. Run `lein test`, `clj -X:test`, or the
smallest available parser/test check. Keep the script one-shot and delete it;
work in a recoverable Git state, noting that checkout recovery discards all
uncommitted edits in the target file.
