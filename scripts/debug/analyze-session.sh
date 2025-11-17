#!/bin/bash
# Analyze a complete anyclaude session

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         ANYCLAUDE SESSION ANALYSIS                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 1. Latest trace file
echo "📊 LATEST TRACE FILE:"
echo "────────────────────────────────────────────────────────"
LATEST_TRACE=$(ls -t ~/.anyclaude/traces/mlx/trace-*.json 2>/dev/null | head -1)
if [ -n "$LATEST_TRACE" ]; then
  echo "File: $LATEST_TRACE"
  echo ""

  # System prompt size
  SYSTEM_SIZE=$(jq -r '.request.body.system | length' "$LATEST_TRACE")
  SYSTEM_KB=$(echo "scale=1; $SYSTEM_SIZE / 1024" | bc)
  echo "System Prompt: ${SYSTEM_KB}KB (~$(($SYSTEM_SIZE / 4)) tokens)"

  # Tools size
  TOOLS_SIZE=$(jq -r '.request.body.tools | tojson | length' "$LATEST_TRACE")
  TOOLS_KB=$(echo "scale=1; $TOOLS_SIZE / 1024" | bc)
  echo "Tools: ${TOOLS_KB}KB (~$(($TOOLS_SIZE / 4)) tokens)"

  # User message
  USER_SIZE=$(jq -r '.request.body.messages | tojson | length' "$LATEST_TRACE")
  USER_KB=$(echo "scale=1; $USER_SIZE / 1024" | bc)
  echo "User Messages: ${USER_KB}KB (~$(($USER_SIZE / 4)) tokens)"

  # Total overhead
  TOTAL_SIZE=$(($SYSTEM_SIZE + $TOOLS_SIZE))
  TOTAL_KB=$(echo "scale=1; $TOTAL_SIZE / 1024" | bc)
  OVERHEAD_PCT=$(echo "scale=1; $TOTAL_SIZE * 100 / ($TOTAL_SIZE + $USER_SIZE)" | bc)
  echo "Total Overhead: ${TOTAL_KB}KB (~$(($TOTAL_SIZE / 4)) tokens)"
  echo "Overhead %: ${OVERHEAD_PCT}%"
  echo ""
else
  echo "No trace files found"
  echo ""
fi

# 2. Server logs (last 50 lines)
echo "📝 SERVER LOGS (Last 50 lines):"
echo "────────────────────────────────────────────────────────"
tail -50 ~/.anyclaude/logs/mlx-server.log 2>/dev/null || echo "No server logs found"
echo ""

# 3. Cache metrics
echo "💾 CACHE METRICS:"
echo "────────────────────────────────────────────────────────"
if [ -f .anyclaude-cache-metrics.json ]; then
  cat .anyclaude-cache-metrics.json | jq .
else
  echo "No cache metrics found"
fi
echo ""

# 4. All traces from last hour
echo "📁 RECENT TRACE FILES (Last hour):"
echo "────────────────────────────────────────────────────────"
find ~/.anyclaude/traces/mlx -name "trace-*.json" -mmin -60 -ls 2>/dev/null | \
  awk '{print $11, "("$7" bytes)"}' || echo "No recent traces"
echo ""

# 5. Extract thinking tokens (if any)
echo "🧠 THINKING TOKENS FOUND:"
echo "────────────────────────────────────────────────────────"
if [ -n "$LATEST_TRACE" ]; then
  jq -r '.response.body.content[].text // empty' "$LATEST_TRACE" | \
    grep -o '<|channel|>.*<|end|>' | head -5 || echo "No thinking tokens detected ✅"
else
  echo "No trace to analyze"
fi
echo ""

# 6. Tool calls made
echo "🛠️  TOOL CALLS:"
echo "────────────────────────────────────────────────────────"
if [ -n "$LATEST_TRACE" ]; then
  jq -r '.response.body.content[] | select(.type == "tool_use") | "- \(.name)(\(.input | keys | join(", ")))"' "$LATEST_TRACE" || echo "No tool calls"
else
  echo "No trace to analyze"
fi
echo ""

echo "✅ Analysis complete!"
