#!/bin/bash

# Script to compare Claude vs LMStudio tool calling behavior
# Usage: ./compare-modes.sh "your prompt here"

PROMPT="${1:-Read the README.md file}"

echo "════════════════════════════════════════════════════════════════"
echo "Tool Call Comparison: Claude API vs LMStudio"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Prompt: $PROMPT"
echo ""
echo "This script will:"
echo "  1. Run anyclaude in Claude mode (real Claude API)"
echo "  2. Run anyclaude in LMStudio mode (local model)"
echo "  3. Extract and compare tool calls from both runs"
echo ""
echo "Press Enter to start..."
read

# Clean up old logs
rm -f /tmp/claude-comparison.log /tmp/lmstudio-comparison.log

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 1: Testing with Real Claude API"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Starting anyclaude in Claude mode..."
echo "When Claude Code starts, type: $PROMPT"
echo ""
echo "Press Ctrl+C after the response completes to continue."
echo ""

ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/claude-comparison.log

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 2: Testing with LMStudio"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Starting anyclaude in LMStudio mode..."
echo "When Claude Code starts, type the SAME prompt: $PROMPT"
echo ""
echo "Press Ctrl+C after the response completes to continue."
echo ""

ANYCLAUDE_MODE=lmstudio ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/lmstudio-comparison.log

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Step 3: Comparison Results"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Extract tool schemas
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Tool Schemas Comparison"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CLAUDE_TOOLS=$(grep -c "\[Claude Mode Tool" /tmp/claude-comparison.log 2>/dev/null || echo "0")
LMSTUDIO_TOOLS=$(grep -c "\[Tool [0-9]*/[0-9]*\]" /tmp/lmstudio-comparison.log 2>/dev/null || echo "0")

echo "Claude Mode:    $CLAUDE_TOOLS tools"
echo "LMStudio Mode:  $LMSTUDIO_TOOLS tools"
echo ""

if [ "$CLAUDE_TOOLS" != "$LMSTUDIO_TOOLS" ]; then
  echo "⚠️  WARNING: Different number of tools!"
  echo ""
fi

# Extract tool calls
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Tool Calls Made by Models"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CLAUDE_CALLS=$(grep -c "\[Claude API → Tool Call\]" /tmp/claude-comparison.log 2>/dev/null || echo "0")
LMSTUDIO_CALLS=$(grep -c "\[Tool Call\] Model called tool:" /tmp/lmstudio-comparison.log 2>/dev/null || echo "0")

echo "Claude API:     $CLAUDE_CALLS tool calls"
echo "LMStudio Model: $LMSTUDIO_CALLS tool calls"
echo ""

if [ "$CLAUDE_CALLS" -gt 0 ]; then
  echo "Claude API Tool Calls:"
  grep -A 5 "\[Claude API → Tool Call\]" /tmp/claude-comparison.log
  echo ""
fi

if [ "$LMSTUDIO_CALLS" -gt 0 ]; then
  echo "LMStudio Model Tool Calls:"
  grep -A 5 "\[Tool Call\] Model called tool:" /tmp/lmstudio-comparison.log
  echo ""
fi

# Show detailed comparison if both made tool calls
if [ "$CLAUDE_CALLS" -gt 0 ] && [ "$LMSTUDIO_CALLS" -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Side-by-Side Comparison"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  echo "Extracting tool call details..."
  grep -A 8 "\[Claude API → Tool Call\]" /tmp/claude-comparison.log > /tmp/claude-calls.txt
  grep -A 8 "\[Tool Call\] Model called tool:" /tmp/lmstudio-comparison.log > /tmp/lmstudio-calls.txt

  echo ""
  echo "Differences (if any):"
  diff -u /tmp/claude-calls.txt /tmp/lmstudio-calls.txt || echo "Tool calls differ!"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 Full Logs Available At:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Claude mode:    /tmp/claude-comparison.log"
echo "  LMStudio mode:  /tmp/lmstudio-comparison.log"
echo ""
echo "View with: less /tmp/claude-comparison.log"
echo "           less /tmp/lmstudio-comparison.log"
echo ""
