#!/bin/bash
# Test script to capture Claude Code tool calls

set -e

echo "🧪 Capturing Claude Code Tool Calls"
echo ""

# Clean old traces
echo "1️⃣  Cleaning old traces..."
rm -rf ~/.anyclaude/traces/claude/*
echo "   ✅ Cleaned"
echo ""

# Start anyclaude in Claude mode and send test prompt
echo "2️⃣  Starting Claude mode with trace logging..."
echo "   Sending prompt: 'Read the README.md file'"
echo ""

# Run Claude Code with a simple tool-using prompt
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude << 'EOF' 2> /tmp/claude-tool-test.log
Read the README.md file and tell me what this project does
/exit
EOF

echo ""
echo "3️⃣  Analyzing captured traces..."
echo ""

# Count traces
TRACE_COUNT=$(ls -1 ~/.anyclaude/traces/claude/ 2>/dev/null | wc -l | tr -d ' ')
echo "   📝 Captured $TRACE_COUNT trace file(s)"
echo ""

if [ $TRACE_COUNT -eq 0 ]; then
  echo "   ❌ No traces captured!"
  echo "   Check /tmp/claude-tool-test.log for errors"
  exit 1
fi

# Find traces with tool calls
echo "4️⃣  Looking for tool calls in traces..."
echo ""

for trace in $(ls -t ~/.anyclaude/traces/claude/); do
  echo "   📄 $trace"

  # Check for tool definitions (request)
  TOOL_COUNT=$(cat ~/.anyclaude/traces/claude/$trace | jq '.request.body.tools // [] | length' 2>/dev/null || echo "0")
  if [ "$TOOL_COUNT" != "0" ] && [ "$TOOL_COUNT" != "null" ]; then
    echo "      ├─ Request: $TOOL_COUNT tool definitions"
  fi

  # Check for tool calls (response)
  TOOL_CALLS=$(cat ~/.anyclaude/traces/claude/$trace | jq '[.response.body.content[]? | select(.type == "tool_use")] | length' 2>/dev/null || echo "0")
  if [ "$TOOL_CALLS" != "0" ]; then
    echo "      ├─ Response: $TOOL_CALLS tool call(s) ✨"

    # Show which tools were called
    cat ~/.anyclaude/traces/claude/$trace | jq -r '.response.body.content[]? | select(.type == "tool_use") | "      │  └─ " + .name + " (id: " + .id + ")"' 2>/dev/null
  fi

  # Check for tool results
  TOOL_RESULTS=$(cat ~/.anyclaude/traces/claude/$trace | jq '[.request.body.messages[]?.content[]? | select(.type == "tool_result")] | length' 2>/dev/null || echo "0")
  if [ "$TOOL_RESULTS" != "0" ]; then
    echo "      └─ Tool results: $TOOL_RESULTS"
  fi

  echo ""
done

echo "5️⃣  Tool Call Details:"
echo ""

# Find the trace with tool calls and show details
for trace in $(ls -t ~/.anyclaude/traces/claude/); do
  HAS_CALLS=$(cat ~/.anyclaude/traces/claude/$trace | jq '[.response.body.content[]? | select(.type == "tool_use")] | length' 2>/dev/null || echo "0")

  if [ "$HAS_CALLS" != "0" ]; then
    echo "   📋 Tool calls from $trace:"
    echo ""
    cat ~/.anyclaude/traces/claude/$trace | jq '.response.body.content[]? | select(.type == "tool_use") | {
      tool: .name,
      id: .id,
      parameters: .input
    }'
    echo ""
    break
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Trace capture complete!"
echo ""
echo "View full traces:"
echo "  ls -lth ~/.anyclaude/traces/claude/"
echo ""
echo "View latest trace:"
echo "  cat ~/.anyclaude/traces/claude/\$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq ."
echo ""
echo "View just tool calls:"
echo "  cat ~/.anyclaude/traces/claude/\$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.response.body.content[]? | select(.type == \"tool_use\")'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
