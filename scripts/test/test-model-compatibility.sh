#!/bin/bash
# Comprehensive Model Compatibility Test for anyclaude
# Tests: speed, tool calling, context handling, and overall compatibility

set -e

REPORT_FILE="model-compatibility-report.json"
MARKDOWN_REPORT="model-compatibility-report.md"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          anyclaude Model Compatibility Test                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required but not installed"
  echo "Install with: brew install jq"
  exit 1
fi

if ! curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
  echo "❌ Error: LMStudio is not running on http://localhost:1234"
  echo ""
  echo "Please:"
  echo "  1. Start LMStudio"
  echo "  2. Load a model"
  echo "  3. Enable the server on port 1234"
  exit 1
fi

# Get model info
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  DETECTING MODEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

MODEL_INFO=$(curl -s http://localhost:1234/v1/models)
MODEL_ID=$(echo "$MODEL_INFO" | jq -r '.data[0].id' 2>/dev/null || echo "unknown")
MODEL_CREATED=$(echo "$MODEL_INFO" | jq -r '.data[0].created' 2>/dev/null || echo "0")

echo "Model ID: $MODEL_ID"
echo "Loaded at: $(date -r $MODEL_CREATED 2>/dev/null || echo 'unknown')"
echo ""

# Initialize report
cat > $REPORT_FILE << EOF
{
  "model_id": "$MODEL_ID",
  "test_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tests": {}
}
EOF

# Test 1: Speed to First Token
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  TESTING SPEED TO FIRST TOKEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

START_TIME=$(date +%s%3N)

FIRST_TOKEN_RESPONSE=$(curl -s -N -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL_ID"'",
    "messages": [{"role": "user", "content": "Say hello"}],
    "stream": true,
    "max_tokens": 5
  }' | head -1)

FIRST_TOKEN_TIME=$(date +%s%3N)
TTFT=$((FIRST_TOKEN_TIME - START_TIME))

echo "⏱️  Time to First Token: ${TTFT}ms"
echo ""

# Update report
jq '.tests.ttft = {
  "time_ms": '"$TTFT"',
  "status": "'"$([ $TTFT -lt 2000 ] && echo "excellent" || ([ $TTFT -lt 5000 ] && echo "good" || echo "slow"))"'"
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Test 2: Tokens Per Second
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TESTING TOKENS PER SECOND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

START_TIME=$(date +%s%3N)

TPS_RESPONSE=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL_ID"'",
    "messages": [{"role": "user", "content": "Count from 1 to 20"}],
    "stream": false,
    "max_tokens": 100
  }')

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

COMPLETION_TOKENS=$(echo "$TPS_RESPONSE" | jq -r '.usage.completion_tokens' 2>/dev/null || echo "0")
TPS=$(echo "scale=2; $COMPLETION_TOKENS * 1000 / $DURATION" | bc)

echo "📊 Generated: $COMPLETION_TOKENS tokens in ${DURATION}ms"
echo "🚀 Speed: $TPS tokens/second"
echo ""

# Update report
jq '.tests.tps = {
  "tokens_per_second": '"$TPS"',
  "tokens": '"$COMPLETION_TOKENS"',
  "duration_ms": '"$DURATION"',
  "status": "'"$(echo "$TPS > 20" | bc -l | grep -q 1 && echo "excellent" || (echo "$TPS > 10" | bc -l | grep -q 1 && echo "good" || echo "slow"))"'"
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Test 3: Context Size Detection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  TESTING CONTEXT SIZE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Try to detect max context from model
CONTEXT_SIZE=$(echo "$MODEL_INFO" | jq -r '.data[0].max_model_len // .data[0].context_length // 0' 2>/dev/null || echo "0")

