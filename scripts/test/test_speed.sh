#!/bin/bash
# Speed Test - Measure response times with different cache states

set -e

echo "=========================================="
echo "ANYCLAUDE SPEED BENCHMARK"
echo "=========================================="
echo ""

# Check if server is running
if ! lsof -i:8081 > /dev/null 2>&1; then
    echo "Error: MLX server not running on port 8081"
    echo "Start it with: anyclaude"
    exit 1
fi

# Test with curl to measure raw API speed
TEST_PROMPT="Hello, who are you?"

echo "Testing raw API speed (bypassing Claude Code overhead)..."
echo ""

# Test 1: Cold request
echo "Test 1: Cold request (first time)"
start=$(date +%s.%N)
curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gpt-oss-20b\",
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_PROMPT\"}],
    \"max_tokens\": 50,
    \"stream\": false
  }" > /dev/null
end=$(date +%s.%N)
cold_time=$(echo "$end - $start" | bc)
echo "Cold request time: ${cold_time}s"
echo ""

# Wait a moment
sleep 2

# Test 2: Warm request (same prompt)
echo "Test 2: Warm request (same prompt, should use cache)"
start=$(date +%s.%N)
curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gpt-oss-20b\",
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_PROMPT\"}],
    \"max_tokens\": 50,
    \"stream\": false
  }" > /dev/null
end=$(date +%s.%N)
warm_time=$(echo "$end - $start" | bc)
echo "Warm request time: ${warm_time}s"
echo ""

# Test 3: Different prompt (no cache hit)
echo "Test 3: Different prompt (no cache)"
start=$(date +%s.%N)
curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gpt-oss-20b\",
    \"messages\": [{\"role\": \"user\", \"content\": \"What is 2+2?\"}],
    \"max_tokens\": 50,
    \"stream\": false
  }" > /dev/null
end=$(date +%s.%N)
diff_time=$(echo "$end - $start" | bc)
echo "Different prompt time: ${diff_time}s"
echo ""

# Calculate speedup
speedup=$(echo "scale=2; $cold_time / $warm_time" | bc)

echo "=========================================="
echo "RESULTS"
echo "=========================================="
echo "Cold (first request):    ${cold_time}s"
echo "Warm (cached):           ${warm_time}s"
echo "Different prompt:        ${diff_time}s"
echo ""
echo "Cache speedup:           ${speedup}x"
echo ""

if (( $(echo "$speedup > 1.5" | bc -l) )); then
    echo "✅ Cache is working! (${speedup}x speedup)"
else
    echo "⚠️  Cache speedup lower than expected"
    echo "   MLX automatic caching may not be activating"
fi
echo ""

echo "=========================================="
echo "TOOL CALLING SPEED TEST"
echo "=========================================="
echo ""

echo "Testing with tool definitions (heavier prompt)..."

# Create a simple tool definition
TOOLS='[{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get weather",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {"type": "string"}
      }
    }
  }
}]'

start=$(date +%s.%N)
curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gpt-oss-20b\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}],
    \"tools\": $TOOLS,
    \"max_tokens\": 50,
    \"stream\": false
  }" > /dev/null
end=$(date +%s.%N)
tool_time=$(echo "$end - $start" | bc)

echo "With tools (Claude Code setup): ${tool_time}s"
echo ""

echo "Note: This is raw API performance."
echo "Claude Code adds ~1-3s overhead for formatting and processing."
