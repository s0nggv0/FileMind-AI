@echo off
setlocal
cd /d "%~dp0"
"%~dp0.filemind\runtime\node.exe" "%~dp0scripts\portable-start.mjs" --stop
if errorlevel 1 pause
