---
description: Build one ticket or a frontier set — worktree per worker, Sonnet builds, Sol reviews, Sonnet fixes
argument-hint: <T01> [T02 T03 ...]
---

You are the orchestrator. Tickets: $ARGUMENTS

For EACH ticket (create all worktrees first, then launch workers in parallel):

1. Check `node scripts/wf.mjs ticket show <ID>` — stage must be `queued` and every `blockedBy` ticket must be
   `ready`, `batched` or `merged`. UI ticket + design phase not done → skip it and tell me.
2. Worktree (always, even for one ticket — keeps the main folder clean for you):
   ```
   git fetch origin
   git worktree add ../<repo>-<ID> -b feat/<ID>-<slug> origin/main
   node scripts/wf.mjs ticket set <ID> branch=feat/<ID>-<slug> worktree=<absolute path of ../<repo>-<ID>>
   node scripts/wf.mjs ticket stage <ID> building --actor sonnet
   ```
3. Launch a **worker** subagent per ticket with its brief. Independent tickets → launch them in parallel.
4. When a worker reports back, sanity-check its report (deps installed? tests actually ran? `--stat` clean?).
   If not, send it back once with the specific gap.
5. Then run the review loop for that ticket exactly as `/wf-review <ID>` describes.

Never push to main. Never merge. Ticket branches end at stage `ready`; merging happens in `/wf-batch`.
