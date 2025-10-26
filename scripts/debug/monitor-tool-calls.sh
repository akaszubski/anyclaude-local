#!/bin/bash

# Monitor tool calls in real-time from existing anyclaude debug logs

STDERR_LOG="/tmp/anyclaude-interactive-stderr.log"

if [ ! -f "$STDERR_LOG" ]; then
  echo "❌ Debug log not found: $STDERR_LOG"
  echo ""
  echo "First, start anyclaude with debug logging:"
  echo "  ANYCLAUDE_DEBUG=3 anyclaude > /tmp/anyclaude-interactive-stdout.log 2> /tmp/anyclaude-interactive-stderr.log &"
  echo ""
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Tool Call Monitor (Real-Time)                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Monitoring: $STDERR_LOG"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Watching for tool calls... (Press Ctrl+C to stop and analyze)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show real-time tool calls
tail -f "$STDERR_LOG" | grep --line-buffered -E "\[Tool Call\]|\[SSE → Claude Code\]" &
TAIL_PID=$!

# Cleanup on exit
trap "kill $TAIL_PID 2>/dev/null; echo ''; echo '🛑 Stopped monitoring'; echo ''; ./analyze-tool-calls.sh" INT

wait $TAIL_PID 2>/dev/null
