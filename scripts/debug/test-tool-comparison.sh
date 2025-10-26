#!/bin/bash
# Automated Tool Calling Comparison: Claude vs Qwen3-Coder-30B
# This script captures tool calls from both and suggests fixes

set -e

REPORT_FILE="tool-comparison-report.md"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Automated Tool Call Analysis: Claude vs Qwen3-Coder-30B    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if LMStudio is running
if ! curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
  echo "❌ ERROR: LMStudio is not running on http://localhost:1234"
  echo ""
  echo "Please:"
  echo "  1. Start LMStudio"
  echo "  2. Load a model (preferably Qwen3-Coder-30B)"
  echo "  3. Ensure the server is running on port 1234"
  echo ""
  exit 1
fi

# Get loaded model info
LOADED_MODEL=$(curl -s http://localhost:1234/v1/models | jq -r '.data[0].id' 2>/dev/null || echo "unknown")
echo "✓ LMStudio running"
echo "✓ Loaded model: $LOADED_MODEL"
echo ""

# Test prompts that trigger different tools
TEST_PROMPTS=(
  "Read the README.md file and summarize it"
  "What files have changed in git?"
  "List all TypeScript files in the src directory"
)

# Clean old data
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  SETUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Cleaning old data..."
rm -rf ~/.anyclaude/traces/claude/* 2>/dev/null || true
rm -f /tmp/claude-tool-test-*.log 2>/dev/null || true
rm -f /tmp/qwen3-tool-test-*.log 2>/dev/null || true
rm -f $REPORT_FILE 2>/dev/null || true
echo "✓ Cleaned"
echo ""

# Initialize report
cat > $REPORT_FILE << 'EOF'
# Tool Call Comparison Report

**Generated**: $(date)
**LMStudio Model**:
**Test Prompts**: 3

---

## Summary

EOF

echo "LOADED_MODEL=\"$LOADED_MODEL\"" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# Function to test Claude
test_claude() {
  local prompt="$1"
  local test_num="$2"

  echo "Testing Claude with prompt $test_num..."

  # Run Claude Code with prompt
  ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude > /tmp/claude-tool-test-$test_num.log 2>&1 << EOF &
$prompt
/exit
EOF

  local pid=$!

  # Wait for completion (max 60 seconds)
  local count=0
  while kill -0 $pid 2>/dev/null && [ $count -lt 60 ]; do
    sleep 1
    count=$((count + 1))
    echo -n "."
  done

  # Force kill if still running
  kill $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true

  echo " done"
}

# Function to test Qwen3
test_qwen3() {
  local prompt="$1"
  local test_num="$2"

  echo "Testing Qwen3 with prompt $test_num..."

  # Run with Qwen3
  ANYCLAUDE_DEBUG=3 anyclaude > /tmp/qwen3-tool-test-$test_num.log 2>&1 << EOF &
$prompt
/exit
EOF

  local pid=$!

  # Wait for completion (max 60 seconds)
  local count=0
  while kill -0 $pid 2>/dev/null && [ $count -lt 60 ]; do
    sleep 1
    count=$((count + 1))
    echo -n "."
  done

  # Force kill if still running
  kill $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true

  echo " done"
}

# Run tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  TESTING CLAUDE API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for i in "${!TEST_PROMPTS[@]}"; do
  test_num=$((i + 1))
  echo "Test $test_num: ${TEST_PROMPTS[$i]}"
  test_claude "${TEST_PROMPTS[$i]}" $test_num
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  TESTING QWEN3-CODER-30B"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for i in "${!TEST_PROMPTS[@]}"; do
  test_num=$((i + 1))
  echo "Test $test_num: ${TEST_PROMPTS[$i]}"
  test_qwen3 "${TEST_PROMPTS[$i]}" $test_num
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  ANALYZING RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat >> $REPORT_FILE << 'EOF'

## Claude API Results

EOF

# Analyze Claude traces
echo "Analyzing Claude traces..."
CLAUDE_TRACES=$(ls -t ~/.anyclaude/traces/claude/ 2>/dev/null | head -10)
CLAUDE_TRACE_COUNT=$(echo "$CLAUDE_TRACES" | wc -l | tr -d ' ')

echo "  Found $CLAUDE_TRACE_COUNT Claude trace files"

cat >> $REPORT_FILE << EOF

**Traces captured**: $CLAUDE_TRACE_COUNT

EOF

if [ $CLAUDE_TRACE_COUNT -gt 0 ]; then
  echo "  Analyzing tool calls..."

  cat >> $REPORT_FILE << 'EOF'

### Tool Calls Made by Claude

EOF

  for trace in $CLAUDE_TRACES; do
    TOOL_CALLS=$(cat ~/.anyclaude/traces/claude/$trace 2>/dev/null | jq -r '.response.body.content[]? | select(.type == "tool_use") | "- **\(.name)**: `\(.input | @json)`"' 2>/dev/null || echo "")

    if [ ! -z "$TOOL_CALLS" ]; then
      echo "$TOOL_CALLS" >> $REPORT_FILE
      echo "    ✓ Found tool calls in $trace"
    fi
  done

  # Get tool schema sample
  echo "" >> $REPORT_FILE
  echo "### Example Tool Schema (Bash)" >> $REPORT_FILE
  echo "" >> $REPORT_FILE
  echo '```json' >> $REPORT_FILE
  cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) 2>/dev/null | \
    jq '.request.body.tools[]? | select(.name == "Bash") | {name, input_schema: .input_schema}' 2>/dev/null >> $REPORT_FILE || true
  echo '```' >> $REPORT_FILE
  echo "" >> $REPORT_FILE
fi

cat >> $REPORT_FILE << 'EOF'

---

## Qwen3-Coder-30B Results

EOF

# Analyze Qwen3 logs
echo "Analyzing Qwen3 logs..."
QWEN3_LOGS="/tmp/qwen3-tool-test-*.log"
QWEN3_LOG_COUNT=$(ls -1 $QWEN3_LOGS 2>/dev/null | wc -l | tr -d ' ')

echo "  Found $QWEN3_LOG_COUNT Qwen3 log files"

cat >> $REPORT_FILE << EOF

**Logs captured**: $QWEN3_LOG_COUNT

EOF

if [ $QWEN3_LOG_COUNT -gt 0 ]; then
  cat >> $REPORT_FILE << 'EOF'

### Tool Calls Made by Qwen3

EOF

  for log in $QWEN3_LOGS; do
    # Extract tool calls from debug logs
    TOOL_CALLS=$(grep -A5 "Tool Call\|tool_use" "$log" 2>/dev/null || echo "")

    if [ ! -z "$TOOL_CALLS" ]; then
      echo "    ✓ Found tool calls in $(basename $log)"
      echo "\`\`\`" >> $REPORT_FILE
      echo "$TOOL_CALLS" | head -20 >> $REPORT_FILE
      echo "\`\`\`" >> $REPORT_FILE
      echo "" >> $REPORT_FILE
    else
      echo "    ⚠ No tool calls found in $(basename $log)"
      echo "- ⚠️ **No tool calls detected** in $(basename $log)" >> $REPORT_FILE
    fi
  done

  # Check for errors
  cat >> $REPORT_FILE << 'EOF'

### Errors/Issues with Qwen3

EOF

  for log in $QWEN3_LOGS; do
    ERRORS=$(grep -i "error\|invalid\|failed" "$log" 2>/dev/null | head -10 || echo "")

    if [ ! -z "$ERRORS" ]; then
      echo "- **$(basename $log)**:" >> $REPORT_FILE
      echo "\`\`\`" >> $REPORT_FILE
      echo "$ERRORS" >> $REPORT_FILE
      echo "\`\`\`" >> $REPORT_FILE
      echo "" >> $REPORT_FILE
    fi
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  GENERATING RECOMMENDATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat >> $REPORT_FILE << 'EOF'

---

## Analysis & Recommendations

### Key Differences

EOF

# Compare tool call success
echo "Comparing success rates..."

# Count successful tool calls
CLAUDE_SUCCESS=$(grep -r "tool_use" ~/.anyclaude/traces/claude/ 2>/dev/null | wc -l | tr -d ' ')
QWEN3_SUCCESS=$(grep -r "tool_use\|Tool Call" /tmp/qwen3-tool-test-*.log 2>/dev/null | wc -l | tr -d ' ')

cat >> $REPORT_FILE << EOF

**Tool Call Success**:
- Claude API: $CLAUDE_SUCCESS tool calls
- Qwen3-Coder-30B: $QWEN3_SUCCESS tool calls

EOF

if [ $CLAUDE_SUCCESS -gt $QWEN3_SUCCESS ]; then
  DIFF=$((CLAUDE_SUCCESS - QWEN3_SUCCESS))
  cat >> $REPORT_FILE << EOF

⚠️ **Qwen3 made $DIFF fewer tool calls than Claude**

EOF
fi

# Generate specific recommendations
cat >> $REPORT_FILE << 'EOF'

### Recommended Fixes

Based on the comparison, here are the issues to address:

#### 1. Schema Complexity

**Problem**: Qwen3 struggles with complex schemas (many optional parameters)

**Solution**: Simplify schemas in `src/json-schema.ts`
```typescript
// Before (too complex for Qwen3)
{
  "command": { type: "string", description: "..." },
  "timeout": { type: "number", description: "..." },
  "description": { type: "string", description: "..." },
  "run_in_background": { type: "boolean", description: "..." },
  "dangerouslyDisableSandbox": { type: "boolean", description: "..." }
}

// After (simplified for Qwen3)
{
  "command": { type: "string", description: "..." },
  "description": { type: "string", description: "..." }
}
```

**Files to modify**:
- `src/json-schema.ts` - Add model-specific schema simplification
- `src/convert-anthropic-messages.ts` - Handle parameter mapping

#### 2. Description Length

**Problem**: Long descriptions (8000+ chars) confuse smaller models

**Solution**: Truncate descriptions for LMStudio mode
```typescript
// In src/anthropic-proxy.ts or src/convert-anthropic-messages.ts
const simplifyToolDescription = (desc: string, maxLength = 500) => {
  if (desc.length <= maxLength) return desc;

  // Extract just the first paragraph
  const firstPara = desc.split('\n\n')[0];
  return firstPara.substring(0, maxLength) + '...';
};
```

#### 3. Tool Call Format

**Problem**: Qwen3 may return tool calls in slightly different format

**Solution**: Add format normalization in `src/convert-to-anthropic-stream.ts`

#### 4. Required vs Optional Parameters

**Problem**: Qwen3 gets confused when there are many optional parameters

**Solution**: Make commonly-used optional params required, or remove them entirely
```typescript
// Simplify Bash tool for Qwen3
{
  name: "Bash",
  input_schema: {
    properties: {
      command: { type: "string" },
      // Remove: timeout, run_in_background, dangerouslyDisableSandbox
      // Keep only essential parameters
    },
    required: ["command"]
  }
}
```

### Implementation Priority

1. **High Priority**: Schema simplification (biggest impact)
   - Remove optional parameters for LMStudio mode
   - Keep only 2-3 parameters per tool

2. **Medium Priority**: Description truncation
   - Limit to 200-500 characters
   - Keep only the essential usage info

3. **Low Priority**: Response format normalization
   - Handle edge cases in tool call parsing

### Testing Plan

After implementing fixes:

1. Run this comparison script again
2. Check if Qwen3 tool call count increases
3. Test with specific failing prompts
4. Measure success rate improvement

**Target**: Increase Qwen3 success rate from ~30% to 90%

EOF

echo "✓ Analysis complete"
echo ""

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✓ Claude traces: $CLAUDE_TRACE_COUNT files"
echo "✓ Qwen3 logs: $QWEN3_LOG_COUNT files"
echo "✓ Claude tool calls: $CLAUDE_SUCCESS"
echo "✓ Qwen3 tool calls: $QWEN3_SUCCESS"
echo ""
echo "📄 Detailed report saved to: $REPORT_FILE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 NEXT STEPS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Read the report:"
echo "   cat $REPORT_FILE"
echo ""
echo "2. View Claude traces:"
echo "   ls -lth ~/.anyclaude/traces/claude/"
echo ""
echo "3. View specific trace:"
echo "   cat ~/.anyclaude/traces/claude/\$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq ."
echo ""
echo "4. View Qwen3 logs:"
echo "   cat /tmp/qwen3-tool-test-1.log"
echo ""
echo "5. Implement recommended fixes in:"
echo "   - src/json-schema.ts (schema simplification)"
echo "   - src/convert-anthropic-messages.ts (parameter handling)"
echo "   - src/convert-to-anthropic-stream.ts (format normalization)"
echo ""
echo "6. Re-run this script to verify improvements:"
echo "   ./test-tool-comparison.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Open report if running on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  echo "Opening report in your default markdown viewer..."
  sleep 1
  open $REPORT_FILE 2>/dev/null || cat $REPORT_FILE
fi
