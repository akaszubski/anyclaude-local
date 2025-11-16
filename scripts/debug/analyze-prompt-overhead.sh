#!/bin/bash
# Analyze Claude Code system prompt overhead from trace files

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║      CLAUDE CODE SYSTEM PROMPT OVERHEAD ANALYSIS         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Find most recent trace file
LATEST_TRACE=$(ls -t ~/.anyclaude/traces/*/*.json 2>/dev/null | head -1)

if [ -z "$LATEST_TRACE" ]; then
    echo "❌ No trace files found in ~/.anyclaude/traces/"
    echo ""
    echo "Run anyclaude first to generate trace files:"
    echo "  ANYCLAUDE_DEBUG=2 anyclaude"
    exit 1
fi

echo "📁 Analyzing: $(basename $LATEST_TRACE)"
echo "   Backend: $(dirname $LATEST_TRACE | xargs basename)"
echo ""

# Extract system prompt
SYSTEM_PROMPT=$(jq -r '.request.body.system // .request.body.system[].text // ""' "$LATEST_TRACE")
SYSTEM_SIZE=${#SYSTEM_PROMPT}
SYSTEM_TOKENS=$(echo "$SYSTEM_PROMPT" | wc -w)

# Extract tool count
TOOL_COUNT=$(jq '.request.body.tools | length' "$LATEST_TRACE" 2>/dev/null || echo "0")

# Extract tool schemas total size
TOOLS_JSON=$(jq '.request.body.tools' "$LATEST_TRACE" 2>/dev/null || echo "[]")
TOOLS_SIZE=${#TOOLS_JSON}
TOOLS_TOKENS=$(echo "$TOOLS_JSON" | wc -w)

# Extract user message
USER_MSG=$(jq -r '.request.body.messages[-1].content // ""' "$LATEST_TRACE")
USER_SIZE=${#USER_MSG}
USER_TOKENS=$(echo "$USER_MSG" | wc -w)

# Calculate totals
TOTAL_CHARS=$((SYSTEM_SIZE + TOOLS_SIZE + USER_SIZE))
TOTAL_TOKENS=$((SYSTEM_TOKENS + TOOLS_TOKENS + USER_TOKENS))
OVERHEAD_CHARS=$((SYSTEM_SIZE + TOOLS_SIZE))
OVERHEAD_TOKENS=$((SYSTEM_TOKENS + TOOLS_TOKENS))
OVERHEAD_PERCENT=$((OVERHEAD_CHARS * 100 / TOTAL_CHARS))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PROMPT BREAKDOWN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
printf "%-25s %12s %12s\n" "Component" "Characters" "Est. Tokens"
echo "────────────────────────────────────────────────────────"
printf "%-25s %12s %12s\n" "System Prompt" "$(printf "%'d" $SYSTEM_SIZE)" "$(printf "%'d" $SYSTEM_TOKENS)"
printf "%-25s %12s %12s\n" "Tools ($TOOL_COUNT tools)" "$(printf "%'d" $TOOLS_SIZE)" "$(printf "%'d" $TOOLS_TOKENS)"
printf "%-25s %12s %12s\n" "User Message" "$(printf "%'d" $USER_SIZE)" "$(printf "%'d" $USER_TOKENS)"
echo "────────────────────────────────────────────────────────"
printf "%-25s %12s %12s\n" "TOTAL" "$(printf "%'d" $TOTAL_CHARS)" "$(printf "%'d" $TOTAL_TOKENS)"
echo ""
printf "%-25s %12s %12s\n" "Claude Code Overhead" "$(printf "%'d" $OVERHEAD_CHARS)" "$(printf "%'d" $OVERHEAD_TOKENS)"
printf "%-25s %12s%%\n" "Overhead Percentage" "$OVERHEAD_PERCENT"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TOOL DETAILS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# List all tools with their sizes
jq -r '.request.body.tools[]? | "\(.name)|\(.description | length)|\(.input_schema | tostring | length)"' "$LATEST_TRACE" | while IFS='|' read -r name desc_size schema_size; do
    total=$((desc_size + schema_size))
    printf "  %-20s %8s chars\n" "$name" "$(printf "%'d" $total)"
done

echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SYSTEM PROMPT PREVIEW (first 500 chars)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "$SYSTEM_PROMPT" | head -c 500
echo ""
echo "... (truncated)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PERFORMANCE IMPACT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Estimate processing time at different speeds
echo "Estimated prompt processing time:"
echo ""
printf "  At  30 tok/s (typical small model): %6.1f seconds\n" "$(echo "scale=1; $OVERHEAD_TOKENS / 30" | bc)"
printf "  At  60 tok/s (typical mid model):   %6.1f seconds\n" "$(echo "scale=1; $OVERHEAD_TOKENS / 60" | bc)"
printf "  At 120 tok/s (typical large model): %6.1f seconds\n" "$(echo "scale=1; $OVERHEAD_TOKENS / 120" | bc)"
echo ""
echo "⚠️  This is the BASELINE delay before ANY response starts!"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "OPTIMIZATION OPPORTUNITIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $OVERHEAD_PERCENT -gt 90 ]; then
    echo "🔴 CRITICAL: Overhead is $OVERHEAD_PERCENT% of total prompt!"
    echo ""
    echo "Recommendations:"
    echo "  1. Strip unnecessary tool descriptions"
    echo "  2. Simplify system prompt for local models"
    echo "  3. Use prompt caching (vLLM-MLX only)"
    echo "  4. Consider context compression"
elif [ $OVERHEAD_PERCENT -gt 70 ]; then
    echo "🟡 WARNING: Overhead is $OVERHEAD_PERCENT% of total prompt"
    echo ""
    echo "Recommendations:"
    echo "  1. Enable prompt caching (vLLM-MLX)"
    echo "  2. Consider simplifying tool descriptions"
elif [ $OVERHEAD_PERCENT -gt 50 ]; then
    echo "🟢 MODERATE: Overhead is $OVERHEAD_PERCENT% of total prompt"
    echo ""
    echo "Recommendations:"
    echo "  1. Enable prompt caching for repeated requests"
else
    echo "✅ GOOD: Overhead is only $OVERHEAD_PERCENT% of total prompt"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DETAILED ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Full trace file: $LATEST_TRACE"
echo ""
echo "View full system prompt:"
echo "  jq -r '.request.body.system' $LATEST_TRACE | less"
echo ""
echo "View all tools:"
echo "  jq '.request.body.tools[]' $LATEST_TRACE | less"
echo ""
echo "Extract to files:"
echo "  jq -r '.request.body.system' $LATEST_TRACE > /tmp/system-prompt.txt"
echo "  jq '.request.body.tools' $LATEST_TRACE > /tmp/tools.json"
echo ""
