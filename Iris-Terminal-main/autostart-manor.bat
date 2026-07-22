@echo off
setlocal EnableExtensions

rem Unicode path encoded as UTF-16LE Base64 to avoid cmd codepage issues.
set "APP_BAT_B64=RAA6AFwAIp4+XLGCyH7velwAcwB0AGEAcgB0AC0AbQBhAG4AbwByAC4AYgBhAHQA"
set "APP_ARGS=%*"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('%APP_BAT_B64%')); " ^
  "if(-not (Test-Path -LiteralPath $p)){Write-Host ('[ERROR] File not found: ' + $p); exit 1}; " ^
  "$wd=Split-Path -Path $p -Parent; " ^
  "if([string]::IsNullOrWhiteSpace($env:APP_ARGS)){Start-Process -FilePath $p -WorkingDirectory $wd} else {Start-Process -FilePath $p -WorkingDirectory $wd -ArgumentList $env:APP_ARGS}"

if errorlevel 1 (
  echo [FAILED] autostart-manor.bat failed.
  pause
  exit /b 1
)

exit /b 0
