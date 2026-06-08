# AbacusExam Demo Startup Script
# Usage: Run as Administrator
# .\run-demo.ps1
#
# This script will:
# 1. Check/install dependencies
# 2. Start the Express server (port 4000)
# 3. Start the Vite dev server (port 5173)
# 4. Open browser to http://localhost:5173

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         AbacusExam Demo - Automated Startup Script             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify Node.js is installed
Write-Host "[1/4] Checking Node.js installation..." -ForegroundColor Yellow
$nodeCheck = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js $nodeCheck found" -ForegroundColor Green
Write-Host ""

# Step 2: Copy .env.demo to .env if not exists
Write-Host "[2/4] Configuring environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.demo") {
        Copy-Item -Path ".env.demo" -Destination ".env"
        Write-Host "✓ Created .env from .env.demo" -ForegroundColor Green
    }
} else {
    Write-Host "✓ .env already exists (using existing config)" -ForegroundColor Green
}
Write-Host ""

# Step 3: Install dependencies if needed
Write-Host "[3/4] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing npm packages (this may take a minute)..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ npm install failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✓ Dependencies already installed" -ForegroundColor Green
}
Write-Host ""

# Step 4: Create server/uploads directory if missing
Write-Host "[4/4] Preparing server storage..." -ForegroundColor Yellow
if (-not (Test-Path "server/uploads")) {
    New-Item -ItemType Directory -Path "server/uploads" -Force | Out-Null
    Write-Host "✓ Created server/uploads/ directory" -ForegroundColor Green
} else {
    Write-Host "✓ server/uploads/ directory ready" -ForegroundColor Green
}
Write-Host ""

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Starting services..." -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Start the server in a new window
Write-Host "→ Starting Express server on http://localhost:4000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run server" -WindowStyle Normal

# Wait a bit for server to start
Start-Sleep -Seconds 2

# Start the dev server in a new window
Write-Host "→ Starting Vite dev server on http://localhost:5173" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev" -WindowStyle Normal

# Wait for dev server to start
Start-Sleep -Seconds 3

# Open browser
Write-Host "→ Opening browser to http://localhost:5173" -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✓ Demo ready! Browser should open automatically." -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "QUICK FLOW:" -ForegroundColor Yellow
Write-Host "  1. Register tab → Demo Teacher button → Create Account" -ForegroundColor Gray
Write-Host "  2. Logout → Register tab → Demo Student button → Create Account" -ForegroundColor Gray
Write-Host "  3. Login as student → Practice/Exam → Record → Finish" -ForegroundColor Gray
Write-Host "  4. Login as teacher → Results tab → Click Play to watch recording" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop demo:" -ForegroundColor Yellow
Write-Host "  - Close both terminal windows" -ForegroundColor Gray
Write-Host "  - Or press Ctrl+C in each window" -ForegroundColor Gray
Write-Host ""
