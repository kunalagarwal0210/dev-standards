<!-- Paste this block into the project's CLAUDE.md -->
## Build workflow

This repo follows `docs/BUILD_WORKFLOW.md` and `docs/git-worktrees.md` (from github.com/kunalagarwal0210/dev-standards).

Model lineup:
- Orchestrator / grilling / spec / tickets / design gate: Opus 5.5 (start the session with `claude --model opus`)
- Workers and fixers: Sonnet 5.5 (`worker` and `fixer` subagents)
- Code review per ticket: GPT-6.1 Sol — run only via `node scripts/wf.mjs review <ID> --kind code`
- Adversarial review per merge batch: GPT-6 Astra — run only via `node scripts/wf.mjs review <BID> --kind adversarial`

Flow: `/wf-idea` → `/wf-design-gate` → `/wf-plan` → `/wf-build` (+ `/wf-review`) → `/wf-batch` → `/wf-ship`.

Hard rules:
- Every state change goes through `node scripts/wf.mjs` so the dashboard and status line stay true.
- One git worktree per ticket and per batch, always branched from `origin/main`.
- Never substitute a Claude model for a GPT review. If `wf.mjs` says NO_ROUTE, stop and tell the human.
- Exit code 3 from a review = stop cap reached. Stop and ask; never start another round on your own.
- Never push to main, never merge a PR, never approve the design gate or a ship on the human's behalf.
