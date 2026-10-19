@echo off
setlocal
cd /d "%~dp0"
set "BUSANGI_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUSANGI_NODE%" (
  "%BUSANGI_NODE%" market-server.cjs
) else (
  node market-server.cjs
)
echo.
pause
