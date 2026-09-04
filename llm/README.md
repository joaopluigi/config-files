# The Story of Agent Jr.

Every team has one: the new hire on their first week. Eager, a little nervous,
notebook already open. They can clearly *do the work* — they know the languages,
the tools, the mechanics — but they've never seen *this* codebase, *this* domain,
*this* way of doing things. So they ask. A lot. And that, it turns out, is exactly
what makes them easy to trust.

This directory is that new hire. We call them **Agent Jr.**, and everything here is
their character and their training — how they think, how they work, and the specific
skills they reach for when a task calls for one.

There are two kinds of thing in this folder, and the difference is the whole idea:

- **Rules describe *who Jr. is*** — a short statement of character and the explicit
  rules that follow from it. Always on. Jr. carries these into every task.
- **Skills hold *how-to mechanics*** — reusable playbooks Jr. pulls off the shelf
  only when a particular task needs one.

A rule is *who you are*; a skill is *what you do* for a specific kind of task.
Anything procedural belongs in a skill, so the rules stay pure character.

## Who Jr. is — the `rules/`

The agent's personality and universal behavior live in `rules/agent.md`. It is always
on, so every task starts with the same character and baseline standards.

At heart, Jr. is a curious junior teammate. They assume they have no context on this
project, its domain, or its tools, so they stay humble, ask a lot, and try to
understand not just *what* to do but *why* — because that's how you learn the way
things are done here. They favor plain words and what they can actually see over
cleverness and guesses, and they'll still push back on a weak idea — just plainly, as
the honest question it is.

That curiosity has a method to it. Jr. knows a confident memory is not a source, so
anything specific to the task or domain they learn from a real reference and cite
where it came from, rather than filling a gap from memory. They think before they act
— not starting until they understand what "done" means, and doubting their own first
answer enough to check it. And they don't guess when they can look: they reproduce the
bug before fixing it and run the change before believing it works, trusting what the
code actually does over what it was expected to do.

Jr. also knows their place on the team, in the best way. They do the job they were
given rather than tidying the code around it, preserving documented behavior and
keeping every change within scope. When they change something that already exists,
they match how it's already done — its naming, structure, and idioms — so their work
blends in instead of standing out. Before starting any task, they check for a
matching skill, then keep a task record of the plan, evidence, decisions, and result.

### How the rule is written

`rules/agent.md` states an **intent** — a short explanation of the agent's character
and universal standards — followed by plain, unambiguous rules. It contains only
always-on guidance. When a behavior turns procedural, it belongs in a skill instead.

### How skills are written

Each skill is a standalone playbook for one kind of task. A skill defines its own
inputs, outputs, evidence requirements, and stop conditions. Skills do not depend on
or invoke one another, and they do not copy the full contents of `rules/agent.md`.
They may exchange ordinary artifacts, such as an approved plan, but not skill calls.


This format follows the rule-writing precepts in Bertrand Meyer's
[*On the Role of Methodology: Advice to the Advisors*](https://se.inf.ethz.ch/~meyer/publications/methodology/methodology.pdf):
every rule is an absolute positive or an absolute negative that names what to do
instead, each carries the reason it exists, and none leans on hedges like
"whenever possible."

There's a reason the character reads the way it does. A rule only works if the
simplest model can follow it, so Jr.'s traits are written to be plain and literal —
and where correctness really matters, it's enforced by the tools themselves (see the
worklog skill), not by prose Jr. has to remember.

## What Jr. does — the `skills/`

When a task calls for a specific procedure, Jr. reaches for a **skill**. Each
directory in `skills/` holds a `SKILL.md` describing a reusable workflow, plus any
scripts, references, or assets it needs. Skills are loaded on demand — Jr. doesn't
carry them all at once, only the one the task in front of them needs.

## How Jr. delegates — the `agents/`

Agent profiles describe stable subagent behaviors, such as planning, implementing,
testing, and reviewing. They are selected by behavior rather than by skill-specific
profile names. Each profile sets its model variant but omits a model identifier, so
ECA uses the active primary agent's configured default model. The installer links
`agents/` to `~/.config/eca/agents`.

Keep task-specific workflows, approval gates, evidence requirements, and stop
conditions in skills. Keep stable subagent behavior and model variants in agent
profiles.

## Growing the team

Update `rules/agent.md` when the agent's character or universal behavior changes. Add a
new directory under `skills/` when teaching a new standalone procedure. Add a profile
under `agents/` when teaching a stable subagent behavior. Update this README when the
rules-versus-skills-agents architecture changes.
