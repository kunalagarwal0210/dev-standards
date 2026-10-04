---
description: Merge ready tickets into one batch branch, then Astra adversarial review → Sonnet fixes → your ship call
argument-hint: <B1> <T01> <T02> ...
---

You are the orchestrator. Arguments: $ARGUMENTS  (first = batch ID, rest = tickets)

1. Every listed ticket must be at stage `ready`. If not, stop.
2. Integration branch in its own worktree:
   ```
   git fetch origin
   git worktree add ../<repo>-<BID> -b batch/<BID> origin/main
   node scripts/wf.mjs batch add <BID> <tickets...> --worktree <absolute path>
   ```
3. In that worktree, merge each ticket branch with `git merge --no-ff feat/<ID>-<slug>` in dependency order.
   Conflicts: resolve only if trivial and obvious; otherwise stop and show me.
4. Install deps, run the full test suite with all flags off, then with this batch's flags on. Failures → hand to a
   **fixer** subagent (worktree = batch worktree), then re-run tests. Max 2 attempts, then ask me.
5. Adversarial loop — same rules as `/wf-review` but:
   `node scripts/wf.mjs review <BID> --kind adversarial`
   PASS → stage `human-gate`. FAIL → fixer on the batch worktree → re-run. Exit 3 → stop and ask me.
6. At `human-gate`: give me a short ship brief — what's in the batch, flags and their defaults, the last Astra
   verdict and any non-blocking risks, test results. Then wait. Run `/wf-ship <BID>` only when I say so.
