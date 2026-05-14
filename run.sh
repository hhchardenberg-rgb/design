#!/bin/bash
# Simple server starter for macOS/Linux

cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   HHC Social Media Image Generator                    ║"
echo "║   Starting server...                                  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Try Python first (most likely available)
if command -v python3 &> /dev/null; then
    echo "✓ Using Python 3"
    python3 server.py
    exit 0
fi

if command -v python &> /dev/null; then
    echo "✓ Using Python"
    python server.py
    exit 0
fi

# Try Node.js
if command -v npx &> /dev/null; then
    echo "✓ Using Node.js http-server"
    npx http-server dist -p 8000 -c-1
    exit 0
fi

echo "❌ Error: No Python or Node.js found"
echo ""
echo "Please install one of:"
echo "  • Python 3: https://www.python.org"
echo "  • Node.js: https://nodejs.org"
exit 1
