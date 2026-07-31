[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot "runtime"
$pidFile = Join-Path $runtimeRoot "local-services.json"
$pgsqlData = Join-Path $runtimeRoot "pgsql\data"

if (Test-Path -LiteralPath $pidFile) {
  $services = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  foreach ($name in @("iris", "api", "sqlite")) {
    $id = $services.$name
    if ($id -and (Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue)) {
      Stop-Process -Id ([int]$id)
      Write-Host "Stopped $name (PID $id)"
    }
  }
}

$postgresBin = if ($env:TRACETUTOR_POSTGRES_BIN) {
  $env:TRACETUTOR_POSTGRES_BIN
} else {
  "D:\PostgreSQL\bin"
}
$pgCtl = Join-Path $postgresBin "pg_ctl.exe"
if (
  (Test-Path -LiteralPath $pgCtl) -and
  (Test-Path -LiteralPath (Join-Path $pgsqlData "PG_VERSION"))
) {
  & $pgCtl "status" "--pgdata=$pgsqlData" *> $null
  if ($LASTEXITCODE -eq 0) {
    & $pgCtl "stop" "--pgdata=$pgsqlData" "--mode=fast" "--wait"
    if ($LASTEXITCODE -ne 0) {
      throw "Project PostgreSQL did not stop cleanly."
    }
    Write-Host "Stopped project PostgreSQL"
  }
}

Write-Host "TraceTutor local services are stopped."
