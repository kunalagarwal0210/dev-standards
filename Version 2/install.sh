#!/usr/bin/env bash
# install.sh — one-time global install of the build-workflow kit (macOS / Linux / Git Bash).
#
# Makes the /wf-* commands and worker/fixer agents available in EVERY project, and puts a
# `wf` command on PATH that runs this kit's scripts/wf.mjs. Re-run to refresh after moving or
# updating the kit. Does NOT edit your global CLAUDE.md or settings.json — those two steps are
# printed at the end to add by hand (see docs/WORKFLOW_SETUP.md).
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
WFJS="$KIT/scripts/wf.mjs"
[ -f "$WFJS" ] || { echo "wf.mjs not found at $WFJS" >&2; exit 1; }

# 1. Commands + agents into the global ~/.claude.
CLAUDE="${HOME}/.claude"
mkdir -p "$CLAUDE/commands" "$CLAUDE/agents"
cp "$KIT/.claude/commands/"*.md "$CLAUDE/commands/"
cp "$KIT/.claude/agents/"*.md  "$CLAUDE/agents/"
echo "[1/2] Commands -> $CLAUDE/commands   Agents -> $CLAUDE/agents"

# 2. wf shim on PATH (npm global bin), pointing at THIS kit.
BIN="$(npm prefix -g)/bin"
[ -d "$BIN" ] || BIN="$(npm prefix -g)"
printf '#!/bin/sh\nexec node "%s" "$@"\n' "$WFJS" > "$BIN/wf"
chmod +x "$BIN/wf"
# Also drop a wf.cmd for anyone invoking from Windows cmd/PowerShell via Git Bash install.
printf '@echo off\r\nnode "%s" %%*\r\n' "$WFJS" > "$BIN/wf.cmd"
echo "[2/2] wf shim -> $BIN/wf   (target: $WFJS)"

echo
echo "Done. Open a NEW terminal and check:  wf help"
echo
echo "Two manual steps remain (they change global config — see docs/WORKFLOW_SETUP.md):"
echo "  A. Add the bootstrap rule to ~/.claude/CLAUDE.md"
echo "  B. Add the SessionStart hook to ~/.claude/settings.json"
