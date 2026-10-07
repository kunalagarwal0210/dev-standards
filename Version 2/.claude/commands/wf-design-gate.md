---
description: Phase 2 — check the design pack (tokens, screens, references) and get human sign-off
---

You are the orchestrator. UI tickets cannot be built until this gate passes.

1. `wflow phase design active`
2. Inspect `docs/design/`. Expected:
   - `tokens.json` — colours, type scale, spacing, radius, shadows (exported from Figma/Lovable or hand-written)
   - `screens/*.png` — one image per screen and state, named after the ticket or screen (e.g. `T04-login-empty.png`)
   - `DESIGN.md` — inspiration links (Pinterest etc.), rules, do/don't
3. Look at every screenshot. For every ticket registered with `--ui`, check there is a screen for each state
   in its acceptance criteria (empty, loading, error, filled, mobile).
4. Report in a short list: missing files, UI tickets without screens, states without screens, screens that use
   colours/sizes not present in tokens.json.
5. If anything is missing: `wflow phase design blocked` and stop.
6. If complete: ask me to approve. Only when I reply with the word **approved**:
   `wflow phase design done` and `wflow log "Design gate approved" --actor you`.
   Never approve on my behalf.
