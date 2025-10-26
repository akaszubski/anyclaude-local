#!/bin/bash

# Capture Tool Call Debug Script
# This script helps identify "Invalid tool parameters" errors by capturing detailed tool call logs

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Tool Call Debug Capture (TRACE Level 3)             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Clean up old logs
rm -f /tmp/tool-call-debug-*.log

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STDOUT_LOG="/tmp/tool-call-debug-stdout-${TIMESTAMP}.log"
STDERR_LOG="/tmp/tool-call-debug-stderr-${TIMESTAMP}.log"

echo "📋 Logs will be saved to:"
echo "   stdout: $STDOUT_LOG"
echo "   stderr: $STDERR_LOG"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting anyclaude with TRACE debug logging (level 3)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start anyclaude in background with full trace logging
ANYCLAUDE_DEBUG=3 anyclaude > "$STDOUT_LOG" 2> "$STDERR_LOG" &
ANYCLAUDE_PID=$!

echo "✓ anyclaude started (PID: $ANYCLAUDE_PID)"
echo ""

# Wait for startup
echo "⏳ Waiting 5 seconds for startup..."
sleep 5

# Check if still running
if ! kill -0 $ANYCLAUDE_PID 2>/dev/null; then
  echo "❌ anyclaude failed to start!"
  echo ""
  echo "Last 20 lines of stderr:"
  tail -20 "$STDERR_LOG"
  exit 1
fi

echo "✓ anyclaude is running"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Instructions:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "anyclaude is running with full debug logging in a separate window."
echo ""
echo "Now, in a NEW terminal window, run anyclaude interactively:"
echo ""
echo "  anyclaude"
echo ""
echo "Then trigger a tool call that causes 'Invalid tool parameters'"
echo ""
echo "Example prompts:"
echo "  - 'Read the README.md file'"
echo "  - 'Check the GitHub issues for this repo'"
echo "  - 'List all TypeScript files in src/'"
echo ""
echo "When you're done testing, press Ctrl+C here to analyze the logs."
echo ""
echo "Waiting for tool calls (watching log file)..."
echo ""

# Monitor log file for tool calls
LAST_SIZE=0
while true; do
  if [ -f "$STDERR_LOG" ]; then
    CURRENT_SIZE=$(wc -l < "$STDERR_LOG" 2>/dev/null || echo "0")
    if [ "$CURRENT_SIZE" -gt "$LAST_SIZE" ]; then
      # Check if we got tool calls
      TOOL_CALL_COUNT=$(grep -c "\[Tool Call\]" "$STDERR_LOG" 2>/dev/null || echo "0")
      if [ "$TOOL_CALL_COUNT" -gt 0 ]; then
        echo "✓ Detected $TOOL_CALL_COUNT tool call(s)!"
      fi
      LAST_SIZE=$CURRENT_SIZE
    fi
  fi
  sleep 2
done

# This will be interrupted by Ctrl+C
trap "echo ''; echo '🛑 Stopping anyclaude...'; kill $ANYCLAUDE_PID 2>/dev/null || true" INT
wait $ANYCLAUDE_PID 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Analyzing Logs..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Count tool-related log entries
TOOL_SCHEMAS=$(grep -c "\[Tools\] Claude Code sent" "$STDERR_LOG" 2>/dev/null || echo "0")
TOOL_CALLS=$(grep -c "\[Tool Call\] Model called tool:" "$STDERR_LOG" 2>/dev/null || echo "0")
SSE_TOOL_EVENTS=$(grep -c "\[SSE → Claude Code\] Writing tool_use event:" "$STDERR_LOG" 2>/dev/null || echo "0")

echo "📈 Summary:"
echo "   Tool schemas received: $TOOL_SCHEMAS"
echo "   Tool calls made: $TOOL_CALLS"
echo "   SSE tool_use events sent: $SSE_TOOL_EVENTS"
echo ""

if [ "$TOOL_CALLS" -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 Tool Call Details:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Extract and display tool call details
  grep -A 5 "\[Tool Call\]" "$STDERR_LOG" | head -50

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 SSE Events Sent to Claude Code:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  grep -A 10 "\[SSE → Claude Code\]" "$STDERR_LOG" | head -50
else
  echo "⚠️  No tool calls were captured."
  echo ""
  echo "This could mean:"
  echo "  1. The model didn't attempt any tool calls"
  echo "  2. The tool calls happened before logging started"
  echo "  3. The model doesn't support tool calling"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 Full logs available at:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   stdout: $STDOUT_LOG"
echo "   stderr: $STDERR_LOG"
echo ""
echo "To view full stderr log:"
echo "   less $STDERR_LOG"
echo ""
echo "To extract all tool calls:"
echo "   grep -A 10 '\[Tool Call\]' $STDERR_LOG"
echo ""
echo "To extract all SSE events:"
echo "   grep -A 10 '\[SSE → Claude Code\]' $STDERR_LOG"
echo ""
