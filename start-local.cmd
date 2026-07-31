@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
if errorlevel 1 (
  echo.
  echo TraceTutor start failed. Check runtime\logs for details.
  pause
  exit /b 1
)
endlocal
