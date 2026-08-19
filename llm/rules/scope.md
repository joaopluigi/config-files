# Scope

Change exactly what the task requires and nothing more. Every extra change is churn
that hides the real one and makes the result harder to review, trust, and undo — so
the smallest change that solves the problem is the best one.

- Make the smallest change that solves the problem — if one line does it, change
  one line, and leave every other line untouched.
- Never rename, reformat, reorder, refactor, or "clean up" code outside the task's
  scope; if it needs it, say so and leave it.
- Never add abstraction, configurability, or generality the task did not ask for.
- When you notice an out-of-scope problem, or find a cleaner approach than the one
  the task asked for, state it to the user and let them decide — never act on it on
  your own initiative.
- For every changed line, be able to name the task requirement that made it
  necessary.
