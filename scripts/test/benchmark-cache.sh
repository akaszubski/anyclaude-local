#!/bin/bash
# Cache Performance Benchmark Script
#
# Measures the performance impact of prompt caching by:
# 1. Running identical requests multiple times
# 2. Comparing latency between first and cached requests
# 3. Displaying cost savings estimates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROXY_URL="${ANTHROPIC_BASE_URL:-http://localhost:52345}"
API_KEY="${ANTHROPIC_API_KEY:-}"
NUM_REQUESTS="${1:-3}"
BENCHMARK_FILE="/tmp/cache-benchmark-$(date +%s).json"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         Prompt Caching Performance Benchmark${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}✗ Error: ANTHROPIC_API_KEY not set${NC}"
  echo "Usage: ANTHROPIC_API_KEY=your-key ./benchmark-cache.sh [num_requests]"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}✗ Error: jq is required but not installed${NC}"
  exit 1
fi

if ! command -v curl &> /dev/null; then
  echo -e "${RED}✗ Error: curl is required but not installed${NC}"
  exit 1
fi

# Create test payload with caching
create_payload() {
  cat << 'EOF'
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 256,
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, Anthropic's official CLI for Claude. You are an interactive CLI tool that helps users with software engineering tasks.\n\nYou excel at:\n- Reading and analyzing code\n- Suggesting improvements\n- Explaining complex concepts\n- Solving problems\n\nAlways be concise and helpful.",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is prompt caching and why is it useful?",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    }
  ]
}
EOF
}

echo -e "${YELLOW}Configuration:${NC}"
echo "  Proxy URL: $PROXY_URL"
echo "  Requests: $NUM_REQUESTS"
echo "  Payload size: $(create_payload | jq length) bytes"
echo ""

# Run benchmark
declare -a latencies=()
declare -a cache_reads=()
declare -a cache_writes=()
total_time=0

for i in $(seq 1 $NUM_REQUESTS); do
  echo -ne "${YELLOW}Request $i/$NUM_REQUESTS:${NC} "

  start_time=$(date +%s%N)

  response=$(curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$(create_payload)")

  end_time=$(date +%s%N)

  # Calculate latency in milliseconds
  latency=$(( (end_time - start_time) / 1000000 ))
  latencies+=($latency)

  # Extract cache metrics from response
  cache_read=$(echo "$response" | jq -r '.usage.cache_read_input_tokens // 0')
  cache_write=$(echo "$response" | jq -r '.usage.cache_creation_input_tokens // 0')
  cache_reads+=($cache_read)
  cache_writes+=($cache_write)

  total_time=$((total_time + latency))

  # Display status
  if [ "$cache_write" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} ${latency}ms (cache write: ${cache_write} tokens)"
  elif [ "$cache_read" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} ${latency}ms (cache read: ${cache_read} tokens)"
  else
    echo -e "${GREEN}✓${NC} ${latency}ms"
  fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Results Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Calculate statistics
first_latency=${latencies[0]}
avg_cached_latency=0
num_cached=0

if [ $NUM_REQUESTS -gt 1 ]; then
  for i in $(seq 1 $((NUM_REQUESTS - 1))); do
    avg_cached_latency=$((avg_cached_latency + latencies[i]))
  done
  num_cached=$((NUM_REQUESTS - 1))
  avg_cached_latency=$((avg_cached_latency / num_cached))
fi

echo -e "${YELLOW}Latency Metrics:${NC}"
echo "  First request (cache write):  ${first_latency}ms"
if [ $num_cached -gt 0 ]; then
  echo "  Avg cached requests:          ${avg_cached_latency}ms"
  improvement=$(( (first_latency - avg_cached_latency) * 100 / first_latency ))
  echo -e "  Improvement:                  ${GREEN}${improvement}%${NC}"
else
  echo "  (Cached metrics will show on next run)"
fi

# Calculate cache efficiency
total_cache_writes=0
total_cache_reads=0

for writes in "${cache_writes[@]}"; do
  total_cache_writes=$((total_cache_writes + writes))
done

for reads in "${cache_reads[@]}"; do
  total_cache_reads=$((total_cache_reads + reads))
done

echo ""
echo -e "${YELLOW}Cache Efficiency:${NC}"
echo "  Total tokens cached:          ${total_cache_writes}"
echo "  Total tokens read from cache: ${total_cache_reads}"

if [ $total_cache_reads -gt 0 ]; then
  cost_savings=$((total_cache_reads * 90 / 100))
  echo -e "  Estimated cost reduction:     ${GREEN}${cost_savings} token equivalents saved${NC}"
fi

echo ""
echo -e "${YELLOW}Performance Summary:${NC}"
echo "  Total time: ${total_time}ms"
if [ $NUM_REQUESTS -gt 1 ]; then
  avg_latency=$((total_time / NUM_REQUESTS))
  echo "  Average latency: ${avg_latency}ms"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Recommendations
echo ""
echo -e "${YELLOW}Recommendations:${NC}"

if [ $total_cache_reads -eq 0 ]; then
  echo "  ℹ  First request creates cache. Run again to see cache hit benefits."
  echo "  ℹ  Cache TTL: 5 minutes. Run within this window for optimal results."
else
  if [ $improvement -lt 20 ]; then
    echo "  ⚠  Cache improvement is minimal. Consider increasing cached context size."
  elif [ $improvement -gt 50 ]; then
    echo "  ✓  Excellent cache performance! Structure prompts this way in production."
  else
    echo "  ✓  Good cache performance. Cache is working effectively."
  fi
fi

echo "  ℹ  Metrics saved to: $(find ~/.anyclaude/cache-metrics -type f -newest | head -1)"
echo ""
