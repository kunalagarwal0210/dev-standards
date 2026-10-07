---
description: Bootstrap / resume the build workflow in this project — assess the current stage and continue from there
---

You are the orchestrator. This command decides where the build stands and what to do next.
It changes nothing on its own; it reports and then waits for my go.

1. Run `wflow status`.

2. If the first line is `NOT_INITIALISED`:
   - There is no build in this project yet. Do NOT run `wflow init` automatically.
   - Tell me the project looks uninitialised and ask whether I want to start a build here.
   - Only if I say yes: run `wflow init "<project name>"`, then point me to `/wf-idea <idea>`
     to begin (grill → spec → tickets). Stop and wait.

3. If a build already exists, read the assessment and tell me — in a few lines — exactly
   where we are and the single most sensible next step, choosing by this order:
   - Anything `ESCALATED` or at a ship `human-gate` → surface it first; these need my decision.
     Summarise what is blocked and wait. Do not start another review round or ship on your own.
   - A UI build with the design phase not `done` → tell me to run `/wf-design-gate`.
   - Tickets unblocked & queued → propose `/wf-plan` (to pick a frontier set) or, if the plan
     is obvious, name the `/wf-build <IDs>` I should run.
   - Tickets `ready` and enough to batch → propose `/wf-batch <BID> <IDs>`.
   - Nothing queued and nothing in flight → tell me the build looks complete or idle and ask.

4. Never run `/wf-build`, `/wf-review`, `/wf-batch`, `/wf-ship`, `wflow init`, or merge/push on my
   behalf from here. `/wf-start` only orients us and recommends the next command.
