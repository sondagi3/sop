@echo off
set "LOG_FILE=C:\Users\kiosk\Desktop\kiosk_log.txt"
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "URL=https://bm3demos.com/2025-games/katana-fruit-portrait/"

echo [INFO] Script started at %date% %time% >> "%LOG_FILE%"

echo Step 1 of 6: Waiting a few seconds before starting the Kiosk...
timeout /t 30 /nobreak > nul
echo [INFO] Waited for 30 seconds before starting the kiosk. >> "%LOG_FILE%"

echo Step 2 of 6: Checking if Chrome is installed...
if not exist "%CHROME_PATH%" (
    echo [ERROR] Chrome not found at "%CHROME_PATH%". Please install Chrome first. >> "%LOG_FILE%"
    echo Chrome is not installed. Exiting script.
    exit /b
)

echo Step 3 of 6: Setting up our tools by killing Explorer to lock the system...
taskkill /IM explorer.exe /F > nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Explorer process may not have been running. >> "%LOG_FILE%"
) else (
    echo [INFO] Explorer process killed. >> "%LOG_FILE%"
)

echo Step 4 of 6: Waiting a few seconds before killing any existing Chrome tasks...
timeout /t 10 /nobreak > nul
echo [INFO] Waited for 10 seconds before closing Chrome. >> "%LOG_FILE%"

echo Step 5 of 6: Killing the browser (Chrome) gracefully to avoid session restore...
taskkill /IM chrome.exe /F > nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Chrome process may not have been running. >> "%LOG_FILE%"
) else (
    echo [INFO] Chrome process killed. >> "%LOG_FILE%"
)

echo Step 6 of 6: Checking internet connectivity before launching Chrome...
ping -n 1 8.8.8.8 > nul
if %errorlevel% neq 0 (
    echo [ERROR] No internet connection detected. Exiting script. >> "%LOG_FILE%"
    echo No internet connection. Exiting script.
    exit /b
)
echo [INFO] Internet connection is available. Proceeding to launch Chrome in kiosk mode. >> "%LOG_FILE%"

echo Final Step: Starting Chrome in Kiosk Mode and launching the website...
start "" "%CHROME_PATH%" --kiosk "%URL%"
echo [INFO] Chrome launched in kiosk mode with URL: %URL% >> "%LOG_FILE%"

exit
