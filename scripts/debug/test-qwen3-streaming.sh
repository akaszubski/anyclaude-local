#!/bin/bash
# Test qwen3 streaming with both LMStudio raw SSE and AI SDK chunk logging

echo "Testing qwen3-coder tool calling with detailed logging..."
echo ""
echo "This will show:"
echo "1. [LMStudio → Raw SSE] - What LMStudio actually sends"
echo "2. [Stream Conversion] - What AI SDK gives us"
echo ""

# Create a test prompt that will trigger Read tool
# Run in background and capture output
echo "Read the README.md file" | ANYCLAUDE_DEBUG=1 ./dist/main-cli.js --print 2>&1 &
PID=$!

# Wait up to 10 seconds
sleep 10

# Kill if still running
kill $PID 2>/dev/null || true

echo ""
echo "Test completed."
