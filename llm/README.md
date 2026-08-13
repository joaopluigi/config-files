# LLM configuration

Shared behavior and workflows for AI coding assistants. Everything here is
content — how the agent should think and work — organized around one idea:

- **Rules describe *who you are*** — short character essays that shape how the
  agent behaves. Always on.
- **Skills hold *how-to mechanics*** — reusable workflows the agent loads on
  demand, only when a task needs them.

A rule is *who you are*; a skill is *what you do* for a specific kind of task.
Anything procedural belongs in a skill, so the rules stay pure character.

## Layout

```
llm/
├── eca/config.json     assistant config
├── rules/              always-on character essays
│   ├── persona.md      your character (voice, criticism, caution, curiosity, ...)
│   ├── reasoning.md    who you are when you think
│   ├── sources.md      who you are when you source
│   ├── executing.md    who you are when you carry work out
│   ├── conforming.md   who you are when you change existing code
│   └── practicality.md who you are when you fix and test
└── skills/             on-demand workflows
    ├── notes/          the /tmp/notes.txt working file (plan + open questions + findings)
    ├── git-commit/     how you commit (atomic, working-state, lowercase messages)
    └── rewrite-text/   simplify / rewrite text
```

## Rules

Each rule is a short essay describing the agent's character in one facet. They
read as *who you are*, not as imperative checklists, and they stay **standalone**
— no rule references another by name. When a behavior is procedural, it becomes a
skill instead of bloating a rule.

## Skills

Each skill is a directory with a `SKILL.md` describing a reusable workflow the
agent loads on demand — like `notes` (a working scratchpad), `git-commit` (how to
commit), or `rewrite-text` (simplify text).
