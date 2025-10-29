#!/bin/bash

# Diagnostic script to compare tool calling between models

MODEL_NAME=$1
if [ -z "$MODEL_NAME" ]; then
    echo "Usage: ./diagnose-tool-calls.sh <model-name>"
    echo "Example: ./diagnose-tool-calls.sh tongyi"
    exit 1
fi

LOG_FILE="/tmp/tool-debug-${MODEL_NAME}.log"

echo "========================================="
echo "Tool Call Diagnostics for: $MODEL_NAME"
echo "========================================="
echo ""
echo "1. Make sure $MODEL_NAME is loaded in LMStudio"
echo "2. Starting anyclaude with debug logging..."
echo "3. Log file: $LOG_FILE"
echo ""
echo "When Claude Code starts, type: Read README.md"
echo "Wait for response (or error), then press Ctrl+C"
echo ""
echo "Starting in 3 seconds..."
sleep 3

# Run anyclaude with trace logging
ANYCLAUDE_DEBUG=3 anyclaude 2>&1 | tee "$LOG_FILE"
