#!/bin/bash
# Automated test suite for anyclaude with Qwen3-Coder-30B

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 anyclaude Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test Environment:"
echo "  Hardware: Mac M4 Max (40 GPU cores, 128GB RAM)"
echo "  LMStudio: Version 0.3.30"
echo "  Model: Qwen3-Coder-30B-A3B-Instruct-MLX-6bit"
echo "  Context: 262,144 tokens"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if LMStudio is running
if ! curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
  echo "❌ LMStudio is not running on http://localhost:1234"
  echo "   Please start LMStudio with Qwen3-Coder-30B loaded"
  exit 1
fi

echo "✅ LMStudio is running"
echo ""

# Test 1: Context Detection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Context Detection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node tests/manual/test_lmstudio_context_query.js
TEST1_RESULT=$?
echo ""

# Test 2: Simple Tool Calling
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Simple Tool Calling"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
node tests/manual/test_bash_tool.js
TEST2_RESULT=$?
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AUTOMATED TEST RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $TEST1_RESULT -eq 0 ]; then
  echo "✅ Test 1: Context Detection - PASS"
else
  echo "❌ Test 1: Context Detection - FAIL"
fi

if [ $TEST2_RESULT -eq 0 ]; then
  echo "✅ Test 2: Simple Tool Calling - PASS"
else
  echo "❌ Test 2: Simple Tool Calling - FAIL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MANUAL TESTS REQUIRED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test 3: SSE Keepalive (60+ second prompt processing)"
echo "  Command: ANYCLAUDE_DEBUG=2 anyclaude"
echo "  Action: Send complex prompt, watch for keepalive messages"
echo ""
echo "Test 4: Complex Tool Calling (Claude Code real usage)"
echo "  Command: anyclaude"
echo "  Action: Try 'what files have changed in git' and other implicit tool use"
echo ""
echo "Test 5: Context Usage Monitoring"
echo "  Command: ANYCLAUDE_DEBUG=1 anyclaude"
echo "  Action: Have long conversation (20+ messages), watch for warnings"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Exit with failure if any automated test failed
if [ $TEST1_RESULT -ne 0 ] || [ $TEST2_RESULT -ne 0 ]; then
  exit 1
fi

exit 0
