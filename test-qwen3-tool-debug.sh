#!/bin/bash

echo "========================================="
echo "Qwen3-Coder Tool Call Diagnostic Test"
echo "========================================="
echo ""
echo "This will show us EXACTLY what qwen3 is sending"
echo "for tool calls, which will tell us how to fix it."
echo ""
echo "Make sure qwen3-coder-30b is loaded in LMStudio!"
echo ""
echo "Starting in 3 seconds..."
sleep 3

# Run with debug level 1 - shows our diagnostic logs
ANYCLAUDE_DEBUG=1 anyclaude 2>&1 | tee /tmp/qwen3-tool-diagnostic.log

echo ""
echo "========================================="
echo "Test complete. Analyzing results..."
echo "========================================="
echo ""

# Extract the tool call debug info
echo "=== Tool Call Diagnostics ==="
grep "\[Tool Call Debug\]\|\[Tool Call\] ⚠️" /tmp/qwen3-tool-diagnostic.log

echo ""
echo "Full log saved to: /tmp/qwen3-tool-diagnostic.log"
