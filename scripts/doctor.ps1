# Non-mutating Windows environment readiness check. Run from any directory.
# This is a tool-preflight, not evidence that the application or Superpowers plugin works.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Write-Host "Assessment kit path: $repo"
foreach ($tool in @('git', 'node', 'npm', 'docker', 'py')) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if ($null -eq $cmd) {
        Write-Host "MISSING: $tool (install/enable it before related checkpoints)"
    } else {
        Write-Host "FOUND: $tool at $($cmd.Source)"
    }
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Docker CLI present but daemon is not ready; start Docker Desktop.'
    }
    docker compose version 2>$null
}
if (Get-Command git -ErrorAction SilentlyContinue) {
    git -C $repo rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Host 'Git repo not initialized; run git init -b main if this is the intended empty repo.' }
}
Write-Host 'Install Superpowers through Codex Desktop -> Plugins -> Coding -> Superpowers.'
Write-Host 'Verify plugin SKILL discovery IN CODEX. This script cannot verify that.'
Write-Host 'Next: py -3 scripts/verify_kit.py; paste prompts/MASTER_CODEX_DESKTOP_PROMPT.md in Codex.'
