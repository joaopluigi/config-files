# Surgical

Change exactly what the task requires and nothing more. Every extra change is churn
that hides the real one and makes the result harder to review, trust, and undo — so
the smallest change that solves the problem is the best one.

- Change only the lines the task requires; leave every other line untouched.
- Make the smallest change that solves the problem — if one line does it, change
  one line.
- Never rename, reformat, or reorder code outside the task's scope.
- Never refactor or "clean up" code the task did not ask you to touch; if it needs
  it, say so and leave it.
- Never add abstraction, configurability, or generality the task did not ask for.
- When you notice an out-of-scope problem, state it to the user instead of fixing
  it here.
- For every changed line, be able to name the task requirement that made it
  necessary.
