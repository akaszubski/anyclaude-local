#!/bin/bash
# Test vLLM-MLX caching performance
# This script tests that cached requests return immediately vs uncached requests

set -e

BASE_URL="${1:-http://localhost:8081}"
MODEL_PATH="${2:-.}"

echo "🧪 vLLM-MLX Cache Performance Test"
echo "===================================="
echo "Base URL: $BASE_URL"
echo ""

# Check if server is running
echo "✓ Checking server health..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ Server not running at $BASE_URL"
    echo "Start the server with:"
    echo "  VLLM_MLX_URL=$BASE_URL anyclaude --mode=vllm-mlx"
    exit 1
fi

echo "✓ Server is healthy"
echo ""

# Test 1: Single request (uncached)
echo "Test 1: First request (UNCACHED - should take longer)"
echo "------------------------------------------------------"
TIME_START=$(date +%s%N)

RESPONSE=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 2+2?"}
    ],
    "stream": false
  }')

TIME_END=$(date +%s%N)
TIME_MS=$(( (TIME_END - TIME_START) / 1000000 ))

echo "Response: $(echo $RESPONSE | jq -r '.choices[0].message.content')"
echo "Time: ${TIME_MS}ms"
FIRST_TIME=$TIME_MS
echo ""

# Test 2: Same request (cached)
echo "Test 2: Identical request (CACHED - should be instant)"
echo "-----------------------------------------------------"
TIME_START=$(date +%s%N)

RESPONSE=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 2+2?"}
    ],
    "stream": false
  }')

TIME_END=$(date +%s%N)
TIME_MS=$(( (TIME_END - TIME_START) / 1000000 ))

echo "Response: $(echo $RESPONSE | jq -r '.choices[0].message.content')"
echo "Time: ${TIME_MS}ms"
SECOND_TIME=$TIME_MS
echo ""

# Test 3: Different request (uncached)
echo "Test 3: Different request (UNCACHED - should take longer)"
echo "---------------------------------------------------------"
TIME_START=$(date +%s%N)

RESPONSE=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 3+3?"}
    ],
    "stream": false
  }')

TIME_END=$(date +%s%N)
TIME_MS=$(( (TIME_END - TIME_START) / 1000000 ))

echo "Response: $(echo $RESPONSE | jq -r '.choices[0].message.content')"
echo "Time: ${TIME_MS}ms"
THIRD_TIME=$TIME_MS
echo ""

# Test 4: Check cache stats
echo "Test 4: Check cache statistics"
echo "------------------------------"
STATS=$(curl -s "$BASE_URL/health" | jq '.cache')
echo "Cache stats:"
echo "$STATS" | jq '.'
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo "First request (uncached):     ${FIRST_TIME}ms"
echo "Second request (cached):      ${SECOND_TIME}ms (same as first)"
echo "Third request (uncached):     ${THIRD_TIME}ms (different prompt)"
echo ""

if [ $SECOND_TIME -lt $FIRST_TIME ]; then
    SPEEDUP=$(( FIRST_TIME / SECOND_TIME ))
    echo "✅ Cache working! ${SPEEDUP}x speedup on cached request"
else
    echo "⚠️  Cache may not be working as expected (similar times)"
fi

echo ""
echo "🎉 Test complete!"
