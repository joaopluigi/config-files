# Examples

Worked commit sequences. Add more over time; each shows a real working tree
split into atomic, dependency-ordered commits with their messages.

---

## Example 1 — restructure into `llm/`, then add its installer

Working tree:

```
 M .gitignore                         # ignore rules updated for the new layout
 D eca/config.json                    # config moved into llm/
?? llm/                               # new home: rules, skills, eca config
?? install.sh                         # installer that symlinks the new llm/ layout
 M nvim/lua/config/conjure.lua        # unrelated, pre-existing edits
 M nvim/lua/mappings.lua              # unrelated, pre-existing edits
 M nvim/lua/plugins.lua               # unrelated, pre-existing edits
?? .DS_Store                          # noise, not ours
```

Two related changes to commit: the restructure, and the `install.sh` that
depends on it. `install.sh` symlinks paths under `llm/`, so it only works after
the restructure exists — commit the restructure first. The `nvim/` edits and
`.DS_Store` are unrelated, so they are left unstaged.

```
# commit 1 — the foundational restructure (config move + new llm/ tree + ignore rules)
git add .gitignore eca/config.json llm/
git commit -m "create a new llm directory to contain rules, skills and llm tools config"

# commit 2 — the installer, which depends on the new layout
git add install.sh
git commit -m "add install.sh script that creates the necessary symlinks for llm config directories"
```

Checking out commit 1 alone leaves a working repo; committing `install.sh`
before the restructure would leave a broken intermediate commit.
