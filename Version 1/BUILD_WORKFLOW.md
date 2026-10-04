# Build Workflow — AI-Assisted / Solo Build

> A reusable execution model for building a project from a dependency-ordered ticket
> plan. Lightweight by default: full orchestration machinery is used only when it earns
> its keep. Drop this into any repo (e.g. `docs/BUILD_WORKFLOW.md`) and adjust the
> companion-doc pointers in the References section to match that project.

---

## 1. The model in one picture

```
tickets (dependency-ordered)   ← the plan already exists; frontier marks parallel sets
        │
   pick the next unblocked ticket(s)
        │
   ┌────┴────────────────────────────┐
   │ one ticket at a time (default)  │   OR   │ 2+ independent tickets → one worktree each │
   └────┬────────────────────────────┘        └────┬───────────────────────────────────────┘
        │                                            │
   build on a feature branch from origin/main    build in parallel, no shared folder
        │                                            │
        └───────────────┬────────────────────────────┘
                        │
             cold review before merge  (fresh eyes, not the builder)
                        │
             human gate: you decide what ships
                        │
                  merge to main via PR
```

The tickets **are** the orchestrator plan: a `Blocked by` field gives dependency order,
and a frontier notation — e.g. `{03, 05, 09}` — marks a set of tickets that carry no
dependency on each other and can therefore be built in parallel. Keep the plan the single
source of truth for "what's next"; the workflow below is only about *how* each ticket moves
from unblocked to merged.

---

## 2. When to parallelize (and use worktrees)

| Situation | Do this |
|---|---|
| Building one ticket at a time | Plain feature branch from `origin/main`. No worktree ceremony. |
| Building 2+ **independent** tickets from a parallel set at once | **One git worktree per worker** — no exceptions. |
| A clean fix needed while the main folder is mid-change | Fresh worktree branched from `origin/main`. |

Parallel workers are only safe in separate worktrees — a shared folder lets two sessions
silently overwrite each other. If two tickets are *not* genuinely independent (they touch
the same files or one assumes the other's output), don't parallelize them; sequence them.

---

## 3. Branch & push discipline (every time)

- **Branch from `origin/main`, named explicitly:** `git checkout -b feat/<ticket> origin/main`. Never a bare `checkout -b` with no base.
- **Before every push, list changed files:** `git diff main..HEAD --stat`. Only this feature's files should appear — unfamiliar files = stop and investigate.
- **Never push to `main` directly.** Merge via PR after cold review.
- **Undo by moving forward:** a shared mistake gets a fresh reverting commit, never a history rewrite once others have pulled it.
- **Fresh worktree:** install dependencies first; never trust a "green" test result from a project that never actually ran.

---

## 4. Gates before merge

A ticket is mergeable only when:
1. **Design gate** passed (UI tickets): the surface is finalized against the project's design reference and approved before any page-building. Use whatever design-shaping step the project has; the rule is *design is settled first*, not *which command settles it*.
2. **Feature flag** wired if user-facing: built behind its flag (e.g. a `FEATURE_*` env flag), default off, shipped dark. Flip → build → prove, rather than shipping live on merge.
3. **Cold review** done: a fresh agent or reviewer that did **not** build the ticket attacks the result against the ticket's acceptance criteria (a `/code-review` command or an equivalent clean session).
4. **Human decision** to ship. Ship / live-DB / design-taste calls are never delegated.

---

## 5. Stop caps — no loop without a limit

Before starting any self-correcting loop (fix → re-check → fix…), state:
- [ ] What "done" looks like (the ticket's acceptance criteria).
- [ ] Max number of tries.
- [ ] **Two rounds with no progress = stop.** A third identical attempt means the understanding of the problem is wrong, not that the third try will work.

An unbounded retry loop can quietly burn real money and time on a single failing step. The
cap is what turns "keep trying" into "step back and re-diagnose."

---

## 6. Roles & model lineup

Roles map to sessions/agents:
- **Orchestrator** — plans, writes each worker's exact instructions, gathers results, builds nothing.
- **Workers** — one ticket each; independent ones run in parallel worktrees.
- **Cold reviewer** — gets only the finished result + spec; tries to break it.

For each role, pin **model + reasoning level** on purpose. Choose by principle, not habit:

| Role | Model choice | Reasoning level |
|---|---|---|
| Orchestrator | Strongest planning model available | high / max |
| Workers | Cheaper/faster model for mechanical, well-specced tickets; strongest model for hard or design-judgment tickets | medium → high |
| Cold reviewer | Strongest model available | max |

**Guiding principle:** wide/mechanical building → cheaper/faster model; the few hard pieces
→ stronger model; reserve the highest reasoning level for the final cold review, where being
wrong is expensive.

> Note: this template intentionally does **not** hardcode specific model names or version
> numbers — those change often, and a pinned version here would go stale. Fill in the exact
> model + version for each role in the project's own build notes when building starts, and
> revisit if a newer model changes the cost/capability trade-off.

---

## References (companion docs — create/port per project)

This workflow assumes a few supporting docs exist in the project. Adjust paths to match:
- **Orchestration pattern** — orchestrator/workers/cold-review roles and stop caps.
- **Git worktrees** — worktree rules and the empty-worktree (never-ran) trap.
- **Feature flags & staging** — env/flags/staging, ship-dark, flip → build → prove.
- **Tickets / plan** — the dependency-ordered plan itself; a design-prefactor ticket first, and UI tickets carrying design gates.
