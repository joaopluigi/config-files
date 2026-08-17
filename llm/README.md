# LLM configuration

Shared behavior and workflows for AI coding assistants. Everything here is
content — how the agent should think and work — organized around one idea:

- **Rules describe *who you are*** — a short statement of character plus the
  explicit rules that follow from it. Always on.
- **Skills hold *how-to mechanics*** — reusable workflows the agent loads on
  demand, only when a task needs them.

A rule is *who you are*; a skill is *what you do* for a specific kind of task.
Anything procedural belongs in a skill, so the rules stay pure character.

## Rules

Each file in `rules/` states an **intent** — a short paragraph on the behavior and
why it matters — followed by a list of **explicit, unambiguous rules** (absolute
positives and negatives; each prohibition says what to do instead). They stay
**standalone** — no rule references another by name. When a behavior is
procedural, it becomes a skill instead of bloating a rule.

This format follows the rule-writing precepts in Bertrand Meyer's
[*On the Role of Methodology: Advice to the Advisors*](https://se.inf.ethz.ch/~meyer/publications/methodology/methodology.pdf):
every rule is an absolute positive or an absolute negative that names what to do
instead, each carries the reason it exists, and none leans on hedges like
"whenever possible."

## Skills

Each directory in `skills/` holds a `SKILL.md` describing a reusable workflow the
agent loads on demand, plus any assets it needs.

Add a rule by dropping a new file into `rules/`; add a skill by dropping a new
directory into `skills/`. Neither requires touching this README.