if [ "$CONTEXT_SIZE" -eq 0 ]; then
  # Common context sizes to test
  echo "Probing for max context size..."
  for size in 128000 32768 16384 8192 4096 2048; do
    echo -n "  Testing ${size} tokens... "

    # Generate a large prompt (roughly estimate tokens)
    WORDS=$((size / 2))
    LARGE_PROMPT=$(yes "word " | head -$WORDS | tr -d '\n')

    CONTEXT_TEST=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
      -H "Content-Type: application/json" \
      --max-time 10 \
      -d '{
        "model": "'"$MODEL_ID"'",
        "messages": [{"role": "user", "content": "'"${LARGE_PROMPT:0:10000}"' Summarize"}],
        "stream": false,
        "max_tokens": 10
      }' 2>/dev/null || echo '{"error": true}')

    if echo "$CONTEXT_TEST" | jq -e '.choices[0]' > /dev/null 2>&1; then
      CONTEXT_SIZE=$size
      echo "✓"
      break
    else
      echo "✗"
    fi
  done
fi

echo ""
echo "📏 Max Context: ~${CONTEXT_SIZE} tokens"
echo ""

# Update report
jq '.tests.context = {
  "max_tokens": '"$CONTEXT_SIZE"',
  "status": "'"$([ $CONTEXT_SIZE -ge 32768 ] && echo "excellent" || ([ $CONTEXT_SIZE -ge 8192 ] && echo "good" || echo "limited"))"'"
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Test 4: Tool Calling Capability
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  TESTING TOOL CALLING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Simple tool calling test
TOOL_TEST=$(curl -s -X POST http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$MODEL_ID"'",
    "messages": [{"role": "user", "content": "What is 5 + 3? Use the calculator tool."}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "Performs basic math operations",
        "parameters": {
          "type": "object",
          "properties": {
            "operation": {"type": "string", "enum": ["add", "subtract", "multiply", "divide"]},
            "a": {"type": "number"},
            "b": {"type": "number"}
          },
          "required": ["operation", "a", "b"]
        }
      }
    }],
    "stream": false,
    "max_tokens": 100
  }')

# Check if tool was called
TOOL_CALLS=$(echo "$TOOL_TEST" | jq -r '.choices[0].message.tool_calls // [] | length' 2>/dev/null || echo "0")
TOOL_NAME=$(echo "$TOOL_TEST" | jq -r '.choices[0].message.tool_calls[0].function.name' 2>/dev/null || echo "none")

if [ "$TOOL_CALLS" -gt 0 ]; then
  echo "✅ Tool calling: SUPPORTED"
  echo "   Called: $TOOL_NAME"
  TOOL_STATUS="supported"
else
  echo "❌ Tool calling: NOT SUPPORTED"
  TOOL_STATUS="not_supported"
fi
echo ""

# Update report
jq '.tests.tool_calling = {
  "supported": '"$([ "$TOOL_CALLS" -gt 0 ] && echo "true" || echo "false")"',
  "test_calls": '"$TOOL_CALLS"',
  "status": "'"$TOOL_STATUS"'"
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Test 5: Complex Tool Calling (via anyclaude proxy)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  TESTING COMPLEX TOOL CALLING (via anyclaude)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start proxy in background
ANYCLAUDE_DEBUG=3 PROXY_ONLY=true anyclaude > /tmp/tool-test-proxy.log 2>&1 &
PROXY_PID=$!

# Wait for proxy to start
sleep 3

# Get proxy URL
PROXY_URL=$(grep -o "http://localhost:[0-9]*" /tmp/tool-test-proxy.log | head -1)

if [ -z "$PROXY_URL" ]; then
  echo "⚠️  Could not start proxy, skipping complex test"
  COMPLEX_TOOL_STATUS="skipped"
  kill $PROXY_PID 2>/dev/null || true
else
  echo "Proxy running at: $PROXY_URL"

  # Test with Read tool (simpler than Bash)
  COMPLEX_TOOL_TEST=$(curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 100,
      "tools": [{
        "name": "read_file",
        "description": "Read a file from disk",
        "input_schema": {
          "type": "object",
          "properties": {
            "path": {"type": "string", "description": "File path"}
          },
          "required": ["path"]
        }
      }],
      "messages": [{
        "role": "user",
        "content": "Read the file at /etc/hosts"
      }]
    }')

  COMPLEX_TOOL_CALLS=$(echo "$COMPLEX_TOOL_TEST" | jq -r '.content[] | select(.type == "tool_use") | .name' 2>/dev/null | wc -l | tr -d ' ')

  if [ "$COMPLEX_TOOL_CALLS" -gt 0 ]; then
    echo "✅ Complex tool calling: WORKING"
    COMPLEX_TOOL_STATUS="working"
  else
    echo "⚠️  Complex tool calling: NEEDS IMPROVEMENT"
    COMPLEX_TOOL_STATUS="needs_improvement"
  fi

  # Stop proxy
  kill $PROXY_PID 2>/dev/null || true
