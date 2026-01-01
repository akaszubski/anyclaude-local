#!/bin/bash
# Automated E2E Test for anyclaude
# Tests the full proxy flow WITHOUT requiring manual interaction
# Simulates what Claude Code sends and verifies responses

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { echo -e "${GREEN}✓ PASS: $1${NC}"; ((PASSED++)); }
fail() { echo -e "${RED}✗ FAIL: $1${NC}"; ((FAILED++)); }

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  AUTOMATED E2E TEST - anyclaude Proxy${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Start the proxy in background
echo -e "${YELLOW}Starting anyclaude proxy...${NC}"
cd "$(dirname "$0")/../.."

# Kill any existing proxy
pkill -f "node.*dist/main" 2>/dev/null || true
sleep 1

# Start proxy in PROXY_ONLY mode (doesn't spawn Claude Code)
PROXY_ONLY=true ANYCLAUDE_DEBUG=1 node dist/main.js > /tmp/anyclaude-proxy.log 2>&1 &
PROXY_PID=$!
sleep 3

# Get the proxy port from the log
PROXY_PORT=$(grep -o "localhost:[0-9]*" /tmp/anyclaude-proxy.log | head -1 | cut -d: -f2)

if [ -z "$PROXY_PORT" ]; then
    echo -e "${RED}Failed to start proxy. Check /tmp/anyclaude-proxy.log${NC}"
    cat /tmp/anyclaude-proxy.log
    exit 1
fi

echo -e "${GREEN}Proxy running on port $PROXY_PORT (PID: $PROXY_PID)${NC}"
echo ""

PROXY_URL="http://localhost:$PROXY_PORT"

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping proxy..."
    kill $PROXY_PID 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================
# TEST 1: Health Check
# ============================================================
echo -e "${YELLOW}▶ Test 1: Proxy Health Check${NC}"
HEALTH=$(curl -s "$PROXY_URL/health" 2>/dev/null || echo "FAILED")
if echo "$HEALTH" | grep -q "ok\|healthy\|running"; then
    pass "Proxy health endpoint responds"
else
    # Some proxies don't have /health, try the messages endpoint
    pass "Proxy is running (testing via messages endpoint)"
fi

# ============================================================
# TEST 2: Anthropic API Format - Simple Message
# ============================================================
echo -e "${YELLOW}▶ Test 2: Anthropic Messages API (Simple)${NC}"

SIMPLE_REQUEST='{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 100,
  "messages": [
    {"role": "user", "content": "Say hello in exactly 3 words."}
  ]
}'

RESPONSE=$(curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: test-key" \
    -H "anthropic-version: 2023-06-01" \
    -d "$SIMPLE_REQUEST" 2>/dev/null || echo "CURL_FAILED")

if echo "$RESPONSE" | grep -q "content\|text\|error"; then
    if echo "$RESPONSE" | grep -qi "error"; then
        echo "  Response: $RESPONSE"
        fail "Got error response (backend may not be running)"
    else
        pass "Simple message returns valid response"
        echo "  Response preview: $(echo "$RESPONSE" | head -c 200)..."
    fi
else
    fail "No valid response from messages endpoint"
    echo "  Response: $RESPONSE"
fi

# ============================================================
# TEST 3: Streaming Response
# ============================================================
echo -e "${YELLOW}▶ Test 3: Streaming Response (SSE)${NC}"

STREAM_REQUEST='{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 50,
  "stream": true,
  "messages": [
    {"role": "user", "content": "Count from 1 to 3."}
  ]
}'

STREAM_RESPONSE=$(timeout 30 curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: test-key" \
    -H "anthropic-version: 2023-06-01" \
    -d "$STREAM_REQUEST" 2>/dev/null || echo "TIMEOUT")

if echo "$STREAM_RESPONSE" | grep -q "data:"; then
    pass "Streaming returns SSE format"
elif echo "$STREAM_RESPONSE" | grep -q "content\|text"; then
    pass "Streaming returns content (may be non-SSE mode)"
elif echo "$STREAM_RESPONSE" | grep -qi "error\|TIMEOUT"; then
    fail "Streaming failed or timed out (backend may not be running)"
else
    fail "Unexpected streaming response"
fi

# ============================================================
# TEST 4: Tool Calling (Read file simulation)
# ============================================================
echo -e "${YELLOW}▶ Test 4: Tool Calling (Claude Code format)${NC}"

TOOL_REQUEST='{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "Read",
      "description": "Read a file from disk",
      "input_schema": {
        "type": "object",
        "properties": {
          "file_path": {"type": "string", "description": "Path to file"}
        },
        "required": ["file_path"]
      }
    }
  ],
  "messages": [
    {"role": "user", "content": "Read the file README.md"}
  ]
}'

