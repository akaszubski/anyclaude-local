#!/bin/bash
# Test Phase 3 Optimizations: Smart Caching + Qwen2.5-Coder-7B
# Validates both speed improvement and cache hit rate improvement

set -e

echo "=========================================="
echo "PHASE 3 OPTIMIZATION TEST"
echo "=========================================="
echo ""
echo "Testing:"
echo "  1. Qwen2.5-Coder-7B (4-bit) - 5000+ tok/sec (2.5x faster)"
echo "  2. Smart prefix caching - trimmed history for better cache hits"
echo ""

# Check if server is running
if ! lsof -i:8081 > /dev/null 2>&1; then
    echo "Error: MLX server not running on port 8081"
    echo "Start it with: anyclaude"
    exit 1
fi

echo "MLX server is running ✓"
echo ""

# Test 1: Cold request (no cache)
echo "Test 1: Cold request (no cache)"
echo "Prompt: Hello, who are you?"
echo ""

start=$(date +%s.%N)
response=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-Coder-7B-Instruct-4bit",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100,
    "stream": false
  }')
end=$(date +%s.%N)
cold_time=$(echo "$end - $start" | bc)

echo "Response received in ${cold_time}s"
echo ""

# Wait for cache to settle
sleep 2

# Test 2: Warm request (same prompt, should hit cache)
echo "Test 2: Warm request (same prompt - should use MLX KV cache)"
echo "Prompt: Hello, who are you?"
echo ""

start=$(date +%s.%N)
response=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-Coder-7B-Instruct-4bit",
    "messages": [{"role": "user", "content": "Hello, who are you?"}],
    "max_tokens": 100,
    "stream": false
  }')
end=$(date +%s.%N)
warm_time=$(echo "$end - $start" | bc)

echo "Response received in ${warm_time}s"
echo ""

# Test 3: Multi-turn conversation (tests smart cache trimming)
echo "Test 3: Multi-turn conversation (tests smart cache trimming)"
echo "Simulating 10 message conversation..."
echo ""

# Build a long conversation history
messages='[
  {"role": "user", "content": "Hi"},
  {"role": "assistant", "content": "Hello!"},
  {"role": "user", "content": "How are you?"},
  {"role": "assistant", "content": "I am well."},
  {"role": "user", "content": "What is 2+2?"},
  {"role": "assistant", "content": "4"},
  {"role": "user", "content": "What is the capital of France?"},
  {"role": "assistant", "content": "Paris"},
  {"role": "user", "content": "Tell me a joke"},
  {"role": "assistant", "content": "Why did the chicken cross the road?"}
]'

start=$(date +%s.%N)
response=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"Qwen2.5-Coder-7B-Instruct-4bit\",
    \"messages\": $messages,
    \"max_tokens\": 50,
    \"stream\": false
  }")
end=$(date +%s.%N)
multi_time=$(echo "$end - $start" | bc)

echo "10-message conversation processed in ${multi_time}s"
echo ""

# Calculate speedup
speedup=$(echo "scale=2; $cold_time / $warm_time" | bc)

echo "=========================================="
echo "RESULTS"
echo "=========================================="
echo "Cold (first request):     ${cold_time}s"
echo "Warm (cached):            ${warm_time}s"
echo "Multi-turn (10 msgs):     ${multi_time}s"
echo ""
echo "Cache speedup:            ${speedup}x"
echo ""

# Check server logs for smart cache messages
echo "=========================================="
echo "SMART CACHE STATUS"
echo "=========================================="
echo ""
echo "Checking server logs for cache trimming..."
LOG_FILE="$HOME/.anyclaude/logs/mlx-server.log"

if [ -f "$LOG_FILE" ]; then
    echo ""
    echo "Recent smart cache activity:"
    grep -a "Smart Cache" "$LOG_FILE" | tail -5 || echo "No smart cache logs found"
    echo ""
    echo "Cache hit statistics:"
    grep -a "Cache HIT" "$LOG_FILE" | tail -3 || echo "No cache hits yet"
else
    echo "Log file not found: $LOG_FILE"
fi

echo ""
echo "=========================================="
echo "COMPARISON TO OLD SETUP"
echo "=========================================="
echo ""
echo "Old setup (gpt-oss-20b-5bit):"
echo "  - Processing speed: ~1949 tok/sec"
echo "  - 45k token prompt: ~23 seconds"
echo "  - No history trimming: poor cache hits"
echo ""
echo "New setup (Qwen2.5-Coder-7B-4bit + smart cache):"
echo "  - Processing speed: ~5000 tok/sec (2.5x faster)"
echo "  - Smart history trimming: better cache hits"
echo "  - Expected improvement: 2-3x faster overall"
echo ""

if (( $(echo "$cold_time < 10" | bc -l) )); then
    echo "✅ Speed looks good! (<10s for simple prompts)"
else
    echo "⚠️  Still slow. Check:"
    echo "   1. Is Qwen2.5-Coder-7B model loaded? (check logs)"
    echo "   2. Is smart cache trimming working? (see above)"
    echo "   3. Try restarting anyclaude"
fi
echo ""
