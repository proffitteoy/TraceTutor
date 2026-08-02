[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipQuestionImport
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot "runtime"
$logRoot = Join-Path $runtimeRoot "logs"
$pidFile = Join-Path $runtimeRoot "local-services.json"
$pgsqlData = Join-Path $runtimeRoot "pgsql\data"
$pgsqlLog = Join-Path $logRoot "postgresql.log"
$pgsqlPort = 55432

New-Item -ItemType Directory -Force -Path $runtimeRoot, $logRoot | Out-Null

# Windows psql otherwise follows the active GBK console code page and can
# misread UTF-8 migration files containing Chinese text.
$env:PGCLIENTENCODING = "UTF8"

function Resolve-CommandPath {
  param(
    [Parameter(Mandatory)]
    [string]$Name,
    [string[]]$Candidates = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "Cannot find $Name. Install the required runtime or configure its path."
}

function Resolve-PythonPath {
  $candidates = @(
    $env:TRACETUTOR_PYTHON,
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Get-Command "python.exe" -ErrorAction SilentlyContinue).Source
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) {
      continue
    }
    try {
      & $candidate --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return (Resolve-Path -LiteralPath $candidate).Path
      }
    } catch {
      # Continue to the next installed Python when a stale launcher is found.
    }
  }
  throw "Cannot find a working Python 3.11+ runtime. Set TRACETUTOR_PYTHON."
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)]
    [string]$FilePath,
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

function Wait-Endpoint {
  param(
    [Parameter(Mandatory)]
    [string]$Url,
    [Parameter(Mandatory)]
    [string]$Name,
    [int]$Seconds = 60
  )

  for ($attempt = 1; $attempt -le $Seconds; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "[ready] $Name"
        return
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "$Name was not ready within $Seconds seconds. Check runtime/logs."
}

function Test-ProcessId {
  param([int]$Id)
  return $null -ne (Get-Process -Id $Id -ErrorAction SilentlyContinue)
}

$node = Resolve-CommandPath -Name "node.exe"
$npm = Resolve-CommandPath -Name "npm.cmd"
$python = Resolve-PythonPath
$postgresBin = if ($env:TRACETUTOR_POSTGRES_BIN) {
  $env:TRACETUTOR_POSTGRES_BIN
} else {
  "D:\PostgreSQL\bin"
}
$pgCtl = Resolve-CommandPath -Name "pg_ctl.exe" -Candidates @(
  (Join-Path $postgresBin "pg_ctl.exe")
)
$initDb = Resolve-CommandPath -Name "initdb.exe" -Candidates @(
  (Join-Path $postgresBin "initdb.exe")
)
$psql = Resolve-CommandPath -Name "psql.exe" -Candidates @(
  (Join-Path $postgresBin "psql.exe")
)
$createdb = Resolve-CommandPath -Name "createdb.exe" -Candidates @(
  (Join-Path $postgresBin "createdb.exe")
)

Write-Host "[1/7] Initializing project PostgreSQL"
if (-not (Test-Path -LiteralPath (Join-Path $pgsqlData "PG_VERSION"))) {
  New-Item -ItemType Directory -Force -Path $pgsqlData | Out-Null
  Invoke-Native $initDb `
    "--pgdata=$pgsqlData" `
    "--username=postgres" `
    "--encoding=UTF8" `
    "--locale=C" `
    "--auth-local=trust" `
    "--auth-host=trust"
}

& $pgCtl status "--pgdata=$pgsqlData" *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Native $pgCtl `
    "start" `
    "--pgdata=$pgsqlData" `
    "--log=$pgsqlLog" `
    "--options=-p $pgsqlPort -h 127.0.0.1" `
    "--wait"
}

$databaseExists = & $psql `
  "--host=127.0.0.1" `
  "--port=$pgsqlPort" `
  "--username=postgres" `
  "--dbname=postgres" `
  "--tuples-only" `
  "--no-align" `
  "--command=SELECT 1 FROM pg_database WHERE datname='tracetutor'"
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect the TraceTutor PostgreSQL database."
}
if (($databaseExists | Out-String).Trim() -ne "1") {
  Invoke-Native $createdb `
    "--host=127.0.0.1" `
    "--port=$pgsqlPort" `
    "--username=postgres" `
    "--encoding=UTF8" `
    "tracetutor"
}

Invoke-Native $psql `
  "--host=127.0.0.1" `
  "--port=$pgsqlPort" `
  "--username=postgres" `
  "--dbname=tracetutor" `
  "--set=ON_ERROR_STOP=1" `
  "--command=CREATE TABLE IF NOT EXISTS public.tracetutor_schema_migration (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

$migrationRoot = Join-Path $projectRoot "db\pgsql\migrations"
foreach ($migration in Get-ChildItem -LiteralPath $migrationRoot -Filter "*.sql" | Sort-Object Name) {
  $escapedName = $migration.Name.Replace("'", "''")
  $applied = & $psql `
    "--host=127.0.0.1" `
    "--port=$pgsqlPort" `
    "--username=postgres" `
    "--dbname=tracetutor" `
    "--tuples-only" `
    "--no-align" `
    "--command=SELECT 1 FROM public.tracetutor_schema_migration WHERE filename='$escapedName'"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect PostgreSQL migration $($migration.Name)"
  }
  if (($applied | Out-String).Trim() -eq "1") {
    continue
  }
  Invoke-Native $psql `
    "--host=127.0.0.1" `
    "--port=$pgsqlPort" `
    "--username=postgres" `
    "--dbname=tracetutor" `
    "--set=ON_ERROR_STOP=1" `
    "--file=$($migration.FullName)"
  Invoke-Native $psql `
    "--host=127.0.0.1" `
    "--port=$pgsqlPort" `
    "--username=postgres" `
    "--dbname=tracetutor" `
    "--set=ON_ERROR_STOP=1" `
    "--command=INSERT INTO public.tracetutor_schema_migration(filename) VALUES ('$escapedName')"
}

