#!/bin/bash
# Quick Cache Performance Test
# Tests prompt caching with 3 requests to see hit/miss pattern

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROXY_URL="${ANTHROPIC_BASE_URL:-http://localhost:52345}"
API_KEY="${ANTHROPIC_API_KEY}"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}        Quick Cache Performance Test${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

# Check prerequisites
if [ -z "$API_KEY" ]; then
  echo -e "${RED}✗ Error: ANTHROPIC_API_KEY not set${NC}"
  echo "Usage: ANTHROPIC_API_KEY=your-key ./test-cache-quick.sh"
  exit 1
fi

# Check curl
if ! command -v curl &> /dev/null; then
  echo -e "${RED}✗ Error: curl is required${NC}"
  exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  Proxy URL: $PROXY_URL"
echo "  API Key: ${API_KEY:0:10}..."
echo ""

# Prepare test payload
create_payload() {
  local message="$1"
  cat << EOF
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 50,
  "system": [{"type": "text", "text": "You are a helpful assistant. Keep responses brief."}],
  "messages": [{"role": "user", "content": [{"type": "text", "text": "$message"}]}]
}
EOF
}

# Run test
declare -a times=()
declare -a cache_status=()

for i in 1 2 3; do
  message_text="Test message $i"
  echo -ne "${YELLOW}Request $i/3:${NC} "

  start=$(date +%s%N)

  response=$(curl -s -X POST "$PROXY_URL/v1/messages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$(create_payload "$message_text")" 2>/dev/null)

  end=$(date +%s%N)

  # Calculate latency in milliseconds
  latency=$(( (end - start) / 1000000 ))
  times+=($latency)

  # Extract response
  if echo "$response" | grep -q '"content"'; then
    echo -e "${GREEN}✓${NC} ${latency}ms"
  else
    echo -e "${RED}✗${NC} Failed (${latency}ms)"
    echo "Response: $response"
    exit 1
  fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Results${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Latencies:${NC}"
echo "  Request 1: ${times[0]}ms (baseline)"
echo "  Request 2: ${times[1]}ms"
echo "  Request 3: ${times[2]}ms"

# Calculate improvements
if [ ${times[0]} -gt 0 ]; then
  improvement2=$(( (times[0] - times[1]) * 100 / times[0] ))
  improvement3=$(( (times[0] - times[2]) * 100 / times[0] ))

  echo ""
  echo -e "${YELLOW}Improvements:${NC}"
  echo "  Request 2: ${improvement2}% faster"
  echo "  Request 3: ${improvement3}% faster"

  if [ $improvement2 -gt 50 ]; then
    echo -e "\n${GREEN}✓ Cache is working! Requests 2+ are significantly faster${NC}"
  elif [ $improvement2 -gt 0 ]; then
    echo -e "\n${YELLOW}⚠ Cache may be working but improvement is modest${NC}"
  else
    echo -e "\n${RED}✗ Cache doesn't appear to be working${NC}"
  fi
else
  echo -e "\n${RED}✗ Unable to calculate improvements${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Check debug output: ANYCLAUDE_DEBUG=2 bun run src/main.ts"
echo "  2. Look for: [Prompt Cache] HIT / MISS"
echo "  3. Read: TESTING_CACHE_PERFORMANCE.md"
echo ""
