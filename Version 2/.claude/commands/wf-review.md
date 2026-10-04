---
description: Sol code-review loop for one ticket with stop caps (auto-routes via Claudex proxy or separate Codex)
argument-hint: <T01>
---

You are the orchestrator. Ticket: $ARGUMENTS

Loop (the script enforces the cap from `.workflow/config.json` — default 2 rounds):

1. Run `node scripts/wf.mjs review $ARGUMENTS --kind code`
   This can take many minutes — run it with a long Bash timeout (up to 30 min) or in the background and wait.
   The script decides the route itself: if this session runs under Claudex (proxy that lists the Sol model)
   it calls Sol through the proxy; otherwise it starts a separate Codex instance. Don't override it.
2. Read the exit code / first output line:
   - `PASS` (exit 0) → done, ticket is `ready`. Tell me.
   - `FAIL` (exit 1) → launch the **fixer** subagent with: worktree path, branch, the review file path printed
     by the script, and the spec. When it reports back, go to step 1.
   - `STOP_CAP` or escalation (exit 3) → STOP. Summarise the open blocking items from the latest review file and
     what the fixer disputed. Ask me how to proceed. Do not start another round.
   - `NO_ROUTE` (exit 2) → stop and show me the reason.
   - `REVIEW_ERROR` (exit 4) → show me the review file (it holds stderr). Do not retry more than once.

Never run the review with a Claude model as a substitute for Sol — cross-family review is the point.
