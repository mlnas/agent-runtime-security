#!/bin/bash

# Agent Runtime Security - Setup Script
# This script sets up the demo MVP environment

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Agent Runtime Security - Setup Script                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo "✓ npm version: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
echo ""

echo "→ Root project..."
npm install --silent

echo "→ Core engine..."
cd core && npm install --silent && cd ..

echo "→ Gateway server..."
cd gateway && npm install --silent && cd ..

echo ""
echo "✓ Dependencies installed"
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
echo ""

echo "→ Core engine..."
cd core && npm run build && cd ..

echo "→ Gateway server..."
cd gateway && npm run build && cd ..

echo ""
echo "✓ Build completed"
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Setup Complete! ✅                                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "To start the system:"
echo ""
echo "  1. In one terminal, start the gateway:"
echo "     npm run start:gateway"
echo ""
echo "  2. In another terminal, run the demo:"
echo "     npm run demo"
echo ""
echo "See QUICKSTART.md for more information."
echo ""
