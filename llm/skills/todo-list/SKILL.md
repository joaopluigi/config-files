---
name: todo-list
description: "Create a detailed to_do.txt that plans and tracks a multi-step task: sequential sections broken into concrete, verifiable checkbox items, nested as deep as the task needs. Use whenever you need to lay out and track the steps of a multi-step task."
---

# to-do list

How to create a `to_do.txt` that plans and tracks a multi-step task.

Be extremely detailed: break the task into sequential sections, and break each
section into concrete, verifiable sub-items derived from your analysis of the
actual task and codebase.

Use checkboxes for every item:

- `[ ]` for an incomplete item
- `[x]` for a completed item

An illustrative shape (adapt the sections and items to your real task — do not
copy items that do not apply):

```
# To-Do list
1. [ ] <First section: understand the task>
  - [ ] <Concrete sub-item>
  - [ ] <Concrete sub-item>
2. [ ] <Second section: gather inputs / data>
  - [ ] <Concrete sub-item>
    - [ ] <Nested sub-item, recurse as deep as the task requires>
3. [ ] <Next section: perform the work>
  - [ ] ...
4. [ ] <Final section: validate>
  - [ ] Run the relevant checks/tests and ensure they pass
```

Add, remove, and nest items based on your analysis of the specific task. The
list must cover every step needed to complete the task — nothing implicit.

## Constraint

If you are working in a git repository, do not commit `to_do.txt`.
