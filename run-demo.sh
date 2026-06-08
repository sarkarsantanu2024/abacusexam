#!/bin/bash

# AbacusExam Demo Startup Script for macOS/Linux
# Usage: chmod +x run-demo.sh && ./run-demo.sh
#
# This script will:
# 1. Check/install dependencies
# 2. Start the Express server (port 4000)
# 3. Start the Vite dev server (port 5173)
# 4. Open browser to http://localhost:5173

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         AbacusExam Demo - Automated Startup Script             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Verify Node.js is installed
echo "[1/4] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found. Please install Node.js first."
    exit 1
fi
NODE_VERSION=$(node --version)
echo "✓ Node.js $NODE_VERSION found"
echo ""

# Step 2: Copy .env.demo to .env if not exists
echo "[2/4] Configuring environment..."
if [ ! -f ".env" ]; then
    if [ -f ".env.demo" ]; then
        cp .env.demo .env
        echo "✓ Created .env from .env.demo"
    fi
else
    echo "✓ .env already exists (using existing config)"
fi
echo ""

# Step 3: Install dependencies if needed
echo "[3/4] Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing npm packages (this may take a minute)..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ npm install failed"
        exit 1
    fi
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed"
fi
echo ""

# Step 4: Create server/uploads directory if missing
echo "[4/4] Preparing server storage..."
if [ ! -d "server/uploads" ]; then
    mkdir -p server/uploads
    echo "✓ Created server/uploads/ directory"
else
    echo "✓ server/uploads/ directory ready"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "Starting services..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# Start the server in the background
echo "→ Starting Express server on http://localhost:4000"
npm run server &
SERVER_PID=$!

# Wait a bit for server to start
sleep 2

# Start the dev server in the background
echo "→ Starting Vite dev server on http://localhost:5173"
npm run dev &
DEV_PID=$!

# Wait for dev server to start
sleep 3

# Open browser
echo "→ Opening browser to http://localhost:5173"
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:5173"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:5173"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ Demo ready! Browser should open automatically."
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "QUICK FLOW:"
echo "  1. Register tab → Demo Teacher button → Create Account"
echo "  2. Logout → Register tab → Demo Student button → Create Account"
echo "  3. Login as student → Practice/Exam → Record → Finish"
echo "  4. Login as teacher → Results tab → Click Play to watch recording"
echo ""
echo "To stop demo:"
echo "  - Press Ctrl+C in this terminal"
echo "  - Both server and dev server will stop"
echo ""

# Wait for user interrupt
trap "kill $SERVER_PID $DEV_PID 2>/dev/null; echo ''; echo 'Demo stopped.'; exit" INT

wait
