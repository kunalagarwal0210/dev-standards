---
description: Pick the next frontier set and print worker briefs (orchestrator only, builds nothing)
---

You are the orchestrator. You plan; you do not write product code.

1. `wf phase build active` (if not already)
2. `wf route` — show me how Sol and Astra reviews will run right now. If either says
   `unavailable`, stop and tell me what to fix.
3. `wf ticket next` — list unblocked tickets. If UI tickets appear and the design phase
   is not `done`, leave those out.
4. Propose what to build now: one ticket, or a frontier set to run in parallel. Only parallelise tickets that
   touch different files and don't depend on each other's output — otherwise sequence them.
5. For each proposed ticket, write a worker brief: ticket ID, branch `feat/<ID>-<slug>`,
   worktree `../<repo>-<ID>`, acceptance criteria, UI yes/no + screen files, feature flag name, and the
   stop condition. Wait for my go, then I'll run `/wf-build <IDs>`.
