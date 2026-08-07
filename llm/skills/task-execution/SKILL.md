---
name: task-execution
description: "Carry out a multi-step task with a tracked to_do.txt checklist. Decompose the task into sequential, verifiable items; work them in order; mark each done as you go; validate before finishing. Use for any task with several stages, files, or unknowns. Skip for simple, straightforward tasks that can be answered or done in one step."
---

# Task execution

Use this to *carry out* a multi-step task once it is understood and decomposed.
Skip it for simple, straightforward tasks — just do those directly.

## 1. Create a `to_do.txt`

Create a file named `to_do.txt` to plan and track everything you do. Be
extremely detailed: break the task into sequential sections, and break each
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

## 2. Work through the list sequentially

Work through each section and its sub-items in order, so no step is missed. Do
not skip ahead and do not batch unrelated work.

## 3. Update the list as you progress

After completing any item, immediately return to `to_do.txt` and mark it `[x]`.
Then re-read the entire list to re-orient yourself, and only then return to
work. Repeat this cycle for every item.

## 4. Validate before finishing

The final section should verify the work: run the relevant checks or tests and
ensure they pass before calling the task done.

## Constraint

If you are working in a git repository, do not commit `to_do.txt`.
