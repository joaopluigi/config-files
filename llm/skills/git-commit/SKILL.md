---
name: git-commit
description: "Create atomic, dependency-ordered git commits that each leave the repo in a working state, with single-line, lowercase messages that are as short as possible while stating explicitly what was done and why. Use whenever committing changes to a git repository."
---

# git commit

How to commit changes to a git repository.

## 1. Split the work into atomic commits

One logical change per commit. Before you stage anything, read the whole diff and
decide the grouping — never stage the entire worktree and commit it as a single
lump just because the changes were made together.

- Put **independent concerns** in their own commits: an unrelated fix, a
  refactor, a rename, reformatting, or docs that are not about the main change.
- Keep **one logical change together with its own tests** — a feature and the
  tests that cover it belong in the same commit, since a commit with the feature
  but not its tests (or the reverse) is not a working, self-contained state.
- Prefer focused commits: when a diff holds several concerns, make several
  commits; when it is genuinely one change, one commit is correct — do not split
  it artificially.

## 2. Every commit must leave the repo in a working state

Order commits so that each one, on its own, produces a repo that works — because
the history must be valid at every point, not just at the end. Never commit a
change before the change it depends on: that would create a snapshot in history
that is broken.

Commit the foundational change first, then the changes that build on it. If
feature B depends on move A, commit A before B.

For example, a directory restructure (deleting `eca/config.json`, adding `llm/`)
must be committed before an `install.sh` that depends on the new layout —
committing `install.sh` first would leave a broken intermediate commit.

## 3. Stage precisely

Stage only the paths that belong to the current commit, including deletions
(e.g. `git add <moved paths>` and the deleted file together). Do not use a
blanket `git add -A` that would sweep in unrelated changes.

## 4. Write the message

- **Single line.** No body unless it is truly necessary.
- **Always lowercase.**
- **As few characters as possible** while being **very explicit** about what was
  done and the intention behind it.
- Do **not** include `🤖 Generated with [ECA](https://eca.dev) (openai/gpt-5.6-luna - medium)`
  or any other generated-attribution footer in the commit message.
- Start with a verb (`add`, `create`, `fix`, `update`, `rm`, `move`, ...).

Real examples:

```
create a new llm directory to contain rules, skills and llm tools config
add install.sh script that creates the necessary symlinks for llm config directories
```

## Process

1. Read `references/REFERENCE.md` for worked commit-sequence examples.
2. Run `git status` and review the whole diff before touching the index.
3. **Write the commit plan first** — list each planned commit on its own line
   with the files it will include and its message. Do not run `git add` until this
   plan exists; if the plan is a single commit, say why the diff is one logical
   change.
4. For each commit, in dependency order: stage only that commit's files (never a
   blanket `git add -A`, and never files that belong to another commit), then
   commit with a message following the format above.
