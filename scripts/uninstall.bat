@echo off
setlocal

set HOST_NAME=com.localtextsearch.host
set CHROME_HOST_DIR=%LOCALAPPDATA%\Google\Chrome\NativeMessagingHosts
set MANIFEST_PATH=%CHROME_HOST_DIR%\%HOST_NAME%.json

echo ============================================
echo  Local Text Search - Native Host Uninstaller
echo ============================================
echo.

if exist "%MANIFEST_PATH%" (
    del "%MANIFEST_PATH%"
    echo [SUCCESS] Native messaging host unregistered.
) else (
    echo [INFO] Native messaging host is not registered.
)

echo.
echo To remove the extension:
echo  1. Open Chrome and go to chrome://extensions
echo  2. Find "Local Text Search" and click "Remove"
echo.

pause
