@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1" %*
if errorlevel 1 (
  echo.
  echo TraceTutor stop failed.
  pause
  exit /b 1
)
endlocal