$appRoleSql = @'
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracetutor_app') THEN
    CREATE ROLE tracetutor_app LOGIN;
  END IF;
END
$role$;
GRANT tracetutor_asset_writer TO tracetutor_app;
ALTER ROLE tracetutor_app SET search_path = pg_catalog, public;
'@
Invoke-Native $psql `
  "--host=127.0.0.1" `
  "--port=$pgsqlPort" `
  "--username=postgres" `
  "--dbname=tracetutor" `
  "--set=ON_ERROR_STOP=1" `
  "--command=$appRoleSql"

Write-Host "[2/7] Preparing SQLite state service"
$sqliteRoot = Join-Path $projectRoot "db\sqlite\state-service"
$venvRoot = Join-Path $sqliteRoot ".venv"
$venvPython = Join-Path $sqliteRoot ".venv\Scripts\python.exe"
$venvUvicorn = Join-Path $sqliteRoot ".venv\Scripts\uvicorn.exe"
$venvReady = $false
if (Test-Path -LiteralPath $venvPython) {
  try {
    & $venvPython --version *> $null
    $venvReady = $LASTEXITCODE -eq 0
  } catch {
    $venvReady = $false
  }
}
if (-not $venvReady) {
  if (Test-Path -LiteralPath $venvRoot) {
    # A virtual environment contains only generated dependencies; rebuilding
    # it is safe and fixes environments bound to a removed Python install.
    Remove-Item -LiteralPath $venvRoot -Recurse -Force
  }
  Invoke-Native $python "-m" "venv" $venvRoot
}
if (-not (Test-Path -LiteralPath $venvUvicorn)) {
  if ($SkipInstall) {
    throw "SQLite Python dependencies are missing and -SkipInstall was specified."
  }
  Push-Location $sqliteRoot
  try {
    Invoke-Native $venvPython "-m" "pip" "install" "-e" "."
  } finally {
    Pop-Location
  }
}
Push-Location $sqliteRoot
try {
  Invoke-Native $venvPython "-m" "tracetutor_state.cli" "migrate"
} finally {
  Pop-Location
}

Write-Host "[3/7] Preparing API and Iris"
$apiRoot = Join-Path $projectRoot "apps\api"
$irisRoot = Join-Path $projectRoot "apps\iris"
foreach ($appRoot in @($apiRoot, $irisRoot)) {
  if (-not (Test-Path -LiteralPath (Join-Path $appRoot "node_modules"))) {
    if ($SkipInstall) {
      throw "Node.js dependencies are missing in $appRoot and -SkipInstall was specified."
    }
    Push-Location $appRoot
    try {
      Invoke-Native $npm "install"
    } finally {
      Pop-Location
    }
  }
}
if (-not $SkipBuild) {
  Push-Location $apiRoot
  try {
    Invoke-Native $npm "run" "build"
  } finally {
    Pop-Location
  }
  Push-Location $irisRoot
  try {
    Invoke-Native $npm "run" "build"
  } finally {
    Pop-Location
  }
}

Write-Host "[4/7] Starting local services"
$servicePids = [ordered]@{}
$existing = if (Test-Path -LiteralPath $pidFile) {
  Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
} else {
  $null
}