fi

echo ""

# Update report
jq '.tests.complex_tool_calling = {
  "status": "'"$COMPLEX_TOOL_STATUS"'",
  "calls_made": '"${COMPLEX_TOOL_CALLS:-0}"'
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Test 6: Memory Usage
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  CHECKING SYSTEM RESOURCES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get system memory
if [[ "$OSTYPE" == "darwin"* ]]; then
  TOTAL_MEM=$(sysctl hw.memsize | awk '{print int($2/1024/1024/1024)}')
  AVAILABLE_MEM=$(vm_stat | grep "Pages free" | awk '{print int($3 * 4096 / 1024 / 1024 / 1024)}')
else
  TOTAL_MEM=$(free -g | awk '/^Mem:/{print $2}')
  AVAILABLE_MEM=$(free -g | awk '/^Mem:/{print $7}')
fi

echo "💾 Total RAM: ${TOTAL_MEM}GB"
echo "💾 Available RAM: ${AVAILABLE_MEM}GB"
echo ""

# Update report
jq '.system = {
  "total_memory_gb": '"$TOTAL_MEM"',
  "available_memory_gb": '"$AVAILABLE_MEM"'
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Generate Overall Compatibility Score
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  COMPATIBILITY ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SCORE=0
MAX_SCORE=100

# TTFT scoring (20 points)
if [ $TTFT -lt 2000 ]; then
  SCORE=$((SCORE + 20))
  echo "✅ Speed to First Token: Excellent (20/20)"
elif [ $TTFT -lt 5000 ]; then
  SCORE=$((SCORE + 15))
  echo "⚠️  Speed to First Token: Good (15/20)"
else
  SCORE=$((SCORE + 5))
  echo "❌ Speed to First Token: Slow (5/20)"
fi

# TPS scoring (20 points)
if echo "$TPS > 20" | bc -l | grep -q 1; then
  SCORE=$((SCORE + 20))
  echo "✅ Tokens/Second: Excellent (20/20)"
elif echo "$TPS > 10" | bc -l | grep -q 1; then
  SCORE=$((SCORE + 15))
  echo "⚠️  Tokens/Second: Good (15/20)"
else
  SCORE=$((SCORE + 5))
  echo "❌ Tokens/Second: Slow (5/20)"
fi

# Context scoring (20 points)
if [ $CONTEXT_SIZE -ge 32768 ]; then
  SCORE=$((SCORE + 20))
  echo "✅ Context Size: Excellent (20/20)"
elif [ $CONTEXT_SIZE -ge 8192 ]; then
  SCORE=$((SCORE + 15))
  echo "⚠️  Context Size: Good (15/20)"
else
  SCORE=$((SCORE + 5))
  echo "❌ Context Size: Limited (5/20)"
fi

# Tool calling scoring (40 points)
if [ "$TOOL_CALLS" -gt 0 ] && [ "$COMPLEX_TOOL_STATUS" == "working" ]; then
  SCORE=$((SCORE + 40))
  echo "✅ Tool Calling: Fully Compatible (40/40)"
elif [ "$TOOL_CALLS" -gt 0 ]; then
  SCORE=$((SCORE + 25))
  echo "⚠️  Tool Calling: Basic Support (25/40)"
else
  SCORE=$((SCORE + 0))
  echo "❌ Tool Calling: Not Supported (0/40)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 OVERALL COMPATIBILITY SCORE: $SCORE/100"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Recommendation
if [ $SCORE -ge 85 ]; then
  RECOMMENDATION="Excellent - Highly recommended for production use with anyclaude"
  GRADE="A"
