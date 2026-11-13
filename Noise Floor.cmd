@echo off
rem Starts Noise Floor and opens it in the browser. Close this window to stop it.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm start