if ($existing -and $existing.sqlite -and (Test-ProcessId ([int]$existing.sqlite))) {
  $servicePids.sqlite = [int]$existing.sqlite
} else {
  $sqliteProcess = Start-Process `
    -FilePath $venvPython `
    -ArgumentList @(
      "-m", "uvicorn", "tracetutor_state.main:app",
      "--app-dir", "src", "--host", "127.0.0.1", "--port", "8000"
    ) `
    -WorkingDirectory $sqliteRoot `
    -RedirectStandardOutput (Join-Path $logRoot "sqlite.out.log") `
    -RedirectStandardError (Join-Path $logRoot "sqlite.err.log") `
    -WindowStyle Hidden `
    -PassThru
  $servicePids.sqlite = $sqliteProcess.Id
}

if ($existing -and $existing.api -and (Test-ProcessId ([int]$existing.api))) {
  $servicePids.api = [int]$existing.api
} else {
  $apiProcess = Start-Process `
    -FilePath $node `
    -ArgumentList @("dist/server.js") `
    -WorkingDirectory $apiRoot `
    -RedirectStandardOutput (Join-Path $logRoot "api.out.log") `
    -RedirectStandardError (Join-Path $logRoot "api.err.log") `
    -WindowStyle Hidden `
    -PassThru
  $servicePids.api = $apiProcess.Id
}

if ($existing -and $existing.iris -and (Test-ProcessId ([int]$existing.iris))) {
  $servicePids.iris = [int]$existing.iris
} else {
  $nextCli = Join-Path $irisRoot "node_modules\next\dist\bin\next"
  $irisProcess = Start-Process `
    -FilePath $node `
    -ArgumentList @($nextCli, "start", "--hostname", "127.0.0.1", "--port", "3000") `
    -WorkingDirectory $irisRoot `
    -RedirectStandardOutput (Join-Path $logRoot "iris.out.log") `
    -RedirectStandardError (Join-Path $logRoot "iris.err.log") `
    -WindowStyle Hidden `
    -PassThru
  $servicePids.iris = $irisProcess.Id
}

$servicePids | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "[5/7] Waiting for dependencies"
Wait-Endpoint "http://127.0.0.1:8000/health/ready" "SQLite state service"
Wait-Endpoint "http://127.0.0.1:4100/health/ready" "TraceTutor API" 90

Write-Host "[6/7] Checking active question bank"
$activeCount = & $psql `
  "--host=127.0.0.1" `
  "--port=$pgsqlPort" `
  "--username=tracetutor_app" `
  "--dbname=tracetutor" `
  "--tuples-only" `
  "--no-align" `
  "--command=SELECT count(*) FROM question_asset WHERE status='active' AND is_public"
if ($LASTEXITCODE -ne 0) {
  throw "Could not read the active TraceTutor question count."
}
$activeCount = [int](($activeCount | Out-String).Trim())
if ($activeCount -eq 0 -and -not $SkipQuestionImport) {
  Push-Location $apiRoot
  try {
    Invoke-Native $npm `
      "run" `
      "questions:import" `
      "--" `
      "--file" `
      (Join-Path $projectRoot "db\pgsql\question-bank\approved-initial-batch-2026-07-30.jsonl") `
      "--batch-name" `
      "TraceTutor approved initial question bank" `
      "--batch-key" `
      "tracetutor-curated-15ab68105feb44acc3f89caa" `
      "--activate-approved-manifest" `
      (Join-Path $projectRoot "db\pgsql\question-bank\approved-initial-batch-2026-07-30.manifest.json")
  } finally {
    Pop-Location
  }
  $activeCount = & $psql `
    "--host=127.0.0.1" `
    "--port=$pgsqlPort" `
    "--username=tracetutor_app" `
    "--dbname=tracetutor" `
    "--tuples-only" `
    "--no-align" `
    "--command=SELECT count(*) FROM question_asset WHERE status='active' AND is_public"
  $activeCount = [int](($activeCount | Out-String).Trim())
}
if ($activeCount -lt 1) {
  throw "The question bank has no active questions."
}

Write-Host "[7/7] Checking Iris"
Wait-Endpoint "http://127.0.0.1:3000" "Iris"

Write-Host ""
Write-Host "TraceTutor is ready."
Write-Host "Iris: http://127.0.0.1:3000"
Write-Host "API:  http://127.0.0.1:4100"
Write-Host "Bank:  $activeCount active questions"
Write-Host "Stop:  .\stop-local.cmd"
