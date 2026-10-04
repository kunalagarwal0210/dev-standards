# Dev Standards

Reusable development standards for AI-assisted / solo builds. Drop these into any
project (e.g. under `docs/`) and adjust the companion-doc pointers to match that repo.

## Documents

- **[BUILD_WORKFLOW.md](BUILD_WORKFLOW.md)** — the execution model: how each ticket
  moves from unblocked to merged (branch discipline, gates before merge, stop caps,
  and the model/role lineup). Parallelize only through worktrees.
- **[git-worktrees.md](git-worktrees.md)** — why and how to use git worktrees so
  concurrent tasks (or concurrent AI sessions) never silently overwrite each other,
  plus the empty-worktree "never actually ran" trap.

## How to reuse in a new project

Copy the two docs into the project's `docs/` folder:

```bash
mkdir -p docs
curl -L https://raw.githubusercontent.com/kunalagarwal0210/dev-standards/main/BUILD_WORKFLOW.md -o docs/BUILD_WORKFLOW.md
curl -L https://raw.githubusercontent.com/kunalagarwal0210/dev-standards/main/git-worktrees.md -o docs/git-worktrees.md
```

Or just `git clone` this repo and copy the files in. Then fill in the project-specific
model names/versions and companion-doc paths where the templates leave them open.
