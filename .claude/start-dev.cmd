@echo off
rem Launcher for this working copy's Vite dev server (used by .claude/launch.json).
rem
rem Every path here is quoted, and the project directory is set once into a
rem variable. That is not tidiness: this folder is
rem   ...\NowOpen Africa - (OpenCode) - Claude - edit
rem and an unquoted path reaching cmd fails on the bare "-" with
rem "- was unexpected at this time.", which reads like a broken build rather
rem than a quoting problem. Invoking bare "npm" from launch.json hit exactly that.
rem
rem The long path is used deliberately so vite's file watcher doesn't trip the
rem libuv short-path assertion bug on Windows.
set "PATH=C:\Program Files\nodejs;%PATH%"
set "PROJDIR=%~dp0.."
cd /d "%PROJDIR%"
if errorlevel 1 goto :missing
rem vite.config reads PORT, so the server lands where launch.json expects it
rem instead of drifting to whichever port happens to be free.
set "PORT=5180"
call "C:\Program Files\nodejs\npm.cmd" run dev
goto :eof

:missing
echo(
echo ERROR: project directory not found:
echo   %PROJDIR%
exit /b 1
