@echo off
cd /d %~dp0

REM Find Node.js
set "NODE_EXE="
set "NPM_EXE="

if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    set "NPM_EXE=C:\Program Files\nodejs\npm.cmd"
    goto :found
)

if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
    set "NPM_EXE=C:\Program Files (x86)\nodejs\npm.cmd"
    goto :found
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    set "NPM_EXE=%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
    goto :found
)

REM Check if npm is in PATH
npm --version >nul 2>&1
if %ERRORLEVEL% EQU 0 goto :found

echo.
echo ERROR: Node.js not found!
echo.
echo Please install Node.js from https://nodejs.org/
echo Then RESTART YOUR COMPUTER and try again.
echo.
pause
exit /b 1

:found
REM Always check and install/update dependencies
echo Checking dependencies...
if defined NPM_EXE (
    call "%NPM_EXE%" install
) else (
    call npm install
)
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)
echo Dependencies are up to date.
echo.

REM Build Electron main process
echo Building Electron main process...
echo.
if defined NPM_EXE (
    call "%NPM_EXE%" run build:electron
) else (
    call npm run build:electron
)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to build Electron!
    echo Make sure all dependencies are installed: npm install
    pause
    exit /b 1
)

REM Start Electron in dev mode
echo Starting Electron desktop app...
echo.
if defined NPM_EXE (
    call "%NPM_EXE%" run electron:dev
) else (
    call npm run electron:dev
)

