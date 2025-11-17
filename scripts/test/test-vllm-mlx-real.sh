#!/bin/bash
# Real integration test for MLX with actual server and data collection

set -e

BASE_URL="${1:-http://localhost:8081}"
RESULTS_FILE="/tmp/mlx-test-results-$(date +%s).json"
TIMEOUT=30

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "MLX Real Integration Test"
echo "=================================================="
echo "Server: $BASE_URL"
echo "Results: $RESULTS_FILE"
echo "Timeout: ${TIMEOUT}s per request"
echo ""

# Check server is running
echo "Checking server health..."
if ! timeout 5 curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server not responding at $BASE_URL${NC}"
    echo ""
    echo "Start the server with:"
    echo "  PROXY_ONLY=true anyclaude --mode=mlx"
    echo "Or configure auto-launch in .anyclauderc.json"
    exit 1
fi

HEALTH=$(curl -s "$BASE_URL/health")
MODEL=$(echo "$HEALTH" | jq -r '.model // "unknown"')
MODEL_LOADED=$(echo "$HEALTH" | jq -r '.model_loaded // false')

echo -e "${GREEN}✓ Server responding${NC}"
echo "  Model: $MODEL"
echo "  Model loaded: $MODEL_LOADED"
echo ""

# Initialize results file
cat > "$RESULTS_FILE" <<EOF
{
  "test_run": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "server": "$BASE_URL",
  "model": "$MODEL",
  "model_loaded": $MODEL_LOADED,
  "tests": [],
  "summary": {}
}
EOF