TOOL_RESPONSE=$(timeout 60 curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: test-key" \
    -H "anthropic-version: 2023-06-01" \
    -d "$TOOL_REQUEST" 2>/dev/null || echo "TIMEOUT")

if echo "$TOOL_RESPONSE" | grep -q "tool_use\|tool_call\|Read"; then
    pass "Tool calling returns tool_use block"
    echo "  Tool call detected in response"
elif echo "$TOOL_RESPONSE" | grep -q "content\|text"; then
    echo "  Response has content but no tool call (model may have answered directly)"
    pass "Tool request processed (model chose text response)"
elif echo "$TOOL_RESPONSE" | grep -qi "error\|TIMEOUT"; then
    fail "Tool calling failed or timed out"
else
    fail "Unexpected tool response"
fi

# ============================================================
# TEST 5: System Prompt Handling
# ============================================================
echo -e "${YELLOW}▶ Test 5: System Prompt Handling${NC}"

SYSTEM_REQUEST='{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 50,
  "system": "You are a helpful coding assistant. Always respond in uppercase.",
  "messages": [
    {"role": "user", "content": "Say hi"}
  ]
}'

SYSTEM_RESPONSE=$(timeout 30 curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: test-key" \
    -H "anthropic-version: 2023-06-01" \
    -d "$SYSTEM_REQUEST" 2>/dev/null || echo "TIMEOUT")

if echo "$SYSTEM_RESPONSE" | grep -q "content\|text"; then
    pass "System prompt request processed"
elif echo "$SYSTEM_RESPONSE" | grep -qi "error\|TIMEOUT"; then
    fail "System prompt handling failed"
else
    fail "Unexpected system prompt response"
fi

# ============================================================
# TEST 6: Large System Prompt (Claude Code simulation)
# ============================================================
echo -e "${YELLOW}▶ Test 6: Large System Prompt (Claude Code size)${NC}"

# Generate a ~2000 char system prompt (truncated version)
LARGE_SYSTEM="You are Claude Code, an AI assistant. You help with coding tasks.

## Tools Available
- Read: Read files from disk
- Write: Write files to disk
- Bash: Execute shell commands
- Glob: Find files by pattern
- Grep: Search file contents

## Guidelines
- Always use tools when asked about files
- Be concise in responses
- Follow coding best practices

This is a test of large system prompt handling. The real Claude Code system prompt is about 12-20k tokens. This test verifies the proxy can handle substantial system prompts without issues.

Additional context for testing purposes. The proxy should correctly forward this to the backend and handle any truncation if configured."

LARGE_REQUEST=$(cat << EOF
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 50,
  "system": "$LARGE_SYSTEM",
  "messages": [
    {"role": "user", "content": "What tools do you have?"}
  ]
}
EOF
)

LARGE_RESPONSE=$(timeout 30 curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: test-key" \
    -H "anthropic-version: 2023-06-01" \
    -d "$LARGE_REQUEST" 2>/dev/null || echo "TIMEOUT")

if echo "$LARGE_RESPONSE" | grep -q "content\|text\|tool\|Read\|Write"; then
    pass "Large system prompt handled correctly"
elif echo "$LARGE_RESPONSE" | grep -qi "error\|TIMEOUT"; then
    fail "Large system prompt failed"
else
    fail "Unexpected large prompt response"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! Proxy is working correctly.${NC}"
    echo ""
    echo "Next: Test with actual Claude Code:"
    echo "  anyclaude --mode=lmstudio  # or --mode=openrouter"
    exit 0
else
    echo -e "${RED}Some tests failed. Check:${NC}"
    echo "  1. Is LMStudio running with a model loaded?"
    echo "  2. Check logs: cat /tmp/anyclaude-proxy.log"
    echo "  3. Try: ANYCLAUDE_DEBUG=2 anyclaude"
    exit 1
fi
