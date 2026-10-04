# Git Worktrees — Reference

> A reusable reference for using git worktrees so that concurrent tasks — or concurrent
> AI sessions — never silently overwrite each other's work. Companion to
> `BUILD_WORKFLOW.md`; drop it in the same place (e.g. `docs/git-worktrees.md`) in any repo.

---

## 1. The core idea

**A worktree is a whole separate folder on your computer, with its own branch**, so two
tasks can never collide — even if both are actively editing files at the same time.

This matters most when building with AI: you often run two sessions at once, and both are
editing files. If they share one folder, they overwrite each other **without either
noticing**.

---

## 2. The failure mode (why this is a hard rule)

A representative failure this prevents:

- Two AI sessions were building two different features **in the same folder**.
- A new branch was created without naming a starting point — it silently branched from the
  *other* session's half-done work.
- The resulting PR carried 8 files: 6 belonging to the other session, 2 of the intended
  change.
- Merging it pushed an unfinished, unrelated feature toward live users.
- The fix required a **forward-moving revert** (a new commit that undoes the mistake) —
  never a rewrite of shared history others have already pulled.

---

## 3. The four rules

- [ ] **Always branch from the latest official version, named explicitly.**
  ```bash
  git checkout -b feature/ratings origin/main
  ```
  Never a bare "new branch" with no base named.

- [ ] **List changed files before every push.**
  ```bash
  git diff main..HEAD --stat
  ```
  Only your feature's files should appear.

- [ ] **Never push work you didn't do.** Unfamiliar files on that list = stop and
  investigate, don't shrug it off.

- [ ] **Undo by moving forward.** A shared mistake gets a fresh reverting commit — never a
  history rewrite once others have it.

> These four mirror the branch & push discipline in `BUILD_WORKFLOW.md` — keep the two in
> sync if you change one.

---

## 4. When to use a worktree vs. a plain branch

| Situation | Use a worktree? |
|---|---|
| Big or multi-day work (e.g., a week of evenings on one feature) | ✅ Yes — give it its own folder, e.g. `../project-feature-name` |
| A clean fix needed now, while the main folder is messy with half-done work | ✅ Yes — branch fresh from `origin/main` so the fix ships clean |
| Two AI sessions running at once | ✅ Yes — **no exceptions.** This is the entire reason the habit exists |
| A one-line change on an otherwise tidy project, nothing else running | ❌ No — a plain branch is enough; extra ceremony just slows you down |

---

## 5. The worktree trap

A fresh worktree is an **empty new folder** — it does not yet contain your project's
installed dependencies.

⚠️ Some tools will cheerfully report **"all tests passed"** on a project that never actually
ran. A green result from an uninstalled project is **worse than a red one** — it lies to you.

### First steps in any new worktree
1. **Install the project's dependencies before trusting any test result** (whatever the
   install step is for your stack — `npm install`, `pip install`, `bundle`, etc.).
2. If "my change isn't showing up" ever happens, check for a leftover preview/dev server
   still running from a worktree you forgot to close.

---

## Quick reference

- Worktree = separate folder + own branch → tasks can't collide.
- Branch from `origin/main`, base always named.
- Check the changed-file list before every push — unfamiliar files = stop.
- New worktree → install dependencies first, before believing any green result.

## Setup commands cheat sheet

```bash
# Create a new worktree on a new branch from latest main
git fetch origin
git worktree add ../project-feature-name -b feature/feature-name origin/main

# Work inside it like a normal repo
cd ../project-feature-name
npm install   # or your project's install step — do this first, always

# When done, remove the worktree
git worktree remove ../project-feature-name
```
