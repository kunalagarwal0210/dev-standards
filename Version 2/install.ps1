<#
  install.ps1 - one-time global install of the build-workflow kit (Windows / PowerShell).

  Makes the /wf-* commands and worker/fixer agents available in EVERY project, and puts a
  `wflow` command on PATH that runs this kit's scripts/wf.mjs. Re-run after you move or update
  the kit to refresh the shims. It does NOT touch your global CLAUDE.md or settings.json;
  those two steps are printed at the end for you to add by hand (see docs/WORKFLOW_SETUP.md).

  Usage (from anywhere):  powershell -ExecutionPolicy Bypass -File "<path>\Version 2\install.ps1"
#>
$ErrorActionPreference = 'Stop'

# Kit root = the folder this script lives in (...\Version 2)
$Kit  = Split-Path -Parent $MyInvocation.MyCommand.Path
$WfJs = Join-Path $Kit 'scripts\wf.mjs'
if (-not (Test-Path $WfJs)) { throw "wf.mjs not found at $WfJs. Run this script from inside the kit folder." }

# 1. Copy commands + agents into the global ~/.claude so they work in every project.
$ClaudeHome = Join-Path $env:USERPROFILE '.claude'
$CmdDst = Join-Path $ClaudeHome 'commands'
$AgtDst = Join-Path $ClaudeHome 'agents'
New-Item -ItemType Directory -Force -Path $CmdDst, $AgtDst | Out-Null
Copy-Item (Join-Path $Kit '.claude\commands\*.md') $CmdDst -Force
Copy-Item (Join-Path $Kit '.claude\agents\*.md')  $AgtDst -Force
Write-Host "[1/2] Commands -> $CmdDst   Agents -> $AgtDst"

# 2. Write the `wflow` shims into the npm global bin (already on PATH), pointing at THIS kit.
$Bin = (& npm prefix -g).Trim()
if (-not $Bin -or -not (Test-Path $Bin)) { throw "Could not resolve npm global prefix. Put wflow.cmd on your PATH by hand." }
$WfJsFwd = $WfJs -replace '\\','/'   # forward slashes: node accepts them, avoids escaping

# cmd/PowerShell shim
Set-Content -Path (Join-Path $Bin 'wflow.cmd') -Encoding ASCII -NoNewline `
  -Value "@echo off`r`nnode `"$WfJs`" %*`r`n"
# PowerShell-native shim
Set-Content -Path (Join-Path $Bin 'wflow.ps1') -Encoding ASCII -NoNewline `
  -Value "node `"$WfJs`" @args`n"
# Git Bash / sh shim (LF line endings, no .exe extension)
[IO.File]::WriteAllText((Join-Path $Bin 'wflow'), "#!/bin/sh`nexec node `"$WfJsFwd`" `"`$@`"`n".Replace("`r",''))
Write-Host "[2/2] wflow shims -> $Bin   (target: $WfJs)"

Write-Host ""
Write-Host "Done. Open a NEW terminal and check:  wflow help"
Write-Host ""
Write-Host "Two manual steps remain (they change global config, see docs/WORKFLOW_SETUP.md):"
Write-Host "  A. Add the bootstrap rule to ~/.claude/CLAUDE.md"
Write-Host "  B. Add the SessionStart hook to ~/.claude/settings.json"
