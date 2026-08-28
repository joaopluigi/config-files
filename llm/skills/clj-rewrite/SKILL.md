---
name: clj-rewrite
description: "Bulk rewriting of Clojure source files using babashka and rewrite-clj. Load this skill when you need to make the same structural change across many call sites in Clojure files."
---

# Clojure Source Rewriting with Babashka + rewrite-clj

## When to Use This

You need to make the same kind of change across many call sites in
Clojure source files. Examples:
- Add an argument to every call to a function
- Wrap calls in a new form
- Rename and restructure function invocations
- Inject options into existing option maps

**Do NOT reach for text-based find-and-replace** (`all_occurrences`,
sed patterns, or manual repetitive edits). These are fragile with
s-expressions — they break on nested parens, varying whitespace,
and context-dependent matches.

## The Tool

Babashka (`bb`) ships with rewrite-clj built in. Write a bb script
that:

1. Parses the file into a zipper with `z/of-file`
2. Walks the zipper with `z/next` / `z/end?`
3. Recognizes the forms to transform (pattern matching on structure)
4. Transforms them using zipper operations
5. Writes back with `spit` + `z/root-string`

## Script Template

```clojure
#!/usr/bin/env bb

(require '[rewrite-clj.zip :as z]
         '[rewrite-clj.node :as n]
         '[clojure.string :as str])

(def file-path "path/to/file.clj")

(defn target-form?
  "Recognize the forms you want to transform."
  [zloc]
  (when (z/list? zloc)
    (when-let [fc (z/down zloc)]
      (when (= :token (z/tag fc))
        (= (z/sexpr fc) 'some/function)))))

(defn transform
  "Transform a recognized form. Returns the modified zipper
  positioned at the same (now modified) node."
  [zloc]
  ;; Your transformation here
  zloc)

(defn process [zloc]
  (loop [loc zloc]
    (if (z/end? loc)
      loc
      (recur (z/next (if (target-form? loc)
                       (transform loc)
                       loc))))))

(let [zloc (z/of-file file-path)
      result (process zloc)]
  (spit file-path (z/root-string result))
  (println "Done"))
```

## Key rewrite-clj Operations

### Navigation
- `(z/of-file "path")` — parse file into zipper
- `(z/of-string "(+ 1 2)")` — parse string into zipper
- `(z/down zloc)` — first child
- `(z/right zloc)` — next sibling
- `(z/up zloc)` — parent
- `(z/next zloc)` — depth-first next (for walking)
- `(z/end? zloc)` — end of traversal?

### Inspection
- `(z/list? zloc)` — is this a list `(...)`?
- `(z/map? zloc)` — is this a map `{...}`?
- `(z/tag zloc)` — node type (`:token`, `:list`, `:map`, etc.)
- `(z/sexpr zloc)` — read the node as a Clojure value
- `(z/string zloc)` — the node as a string (preserving formatting)

### Modification
- `(z/append-child zloc node)` — add a child at the end of a collection
- `(z/insert-left zloc node)` — insert before current position
- `(z/insert-right zloc node)` — insert after current position
- `(z/replace zloc node)` — replace current node
- `(z/edit zloc f & args)` — apply f to the sexpr and replace
- `(z/remove zloc)` — remove current node

### Node Construction
- `(n/token-node 'symbol-name)` — symbol node
- `(n/token-node (symbol "*dynamic*"))` — symbol with special chars
- `(n/keyword-node :key)` — keyword node
- `(n/whitespace-node " ")` — whitespace
- `(n/map-node [child-nodes])` — map literal
- `(n/list-node [child-nodes])` — list literal
- `(z/node (z/of-string "{:key val}"))` — parse a string into a node

### Output
- `(z/root-string zloc)` — render the entire file back to a string

## Common Patterns

### Navigate to the rightmost child
```clojure
(defn rightmost [zloc]
  (if-let [r (z/right zloc)]
    (recur r)
    zloc))
```

### Check if a map contains a key (string scan)
```clojure
(defn has-key? [map-zloc k]
  (str/includes? (z/string map-zloc) (str k)))
```

### Add a key-value pair to the beginning of a map
```clojure
(-> map-zloc
    z/down                                ;; first key in the map
    (z/insert-left (n/keyword-node :k))   ;; insert new key before it
    (z/insert-left (n/token-node 'val))   ;; insert new value
    z/up)                                 ;; back to map node
```

### Append a map argument to a function call
```clojure
(z/append-child list-zloc
  (n/map-node [(n/keyword-node :k)
               (n/whitespace-node " ")
               (n/token-node 'val)]))
```

## Workflow

1. Write the bb script in the project directory
2. Run it: `bb script-name.bb`
3. Verify the result: `lein test` or `clj -X:test`
4. Delete the script — it's a one-shot tool

## Hazards

- **Always start from a clean git state.** If the script does
  something wrong, `git checkout -- file.clj` recovers instantly.
  But beware: `git checkout` also reverts any uncommitted work
  in the file, not just the script's changes.
- **Test the recognizer first.** Print matched forms before
  transforming to verify you're targeting the right call sites.
- **Watch navigation after transforms.** After modifying a node,
  the zipper is positioned at the modified node. `z/next` continues
  the walk from there. If your transform inserts new nodes that
  themselves match `target-form?`, you may transform them too —
  use `z/next` to skip past the modified form.
- **Whitespace is preserved.** rewrite-clj keeps the original
  formatting. Inserted nodes need explicit whitespace nodes
  between them — they don't get spaces automatically.
- **`insert-right` nests inside parent.** `z/insert-right`
  inserts a sibling of the current node *within its parent
  form*. If you're positioned inside a `defn` and call
  `insert-right`, the new node becomes part of that `defn`,
  not a top-level form. For top-level insertion, navigate to
  a top-level node first (e.g., `(-> zloc z/up)` until at
  root's child), or use the hybrid approach: find positions
  with rewrite-clj, splice with string operations.
```