# Script template

Start with a one-shot Babashka script:

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
