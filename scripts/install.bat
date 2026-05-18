@echo off
setlocal enabledelayedexpansion

set HOST_NAME=com.localtextsearch.host
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set HOST_DIR=%PROJECT_DIR%\native-host
set CHROME_HOST_DIR=%LOCALAPPDATA%\Google\Chrome\NativeMessagingHosts

echo ============================================
echo  Local Text Search - Native Host Installer
echo ============================================
echo.
echo This script registers the Native Messaging Host
echo for the Local Text Search Chrome extension.
echo.

REM Check Chrome NativeMessagingHosts directory
if not exist "%CHROME_HOST_DIR%" (
    echo Creating directory: %CHROME_HOST_DIR%
    mkdir "%CHROME_HOST_DIR%"
)

REM Generate the native manifest with absolute paths
set "MANIFEST_PATH=%CHROME_HOST_DIR%\%HOST_NAME%.json"

REM Use the batch wrapper as the host path
set "HOST_BAT_PATH=%HOST_DIR%\host.bat"

echo Generating manifest: %MANIFEST_PATH%
(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "Native host for Local Text Search Chrome extension",
echo   "path": "%HOST_BAT_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": []
echo }
) > "%MANIFEST_PATH%"

echo.
echo [SUCCESS] Native messaging host registered!
echo.
echo Next steps:
echo  1. Open Chrome and go to chrome://extensions
echo  2. Enable "Developer mode" (toggle in top-right)
echo  3. Click "Load unpacked"
echo  4. Select the extension folder:
echo     %PROJECT_DIR%\extension
echo.
echo Note: After loading the extension, update the manifest
echo at %MANIFEST_PATH%
echo to include the extension ID in "allowed_origins":
echo   "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
echo.
echo You can find your extension ID on chrome://extensions page.
echo.

pause
