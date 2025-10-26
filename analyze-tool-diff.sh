#!/bin/bash

# Analyze differences between working and broken tool calls

WORKING_LOG="/tmp/tool-debug-tongyi.log"
BROKEN_LOG="/tmp/tool-debug-qwen3.log"

echo "========================================="
echo "Tool Call Comparison Analysis"
echo "========================================="
echo ""

if [ ! -f "$WORKING_LOG" ]; then
    echo "ERROR: Missing $WORKING_LOG"
    echo "Run: ./diagnose-tool-calls.sh tongyi"
    exit 1
fi

if [ ! -f "$BROKEN_LOG" ]; then
    echo "ERROR: Missing $BROKEN_LOG"
    echo "Run: ./diagnose-tool-calls.sh qwen3"
    exit 1
fi

echo "=== TONGYI (WORKING) - Tool Call Format ==="
echo ""
grep -A 20 "tool-call\|tool-input-start" "$WORKING_LOG" | grep -A 15 "Read" | head -30
echo ""
echo ""

echo "=== QWEN3 (BROKEN) - Tool Call Format ==="
echo ""
grep -A 20 "tool-call\|tool-input-start" "$BROKEN_LOG" | grep -A 15 "Read" | head -30
echo ""
echo ""

echo "=== TONGYI - Full Tool Call Chunks ==="
echo ""
grep "Tool Call\|Tool Input" "$WORKING_LOG" | head -20
echo ""
echo ""

echo "=== QWEN3 - Full Tool Call Chunks ==="
echo ""
grep "Tool Call\|Tool Input" "$BROKEN_LOG" | head -20
echo ""
echo ""

echo "=== ERRORS (if any) ==="
echo ""
echo "Tongyi errors:"
grep -i "error" "$WORKING_LOG" | head -5
echo ""
echo "Qwen3 errors:"
grep -i "error" "$BROKEN_LOG" | head -5
echo ""

echo "========================================="
echo "Analysis complete. Check differences above."
echo "========================================="
