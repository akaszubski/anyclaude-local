#!/bin/bash

# Analyze tool calls from the debug log

STDERR_LOG="/tmp/anyclaude-interactive-stderr.log"

if [ ! -f "$STDERR_LOG" ]; then
  echo "❌ Debug log not found: $STDERR_LOG"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                 Tool Call Analysis                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Count tool-related log entries
TOOL_SCHEMAS=$(grep -c "\[Tools\] Claude Code sent" "$STDERR_LOG" 2>/dev/null || echo "0")
TOOL_CALLS=$(grep -c "\[Tool Call\] Model called tool:" "$STDERR_LOG" 2>/dev/null || echo "0")
SSE_TOOL_EVENTS=$(grep -c "\[SSE → Claude Code\] Writing tool_use event:" "$STDERR_LOG" 2>/dev/null || echo "0")

echo "📈 Summary:"
echo "   Tool schemas received: $TOOL_SCHEMAS"
echo "   Tool calls made by model: $TOOL_CALLS"
echo "   SSE tool_use events sent to Claude Code: $SSE_TOOL_EVENTS"
echo ""

if [ "$TOOL_CALLS" -eq 0 ]; then
  echo "⚠️  No tool calls detected in the log."
  echo ""
  echo "Possible reasons:"
  echo "  1. Model hasn't made any tool calls yet"
  echo "  2. Tool calls happened before debug logging started"
  echo "  3. Model doesn't support tool calling"
  echo ""
  echo "Try triggering a tool call with a prompt like:"
  echo "  'Read the README.md file'"
  echo ""
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Tool Calls Made by Model:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

grep -A 5 "\[Tool Call\] Model called tool:" "$STDERR_LOG"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Events Sent to Claude Code:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

grep -A 10 "\[SSE → Claude Code\] Writing tool_use event:" "$STDERR_LOG"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 Full debug log:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   $STDERR_LOG"
echo ""
echo "Commands:"
echo "   View full log:       less $STDERR_LOG"
echo "   Extract tool calls:  grep -A 10 '\[Tool Call\]' $STDERR_LOG"
echo "   Extract SSE events:  grep -A 10 '\[SSE → Claude Code\]' $STDERR_LOG"
echo ""
