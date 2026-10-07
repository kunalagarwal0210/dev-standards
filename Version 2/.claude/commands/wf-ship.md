---
description: Human-approved ship — open the batch PR, and after I merge it, clean up worktrees
argument-hint: <B1>
---

Batch: $ARGUMENTS. Only run this if I explicitly said to ship it in this conversation.

1. Confirm the batch is at stage `human-gate`. If not, stop.
2. In the batch worktree: `git diff --stat origin/main...HEAD` — show me. Unfamiliar files → stop.
3. `git push -u origin batch/<BID>` then `gh pr create --base main --head batch/<BID>` with a body listing the
   tickets, flags (default off), review files and the Astra verdict.
4. Tell me the PR URL. I merge it myself.
5. When I say it's merged: `wf batch stage <BID> merged --actor you`, then remove the batch
   worktree and each ticket worktree with `git worktree remove <path>` (ask before using --force).
6. If every ticket is merged: `wf phase ship done`.
