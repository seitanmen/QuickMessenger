@echo off

REM Build script for Windows
echo Building QuickMessenger for Windows...

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Build for Windows
echo Building Windows application...
npm run dist -- --win
npm run build-server

echo Build completed! Check the 'dist' folder for the Windows application.