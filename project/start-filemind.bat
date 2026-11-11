@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0.filemind\runtime\node.exe" (
  echo Portable Node runtime is missing. Copy the entire prepared FileMind folder.
  pause
  exit /b 1
)
"%~dp0.filemind\runtime\node.exe" "%~dp0scripts\portable-start.mjs"
if errorlevel 1 pause
