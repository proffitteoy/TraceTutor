@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "CHECK_ONLY="
set "FORCE_GENERATE="
if /I "%~1"=="--check" set "CHECK_ONLY=1"
if /I "%~1"=="--regen" set "FORCE_GENERATE=1"

echo.
echo ==================================
echo   鸢尾花终端 Local Startup Script
echo ==================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ first.
  goto :fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Please verify your Node.js installation.
  goto :fail
)

if not exist ".env.local" (
  if exist ".env.local.example" (
    echo [INIT] .env.local not found, creating from template...
    copy /y ".env.local.example" ".env.local" >nul
    echo [INFO] .env.local created. Fill DATABASE_URL and API keys, then run again.
    goto :pause_exit
  ) else (
    echo [ERROR] .env.local.example not found. Cannot auto-create .env.local.
    goto :fail
  )
)

copy /y ".env.local" ".env" >nul

if not exist "node_modules" (
  echo [1/4] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :fail
) else (
  echo [1/4] node_modules found, skipping install.
)

if defined FORCE_GENERATE (
  echo [2/4] Regenerating Prisma client...
  call npx.cmd prisma generate
  if errorlevel 1 (
    if exist "node_modules\.prisma\client\index.js" (
      echo [WARN] Prisma generate failed, but existing client was found. Continuing...
    ) else (
      goto :fail
    )
  )
) else (
  if exist "node_modules\.prisma\client\index.js" (
    echo [2/4] Prisma client found, skipping generate.
  ) else (
    echo [2/4] Prisma client missing, generating...
    call npx.cmd prisma generate
    if errorlevel 1 goto :fail
  )
)

echo [3/4] Running database migrations...
call npx.cmd prisma migrate deploy
if errorlevel 1 (
  echo [INFO] migrate deploy failed. Trying development migration mode...
  call npm.cmd run db-migrate
  if errorlevel 1 goto :fail
)

if defined CHECK_ONLY (
  echo [4/4] Check mode complete. Startup skipped.
  goto :success
)

echo [4/4] Starting dev server at http://localhost:3000
echo.
call npm.cmd run dev
goto :success

:pause_exit
echo.
if defined CHECK_ONLY exit /b 0
pause
exit /b 0

:fail
echo.
echo [FAILED] Startup aborted. Please review logs above and retry.
if defined CHECK_ONLY exit /b 1
pause
exit /b 1

:success
exit /b 0