# Test counter
TEST_NUM=0
PASSED=0
FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local messages="$2"
    local tools="$3"
    local description="$4"

    TEST_NUM=$((TEST_NUM + 1))

    echo "Test $TEST_NUM: $test_name"
    echo "  Description: $description"

    # Prepare request
    local request="{\"messages\": $messages, \"stream\": false"
    if [ ! -z "$tools" ]; then
        request="$request, \"tools\": $tools"
    fi
    request="$request}"

    # Make request and measure time
    local start_ms=$(date +%s%N | cut -b1-13)
    local http_code=""
    local response=""
    local error=""

    # Run request with timeout
    if response=$(timeout $TIMEOUT curl -s -w "\n%{http_code}" \
        -X POST "$BASE_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "$request" 2>&1); then

        # Extract HTTP code (last line)
        http_code=$(echo "$response" | tail -n1)
        # Extract response body (everything except last line)
        response=$(echo "$response" | head -n-1)
    else
        http_code="000"
        error="TIMEOUT or connection error"
    fi

    local end_ms=$(date +%s%N | cut -b1-13)
    local latency_ms=$((end_ms - start_ms))

    # Parse response
    local success=false
    local tool_calls=""
    local finish_reason=""
    local content=""
    local error_msg=""
    local cache_hit=false

    if [ "$http_code" = "200" ]; then
        success=true
        content=$(echo "$response" | jq -r '.choices[0].message.content // "ERROR"' 2>/dev/null || echo "JSON_PARSE_ERROR")
        finish_reason=$(echo "$response" | jq -r '.choices[0].finish_reason // "unknown"' 2>/dev/null)
        tool_calls=$(echo "$response" | jq '.choices[0].message.tool_calls // []' 2>/dev/null)

        # Try to detect cache hit from response (identical responses mean cache)
        if [ -z "$error" ]; then
            cache_hit=true  # Simple heuristic: no error = likely cached
        fi
    elif [ "$http_code" = "000" ]; then
        error_msg="$error"
    else
        error_msg="HTTP $http_code"
        if echo "$response" | jq '.error.message' > /dev/null 2>&1; then
            error_msg="$error_msg: $(echo "$response" | jq -r '.error.message')"
        fi
    fi

    # Count tool calls
    local tool_call_count=0
    if [ ! -z "$tool_calls" ] && [ "$tool_calls" != "[]" ]; then
        tool_call_count=$(echo "$tool_calls" | jq 'length' 2>/dev/null || echo 0)
    fi

    # Status
    local status="PASS"
    if [ "$http_code" != "200" ]; then
        status="FAIL"
        FAILED=$((FAILED + 1))
    else
        PASSED=$((PASSED + 1))
    fi

    # Print result
    if [ "$status" = "PASS" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} - ${latency_ms}ms"
    else
        echo -e "  ${RED}✗ FAIL${NC} - $error_msg"
    fi
    echo "  Content length: ${#content}"
    echo "  Finish reason: $finish_reason"
    echo "  Tool calls: $tool_call_count"
    echo ""

    # Append to results file
    local test_result=$(cat <<EOF
{
  "test_num": $TEST_NUM,
  "name": "$test_name",
  "description": "$description",
  "status": "$status",
  "latency_ms": $latency_ms,
  "http_code": "$http_code",
  "success": $success,
  "finish_reason": "$finish_reason",
  "tool_calls": $tool_call_count,
  "content_length": ${#content},
  "error": "$error_msg"
}
EOF
    )

    # Update results file
    local temp_file=$(mktemp)
    jq ".tests += [$test_result]" "$RESULTS_FILE" > "$temp_file"
    mv "$temp_file" "$RESULTS_FILE"
}

# ============================================================
# Test Suite 1: Basic Functionality
# ============================================================
echo "=================================================="
echo "SUITE 1: Basic Functionality"
echo "=================================================="
echo ""

run_test "Simple Chat" \
    '[{"role": "user", "content": "What is 2+2?"}]' \
    '' \
    "Basic question without tools"

run_test "Identical Request (Cache Test)" \
    '[{"role": "user", "content": "What is 2+2?"}]' \
    '' \
    "Repeat of previous - should be faster/cached"

run_test "System Prompt" \
    '[{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "Say hello"}]' \
    '' \
    "Request with system prompt"

run_test "Conversation History" \
    '[{"role": "user", "content": "What is Python?"}, {"role": "assistant", "content": "Python is a programming language."}, {"role": "user", "content": "Tell me more"}]' \
    '' \
    "Multi-turn conversation"

echo ""

# ============================================================
# Test Suite 2: Tool Calling
# ============================================================
echo "=================================================="
echo "SUITE 2: Tool Calling"
echo "=================================================="
echo ""

run_test "With Single Tool" \
    '[{"role": "user", "content": "Search for information about Claude"}]' \
    '[{"type": "function", "function": {"name": "search_web", "description": "Search the web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]' \
    "Request with single tool available"

run_test "With Multiple Tools" \
    '[{"role": "user", "content": "What is the weather in New York?"}]' \
    '[{"type": "function", "function": {"name": "get_weather", "description": "Get weather", "parameters": {"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}}}, {"type": "function", "function": {"name": "search_web", "description": "Search web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]' \
    "Request with multiple tools available"

echo ""

# ============================================================
# Test Suite 3: Stress/Performance
# ============================================================
echo "=================================================="
echo "SUITE 3: Stress & Performance"
echo "=================================================="
echo ""

# Test rapid repeated requests
echo "Running 5 rapid requests (should show caching benefit)..."
for i in {1..5}; do
    run_test "Rapid Request #$i" \
        '[{"role": "user", "content": "What is 2+2?"}]' \
        '' \
        "Rapid repeat - #$i"
done

echo ""

# ============================================================
# Analyze Results
# ============================================================
echo "=================================================="
echo "ANALYZING RESULTS"
echo "=================================================="
echo ""

# Calculate statistics
python3 << 'PYTHON_END'
import json
import sys

with open("'$RESULTS_FILE'") as f:
    data = json.load(f)

tests = data['tests']
passed = len([t for t in tests if t['status'] == 'PASS'])
failed = len([t for t in tests if t['status'] == 'FAIL'])
total = len(tests)

latencies = [t['latency_ms'] for t in tests if t['status'] == 'PASS']
if latencies:
    min_latency = min(latencies)
    max_latency = max(latencies)
    avg_latency = sum(latencies) / len(latencies)
else:
    min_latency = max_latency = avg_latency = 0

# Find cache hits (subsequent identical requests should be faster)
cache_test_latencies = [t['latency_ms'] for t in tests
                       if 'Rapid Request' in t['name'] and t['status'] == 'PASS']

print(f"\nTest Results Summary:")
print(f"  Total: {total}")
print(f"  Passed: {passed}")
print(f"  Failed: {failed}")
print(f"  Success rate: {(passed/total*100):.1f}%")
print()

print(f"Latency Statistics:")
print(f"  Min: {min_latency}ms")
print(f"  Max: {max_latency}ms")
print(f"  Avg: {avg_latency:.1f}ms")

if len(cache_test_latencies) > 1:
    first = cache_test_latencies[0]
    rest = cache_test_latencies[1:]
    avg_rest = sum(rest) / len(rest)
    print()
    print(f"Cache Performance (5 identical requests):")
    print(f"  First request: {first}ms (uncached)")
    print(f"  Avg of rest: {avg_rest:.1f}ms (cached)")
    if first > 0:
        speedup = first / avg_rest if avg_rest > 0 else 0
        print(f"  Speedup: {speedup:.1f}x")

print()
print(f"Full results saved to: '$RESULTS_FILE'")
PYTHON_END

echo ""
echo "=================================================="
echo "Test Complete"
echo "=================================================="
echo ""
echo "Results JSON: $RESULTS_FILE"
echo ""
echo "View full results:"
echo "  cat $RESULTS_FILE | jq '.'"
echo ""
echo "View summary:"
echo "  cat $RESULTS_FILE | jq '.tests[] | {name, status, latency_ms}'"
echo ""
