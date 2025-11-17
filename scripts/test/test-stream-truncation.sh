#!/bin/bash

# Stream Truncation Regression Test Script
# Tests whether SSE responses are truncated mid-stream
#
# Usage: ./scripts/test/test-stream-truncation.sh <proxy_port>
# Example: ./scripts/test/test-stream-truncation.sh 57370

set -e

PROXY_PORT="${1:-8000}"
TEMP_DIR="/tmp/stream-tests"
mkdir -p "$TEMP_DIR"

echo "🧪 Stream Truncation Regression Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing proxy at: localhost:$PROXY_PORT"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
TOTAL=0

# Function to test a streaming response
test_stream() {
    local test_name="$1"
    local prompt="$2"
    local min_size="$3"

    TOTAL=$((TOTAL + 1))
    echo ""
    echo "📝 Test $TOTAL: $test_name"
    echo "   Prompt: ${prompt:0:60}..."

    # Create request body
    local request_body=$(cat <<EOF
{
  "model": "current-model",
  "messages": [
    {
      "role": "user",
      "content": "$prompt"
    }
  ],
  "stream": true
}
EOF
)

    # Make request and capture response
    local response_file="$TEMP_DIR/test_$TOTAL.txt"
    local has_error=0

    timeout 30 curl -s -N -X POST "http://localhost:$PROXY_PORT/v1/messages" \
        -H "Content-Type: application/json" \
        -d "$request_body" > "$response_file" 2>&1 || has_error=1

    # Analyze response
    local total_lines=$(wc -l < "$response_file")
    local total_bytes=$(wc -c < "$response_file")
    local event_count=$(grep -c "^event: " "$response_file" || echo 0)
    local has_message_stop=$(grep -c "message_stop" "$response_file" || echo 0)
    local last_event=$(grep "^event: " "$response_file" | tail -1 | sed 's/event: //')

    # Check response validity
    if [ "$has_message_stop" -gt 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        echo "   Events: $event_count"
        echo "   Lines: $total_lines"
        echo "   Size: $total_bytes bytes"
        echo "   Last event: $last_event"
        PASSED=$((PASSED + 1))

        # Show first few lines of response
        echo "   Sample:"
        head -3 "$response_file" | sed 's/^/     /'

    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "   Events: $event_count"
        echo "   Lines: $total_lines"
        echo "   Size: $total_bytes bytes"
        echo "   Last event: $last_event"
        echo "   Missing: message_stop event"
        FAILED=$((FAILED + 1))

        # Show last few lines for debugging
        echo "   Last lines:"
        tail -3 "$response_file" | sed 's/^/     /'
    fi

    # Check size requirement if specified
    if [ -n "$min_size" ] && [ "$total_bytes" -lt "$min_size" ]; then
        echo -e "   ${YELLOW}⚠️  WARNING: Response smaller than expected (expected >$min_size bytes)${NC}"
        FAILED=$((FAILED + 1))
    fi
}

# Run test cases
echo "🔍 Running regression tests...\n"

test_stream "Short response" "Say 'hello' in one word." "10"

test_stream "Medium response" "List 5 programming languages." "100"

test_stream "Long response" "Write a detailed explanation of what machine learning is, including supervised learning, unsupervised learning, and reinforcement learning." "500"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total: $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "💡 Debugging tips:"
    echo "  - Check MLX server logs: tail -f ~/.anyclaude/logs/mlx-server.log"
    echo "  - Run with debug logging: ANYCLAUDE_DEBUG=2 anyclaude"
    echo "  - Check test output: cat $TEMP_DIR/test_*.txt"
    exit 1
fi
