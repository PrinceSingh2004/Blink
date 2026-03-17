@echo off
echo.
echo 🚀 Starting Blink Platform...
echo.

:: 1. Force kill any process running on port 4000 (Prevents EADDRINUSE error)
echo [1/3] Checking for existing servers on port 4000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do (
    echo Terminating old server (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Ensure MySQL is likely running (Reminder)
echo [2/3] Reminder: Make sure your MySQL (XAMPP/Workbench) is running!

:: 3. Start the application
echo [3/3] Launching Backend...
echo.
npm run dev
pause
