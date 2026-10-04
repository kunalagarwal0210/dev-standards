# Build workflow kit — setup guide

A Claude Code setup for: grill → spec → tickets → design gate → build in worktrees →
GPT reviews → ship. Companion to `BUILD_WORKFLOW.md` and `git-worktrees.md`
from github.com/kunalagarwal0210/dev-standards.

## Who does what

| Step | Model | Where it runs |
|---|---|---|
| Grill, spec, tickets, design gate, planning (orchestrator) | Opus 5.5 | Your main Claude Code session |
| Build each ticket | Sonnet 5.5 | `worker` subagent, one git worktree per ticket |
| Code review, per ticket | GPT-6.1 Sol | `wf.mjs review --kind code` (routed, see below) |
| Fix review findings | Sonnet 5.5 | `fixer` subagent |
| Adversarial review, per merge batch | GPT-6 Astra | `wf.mjs review --kind adversarial` (routed) |
| Fix adversarial findings | Sonnet 5.5 | `fixer` subagent on the batch worktree |
| Design approval, ship decision, merging PRs | You | — |

## How the GPT routing decides (every review, automatically)

1. If `WF_ROUTE` is set to `claudex` or `codex` (or `route.force` in config), that wins.
2. Otherwise, if `ANTHROPIC_BASE_URL` points to a proxy (anything except api.anthropic.com)
   and that proxy's `/v1/models` lists the review model → **Claudex route**: a fresh, headless
   `claude -p --model gpt-6.1-sol` (or Astra) runs through the same proxy with read-only tools.
3. Otherwise, if the `codex` CLI is on your PATH → **Codex route**: a separate
   `codex exec -m <model> -s read-only` instance runs the review.
4. Otherwise the review stops with `NO_ROUTE`. It never falls back to a Claude model,
   because cross-family review is the point.

Either way the reviewer starts with a clean context (only the spec + the diff), which is
your "cold reviewer" rule. Check the current routing any time with `node scripts/wf.mjs route`.

## Install into a project

1. Copy these into the project root: `.claude/`, `.workflow/`, `scripts/wf.mjs`.
   If the project already has `.claude/settings.json`, merge the `statusLine`, `env`
   and `permissions` blocks instead of overwriting.
2. Paste `CLAUDE.workflow.md` into the project's `CLAUDE.md`.
3. Copy `BUILD_WORKFLOW.md` and `git-worktrees.md` into `docs/` (curl commands in the
   dev-standards README).
4. Install Matt Pocock's skills: `npx skills@latest add mattpocock/skills`, then run
   `/setup-matt-pocock-skills` once in the project.
5. `node scripts/wf.mjs init "<Project name>"` — creates the state file and adds local-only
   paths to `.gitignore`.
6. `node scripts/wf.mjs route` — confirm Sol and Astra both show `claudex` or `codex`.
7. In a second terminal: `node scripts/wf.mjs dash --open` — live dashboard at
   http://127.0.0.1:4777. The Claude Code status line also shows a one-line summary.

Needs Node 18 or newer, git, and the GitHub CLI (`gh`) for issues and PRs.

## Running a build

Start Claude Code on Opus (`claude --model opus`, or your Claudex launcher with Opus), then:

| Command | What happens |
|---|---|
| `/wf-idea <idea>` | Grill → spec → tickets in one context; tickets get registered for tracking |
| `/wf-design-gate` | Checks `docs/design/` (tokens.json, screens/*.png, DESIGN.md); waits for you to type "approved" |
| `/wf-plan` | Shows routing, unblocked tickets, proposes a frontier set and writes worker briefs |
| `/wf-build T01 T02` | One worktree per ticket, Sonnet workers in parallel, then the Sol review loop |
| `/wf-review T01` | Sol review → Sonnet fix → re-review, until pass or stop cap |
| `/wf-batch B1 T01 T02` | Merges ready tickets on `batch/B1`, tests, Astra loop, then waits for you |
| `/wf-ship B1` | After you say ship: pushes the batch branch, opens the PR, cleans up after you merge |
| `/wf-status` | Text summary plus a reminder of the dashboard command |

## Stop caps (from BUILD_WORKFLOW §5)

- `maxRounds` in `.workflow/config.json`: default 2 Sol rounds per ticket, 2 Astra rounds per batch.
- If the blocking-issue count doesn't drop between two rounds, the item stops early ("no progress").
- A stopped item turns red on the dashboard and appears under "Waiting on you". Claude is
  told to stop and ask, never to start another round on its own.

## Design pack layout (for the design gate)

```
docs/design/
  tokens.json         colours, type scale, spacing, radius, shadows
  screens/            one PNG per screen and state, e.g. T04-login-empty.png
  DESIGN.md           inspiration links (Pinterest etc.), rules, do/don't
```
Export from Figma, Lovable or anywhere else — the gate only cares that the files exist and agree.

## Verify before relying on it

Some of this is confirmed against one real machine (Codex route, Oct 2026); the rest is
best-understanding you should still check against your own setup:

- **Toolchain (confirmed).** Verified working with Node 24, git 2.54, `gh` 2.98 and
  `codex` 0.160 on Windows 11. The kit needs Node 18+, git, and `gh`; any recent versions
  are fine.
- **Codex route (confirmed).** With `codex` on PATH, `node scripts/wf.mjs route` selects it
  and the runner flags below are valid for `codex` 0.160.
- **Model IDs.** `gpt-6.1-sol` (code review) and `gpt-6-astra` (adversarial) are confirmed
  accepted by `codex` in the author's environment. They may differ for your proxy or codex
  login — check your proxy's `/v1/models` or your codex model access and edit
  `.workflow/config.json` → `reviews.*` if needed. (The `models` block in that file naming
  the Claude orchestrator/worker/fixer models is documentation only — `wf.mjs` never reads
  it; the real Claude models come from the subagent frontmatter and how you launch the
  session.)
- **CLI flags** in `config.json` → `runners`: `codex exec -m … -s read-only -c model_reasoning_effort=high`
  (confirmed for codex 0.160) and `claude -p … --add-dir … --allowedTools …`. Flag names
  change between versions; run `codex exec --help` and `claude --help` and adjust the arrays
  (no code changes needed).
- **Codex output.** The script treats `codex exec` stdout as the review. If your version prints
  progress to stdout too, the verdict lines are still found, but the review file will be noisier.
- **Nested `claude -p`.** The script removes `CLAUDECODE` from the child's environment so a headless
  review can start from inside a session. If your Claude Code version blocks this anyway, force
  the Codex route with `WF_ROUTE=codex`.
- **Long reviews.** `settings.json` raises the Bash timeouts via `BASH_DEFAULT_TIMEOUT_MS` and
  `BASH_MAX_TIMEOUT_MS`. If your version ignores these, ask Claude to run reviews in the background.
- **Claudex detection** relies on `ANTHROPIC_BASE_URL` being visible to commands Claude runs. If
  you set it only inside a launcher that doesn't export it, use `WF_ROUTE=claudex`.
- **Terms of use.** Check Anthropic's and OpenAI's current terms on routing subscription logins
  through a third-party proxy before relying on the Claudex route.
