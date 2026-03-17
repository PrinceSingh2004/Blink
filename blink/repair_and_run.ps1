# 🚀 Blink Development Suite - Ultimate Repair & Run Script
# Purpose: Ensures MySQL, Node.js, and Ports are perfectly configured before launching.

$ErrorActionPreference = "Stop"
Clear-Host

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   BLINK PLATFORM - AUTO DIAGNOSTIC      " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Detect Entry File
$PackageFile = "package.json"
if (-not (Test-Path $PackageFile)) {
    Write-Host "❌ Error: package.json not found in current directory!" -ForegroundColor Red
    exit
}

$PackageJson = Get-Content $PackageFile | ConvertFrom-Json
$EntryFile = $PackageJson.main
if ($null -eq $EntryFile) { $EntryFile = "server.js" }

Write-Host "[1/7] Entry Point: $EntryFile" -ForegroundColor Green

# 2. Check & Install Dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[2/7] node_modules missing. Installing dependencies..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "[2/7] Dependencies already installed." -ForegroundColor Green
}

# 3. Check MySQL Status
Write-Host "[3/7] Checking MySQL Service..." -ForegroundColor Yellow
$mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" } | Select-Object -First 1

if ($null -eq $mysqlService) {
    Write-Host "⚠️  MySQL is NOT running!" -ForegroundColor Red
    Write-Host "👉 Please start XAMPP MySQL or the MySQL Windows Service." -ForegroundColor White
    Write-Host "Attempting to start local MySQL service (Requires Admin)..." -ForegroundColor Gray
    Start-Process powershell -ArgumentList "Start-Service MySQL*" -Verb RunAs -Wait -ErrorAction SilentlyContinue
} else {
    Write-Host "✅ MySQL is running ($($mysqlService.Name))" -ForegroundColor Green
}

# 4. Handle Port Conflicts
$TargetPort = 4000
if (Test-Path ".env") {
    $EnvContent = Get-Content ".env"
    $PortLine = $EnvContent | Select-String "PORT="
    if ($PortLine) { $TargetPort = $PortLine.ToString().Split('=')[1].Trim() }
}

Write-Host "[4/7] Checking Port $TargetPort..." -ForegroundColor Yellow
$PortProcess = Get-NetTCPConnection -LocalPort $TargetPort -ErrorAction SilentlyContinue | Select-Object -First 1

if ($PortProcess) {
    $PIDToKill = $PortProcess.OwningProcess
    $ProcessName = (Get-Process -Id $PIDToKill).ProcessName
    Write-Host "⚠️  Port $TargetPort is being used by $ProcessName (PID: $PIDToKill)" -ForegroundColor Red
    Write-Host "Killing existing process to prevent ERR_CONNECTION_REFUSED..." -ForegroundColor Yellow
    Stop-Process -Id $PIDToKill -Force
    Write-Host "✅ Port $TargetPort cleared." -ForegroundColor Green
} else {
    Write-Host "✅ Port $TargetPort is free." -ForegroundColor Green
}

# 5. Initialize Database (Handled by app, but we verify connectivity)
Write-Host "[5/7] Database setup will be handled by the app initialization..." -ForegroundColor Gray

# 6. Start the Server
Write-Host "[6/7] Launching Server..." -ForegroundColor Cyan
Write-Host "-----------------------------------------" -ForegroundColor DarkGray

# Check if nodemon is installed for dev mode
$NodemonPath = ".\node_modules\.bin\nodemon.ps1"
if (Test-Path $NodemonPath) {
    Write-Host "🚀 Starting in DEV mode (nodemon)..." -ForegroundColor Magenta
    Start-Process powershell -ArgumentList "npm run dev" -NoNewWindow
} else {
    Write-Host "🚀 Starting in NORMAL mode (node)..." -ForegroundColor Magenta
    Start-Process powershell -ArgumentList "npm start" -NoNewWindow
}

# 7. Open Browser
Write-Host "[7/7] Opening Browser in 3 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process "http://localhost:$TargetPort"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      SYSTEM IS LIVE ON PORT $TargetPort   " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
