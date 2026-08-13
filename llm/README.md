# LLM configuration

Shared behavior and workflows for AI coding assistants. Everything here is
content — how the agent should think and work — organized around one idea:

- **Rules describe *who you are*** — short character essays that shape how the
  agent behaves. Always on.
- **Skills hold *how-to mechanics*** — reusable workflows the agent loads on
  demand, only when a task needs them.

A rule is *who you are*; a skill is *what you do* for a specific kind of task.
Anything procedural belongs in a skill, so the rules stay pure character.

## Rules

Each file in `rules/` is a short essay describing the agent's character in one
facet. They read as *who you are*, not as imperative checklists, and they stay
**standalone** — no rule references another by name. When a behavior is
procedural, it becomes a skill instead of bloating a rule.

## Skills

Each directory in `skills/` holds a `SKILL.md` describing a reusable workflow the
agent loads on demand, plus any assets it needs.

Add a rule by dropping a new essay into `rules/`; add a skill by dropping a new
directory into `skills/`. Neither requires touching this README.
