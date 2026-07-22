@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist ".env.local" (
  copy ".env.local.example" ".env.local" >nul
  echo Created .env.local from example.
  echo Please update DATABASE_URL in .env.local, then run this script again.
  pause
  exit /b 0
)

if not exist ".env" (
  copy ".env.local" ".env" >nul
)

echo Running database migrations...
call npm run db-migrate
if errorlevel 1 (
  echo Migration failed. Check DATABASE_URL and Postgres status.
  pause
  exit /b 1
)

echo Starting app...
call npm run chat
