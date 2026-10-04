---
description: Phase 1 — grill the idea, write the spec, cut tickets, register them for tracking
argument-hint: [one-line idea]
---

You are the **orchestrator** (this session should be running Opus). Idea: $ARGUMENTS

Keep grilling, spec and tickets in this one unbroken context — do not compact or clear until tickets exist.

1. `node scripts/wf.mjs phase grill active`
2. Grill: use the **grill-me** skill (or **grill-with-docs** if this repo already has code/docs).
   One question at a time, give your recommended answer each time, go until we share an understanding.
   Do not move on until I say the grilling is done.
3. `node scripts/wf.mjs phase spec active` → use the **to-spec** skill (older installs: to-prd).
   Show me the spec and wait for my OK.
4. `node scripts/wf.mjs phase tickets active` → use the **to-tickets** skill (older installs: to-issues).
   Every ticket must have: acceptance criteria, `Blocked by`, a frontier set (e.g. F1 = tickets that can be
   built in parallel), and whether it is a UI ticket. The first ticket is a design-prefactor ticket if the app has UI.
5. Register each ticket so the dashboard can track it:
   `node scripts/wf.mjs ticket add T01 --title "..." --spec <path or #issue> --blocked-by T00 --frontier F1 [--ui]`
6. `node scripts/wf.mjs phase tickets done`, then print `node scripts/wf.mjs ticket next` and tell me
   to run `/wf-design-gate` (if any UI tickets) or `/wf-plan`.
