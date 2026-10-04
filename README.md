# Dev Standards

Reusable development standards for AI-assisted / solo builds, in two layers:

- **[Version 1](Version%201/)** — the **philosophy**. Prose playbooks you drop into any
  repo: the build execution model and the git-worktree rules. No tooling, no install.
- **[Version 2](Version%202/)** — the **kit** that automates Version 1 for Claude Code.
  Slash commands, worker/fixer subagents, a zero-dependency orchestrator (`wf.mjs`) with
  state tracking, cross-family GPT review routing, stop caps, a live dashboard, and a
  status line. **This is the current, active version** — start here for a real build.

## Which one do I want?

| You want… | Use |
|---|---|
| To read or reuse the principles (branch discipline, gates, stop caps, role/model lineup) | Version 1 |
| To actually run the workflow in Claude Code, end to end | Version 2 |

Version 2 implements Version 1 — it still ships `BUILD_WORKFLOW.md` and `git-worktrees.md`
as the docs it references, so installing the kit also installs the philosophy.

## Version 1 — the philosophy

- **[BUILD_WORKFLOW.md](Version%201/BUILD_WORKFLOW.md)** — how each ticket moves from
  unblocked to merged: branch discipline, gates before merge, stop caps, and the
  model/role lineup. Parallelize only through worktrees.
- **[git-worktrees.md](Version%201/git-worktrees.md)** — why and how to use git worktrees
  so concurrent tasks (or AI sessions) never silently overwrite each other, plus the
  empty-worktree "never actually ran" trap.

## Version 2 — the kit

Full flow: `/wf-idea` → `/wf-design-gate` → `/wf-plan` → `/wf-build` (+ `/wf-review`)
→ `/wf-batch` → `/wf-ship`. Grilling, spec and tickets run on Opus; workers and fixers
run on Sonnet in one git worktree per ticket; code review (GPT Sol) and adversarial review
(GPT Astra) run cross-family via a Claudex proxy or a local `codex` CLI — never falling
back to a Claude model.

Install and run: **[Version 2/docs/WORKFLOW_SETUP.md](Version%202/docs/WORKFLOW_SETUP.md)**.

Needs Node 18+, git, the GitHub CLI (`gh`), and a GPT review route (Claudex proxy or the
`codex` CLI).
