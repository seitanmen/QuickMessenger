#!/bin/bash

# Build script for macOS
echo "Building QuickMessenger for macOS..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build for macOS
echo "Building macOS application..."
npm run dist -- --mac

echo "Build completed! Check the 'dist' folder for the macOS application."