elif [ $SCORE -ge 70 ]; then
  RECOMMENDATION="Good - Suitable for most use cases"
  GRADE="B"
elif [ $SCORE -ge 50 ]; then
  RECOMMENDATION="Fair - Works but may need optimization"
  GRADE="C"
else
  RECOMMENDATION="Poor - Consider a different model or hardware upgrade"
  GRADE="D"
fi

echo "🎯 Grade: $GRADE"
echo "💡 Recommendation: $RECOMMENDATION"
echo ""

# Update report with final scores
jq '.compatibility = {
  "score": '"$SCORE"',
  "grade": "'"$GRADE"'",
  "recommendation": "'"$RECOMMENDATION"'"
}' $REPORT_FILE > ${REPORT_FILE}.tmp && mv ${REPORT_FILE}.tmp $REPORT_FILE

# Generate Markdown Report
cat > $MARKDOWN_REPORT << EOF
# Model Compatibility Report

**Model**: $MODEL_ID
**Test Date**: $(date)
**Compatibility Score**: $SCORE/100 (Grade: $GRADE)

---

## Summary

$RECOMMENDATION

---

## Detailed Results

### Speed Metrics

| Metric | Result | Status |
|--------|--------|--------|
| **Time to First Token** | ${TTFT}ms | $([ $TTFT -lt 2000 ] && echo "✅ Excellent" || ([ $TTFT -lt 5000 ] && echo "⚠️ Good" || echo "❌ Slow")) |
| **Tokens Per Second** | $TPS | $(echo "$TPS > 20" | bc -l | grep -q 1 && echo "✅ Excellent" || (echo "$TPS > 10" | bc -l | grep -q 1 && echo "⚠️ Good" || echo "❌ Slow")) |

### Capabilities

| Feature | Support | Status |
|---------|---------|--------|
| **Max Context** | ~${CONTEXT_SIZE} tokens | $([ $CONTEXT_SIZE -ge 32768 ] && echo "✅ Excellent" || ([ $CONTEXT_SIZE -ge 8192 ] && echo "⚠️ Good" || echo "❌ Limited")) |
| **Basic Tool Calling** | $([ "$TOOL_CALLS" -gt 0 ] && echo "✅ Yes" || echo "❌ No") | $([ "$TOOL_CALLS" -gt 0 ] && echo "Supported" || echo "Not Supported") |
| **Complex Tool Calling** | $([ "$COMPLEX_TOOL_STATUS" == "working" ] && echo "✅ Yes" || echo "⚠️ Partial") | $COMPLEX_TOOL_STATUS |

### System Resources

| Resource | Available |
|----------|-----------|
| **Total RAM** | ${TOTAL_MEM}GB |
| **Available RAM** | ${AVAILABLE_MEM}GB |

---

## Recommendations

$(if [ $SCORE -ge 85 ]; then
  echo "This model performs excellently and is ready for production use with anyclaude."
elif [ $SCORE -ge 70 ]; then
  echo "This model works well for most scenarios. Minor optimizations may help."
elif [ $SCORE -ge 50 ]; then
  echo "This model is usable but consider:"
  echo "- Using model adapters for better tool calling"
  echo "- Reducing context size expectations"
  echo "- Monitoring performance in production"
else
  echo "This model may not be suitable. Consider:"
  echo "- Trying a different model"
  echo "- Upgrading hardware (more RAM/faster GPU)"
  echo "- Using quantized versions if available"
fi)

---

## Next Steps

1. **If score >= 70**: Ready to use! Run \`anyclaude\` normally
2. **If score 50-69**: Consider adding model adapter config (see MODEL_ADAPTERS.md)
3. **If score < 50**: Try a different model or check hardware requirements

**Full JSON report**: \`$REPORT_FILE\`

EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TEST COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📄 Reports saved:"
echo "   - JSON: $REPORT_FILE"
echo "   - Markdown: $MARKDOWN_REPORT"
echo ""
echo "View report:"
echo "   cat $MARKDOWN_REPORT"
echo ""

# Open report on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  open $MARKDOWN_REPORT 2>/dev/null || true
fi
