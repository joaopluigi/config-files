# Operations and nodes

Navigation: `z/of-file`, `z/of-string`, `z/down`, `z/right`, `z/up`, `z/next`,
and `z/end?`.

Inspection: `z/list?`, `z/map?`, `z/tag`, `z/sexpr`, and `z/string`.

Modification: `z/append-child`, `z/insert-left`, `z/insert-right`, `z/replace`,
`z/edit`, and `z/remove`.

Construct nodes with `n/token-node`, `n/keyword-node`, `n/whitespace-node`,
`n/map-node`, `n/list-node`, or `(z/node (z/of-string "{:k v}"))`.

```clojure
(z/append-child loc (n/map-node [(n/keyword-node :k)
                                 (n/whitespace-node " ")
                                 (n/token-node 'value)]))
```
