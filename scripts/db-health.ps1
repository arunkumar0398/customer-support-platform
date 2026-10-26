param(
  [ValidateRange(1, 600)]
  [int] $TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

Push-Location $repoRoot
try {
  while ([DateTime]::UtcNow -lt $deadline) {
    docker compose exec -T database pg_isready -U postgres -d postgres *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Output 'PostgreSQL accepts connections.'
      exit 0
    }

    Start-Sleep -Seconds 2
  }

  throw "PostgreSQL did not become ready within $TimeoutSeconds seconds. Run 'docker compose logs database' for diagnostics."
}
finally {
  Pop-Location
}
