(ns decision-support.worker
  (:require [clojure.core.logic :as l]
            [clojure.data.json :as json]))

(def max-cartesian 10000)
(def max-options 1000)

(defn expr-value [expr assignment]
  (if (contains? expr "var")
    (get assignment (get expr "var"))
    (get expr "const")))

(defn constraint-ok? [constraint assignment]
  (let [left (expr-value (get constraint "left") assignment)
        right (expr-value (get constraint "right") assignment)]
    (case (get constraint "op")
      "eq" (= left right)
      "neq" (not= left right)
      "gte" (>= left right)
      "lte" (<= left right)
      "gt" (> left right)
      "lt" (< left right)
      false)))

(defn feasible? [model assignment]
  (every? #(constraint-ok? % assignment) (get model "constraints" [])))

(defn cartesian-size [model]
  (reduce (fn [total variable]
            (let [next-total (* total (count (get variable "domain")))]
              (if (> next-total max-cartesian) (reduced next-total) next-total)))
          1
          (get model "variables")))

(defn assignments [model]
  (let [variables (get model "variables")
        qvars (mapv (fn [_] (l/lvar)) variables)
        goals (map (fn [[variable q]] (l/membero q (get variable "domain")))
                   (map vector variables qvars))
        rows (l/run* [q]
               (l/and* (conj (vec goals) (l/== q qvars))))]
    (->> rows
         (map (fn [values] (zipmap (map #(get % "name") variables) values)))
         (filter #(feasible? model %))
         vec)))

(defn objective-value [objective assignment]
  (expr-value (get objective "expr") assignment))

(defn dominates? [model a b]
  (let [objectives (get model "objectives" [])
        comparisons (map (fn [objective]
                           (let [av (objective-value objective a)
                                 bv (objective-value objective b)]
                             (case (get objective "direction")
                               "maximize" (compare av bv)
                               "minimize" (compare bv av)
                               0)))
                         objectives)]
    (and (some pos? comparisons)
         (every? #(not (neg? %)) comparisons))))

(defn frontier [model options]
  (vec (filter (fn [candidate]
                (not-any? #(and (not= % candidate) (dominates? model % candidate)) options)) options)))

(defn option-errors [model options]
  (let [domains (into {} (map (fn [variable] [(get variable "name") (set (get variable "domain"))])
                              (get model "variables")))]
    (vec (mapcat (fn [[index option]]
                   (if-not (map? option)
                     [{"option_index" index "code" "invalid_option" "message" "option must be an object"}]
                     (concat
                      (for [field (keys option) :when (not (contains? domains field))]
                        {"option_index" index "field" field "code" "unknown_field" "message" (str "unknown option field " field)})
                      (for [[field value] option :when (and (contains? domains field)
                                                             (not (contains? (get domains field) value)))]
                        {"option_index" index "field" field "code" "out_of_domain" "message" (str "option value for " field " is outside its domain")})
                      (for [field (keys domains) :when (not (contains? option field))]
                        {"option_index" index "field" field "code" "missing_field" "message" (str "option is missing variable " field)}))))
                 (map-indexed vector options)))))

(defn model-metadata [model]
  (select-keys model ["schema_version" "assumptions" "criteria" "evidence"]))

(defn with-metadata [model result]
  (if (seq (model-metadata model))
    (assoc result :metadata (model-metadata model))
    result))

(defn respond [request]
  (let [model (get request "model")
        variables (get model "variables")
        options (get request "options" [])]
    (cond
      (> (cartesian-size model) max-cartesian)
      {:status "invalid_input" :error (str "cartesian product exceeds bound " max-cartesian)}

      (and (= (get request "op") "decision_options_compare") (> (count options) max-options))
      {:status "invalid_input" :error (str "options exceed bound " max-options)}

      (= (get request "op") "decision_options_compare")
      (let [errors (option-errors model options)]
        (if (seq errors)
          {:status "invalid_input" :error "options must match declared variables and domains" :errors errors}
          (let [all (assignments model)
                feasible (vec (filter #(feasible? model %) options))]
            (with-metadata model {:status "ok" :feasible feasible :frontier (frontier model feasible)}))))

      :else
      (let [all (assignments model)]
        (with-metadata model
          (case (get request "op")
            "decision_model_validate" {:status "ok" :feasible (boolean (seq all))}
            "decision_space_explore" (let [limit (get request "limit" 100)
                                            solutions (vec (take limit all))]
                                        {:status (if (< (count solutions) (count all)) "truncated" "ok")
                                         :solutions solutions
                                         :total (count all)})
            {:status "invalid_input" :error "unknown operation"}))))))

(loop [line (read-line)]
  (when line
    (try
      (println (json/write-str (respond (json/read-str line))))
      (flush)
      (catch Exception e
        (println (json/write-str {:status "worker_error" :error (.getMessage e)}))
        (flush)))
    (recur (read-line))))
