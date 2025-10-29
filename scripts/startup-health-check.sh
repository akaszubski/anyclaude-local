#!/bin/bash
# Comprehensive health check for anyclaude startup
# Verifies all components are working before launching Claude Code

set -e

echo "════════════════════════════════════════════════════════════════"
echo "🔍 ANYCLAUDE STARTUP HEALTH CHECK"
echo "════════════════════════════════════════════════════════════════"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: vLLM-MLX server is running
echo ""
echo "1️⃣  Checking vLLM-MLX server..."

if ! curl -s http://localhost:8081/v1/models > /dev/null 2>&1; then
    echo -e "${RED}❌ vLLM-MLX server NOT running on port 8081${NC}"
    echo "   Start it with:"
    echo "   source ~/.venv-mlx/bin/activate"
    echo "   python scripts/vllm-mlx-server.py --model /path/to/model --port 8081"
    exit 1
fi

echo -e "${GREEN}✅ vLLM-MLX server is running${NC}"

# Check 2: Server responds to requests
echo ""
echo "2️⃣  Checking server responsiveness..."

RESPONSE=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"test"}],"stream":false,"max_tokens":10}')

if echo "$RESPONSE" | grep -q '"choices"'; then
    echo -e "${GREEN}✅ Server responds to requests${NC}"
else
    echo -e "${RED}❌ Server not responding correctly${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

# Check 3: Caching support
echo ""
echo "3️⃣  Checking caching support..."

if echo "$RESPONSE" | grep -q '"cache_read_input_tokens"'; then
    echo -e "${GREEN}✅ Caching field present in response${NC}"
else
    echo -e "${YELLOW}⚠️  Caching field not in response${NC}"
fi

# Check 4: Tool calling support
echo ""
echo "4️⃣  Checking tool calling support..."

if echo "$RESPONSE" | grep -q '"tool_calls"'; then
    echo -e "${GREEN}✅ Tool calls field present in response${NC}"
else
    echo -e "${YELLOW}⚠️  Tool calls field not in response${NC}"
fi

# Check 5: anyclaude config
echo ""
echo "5️⃣  Checking anyclaude config..."

if [ ! -f ".anyclauderc.json" ]; then
    echo -e "${YELLOW}⚠️  .anyclauderc.json not found${NC}"
else
    if grep -q "vllm-mlx" .anyclauderc.json; then
        echo -e "${GREEN}✅ vllm-mlx configured in .anyclauderc.json${NC}"
    else
        echo -e "${YELLOW}⚠️  vllm-mlx backend not configured${NC}"
    fi
fi

# Check 6: Node and TypeScript build
echo ""
echo "6️⃣  Checking TypeScript build..."

if [ ! -f "dist/main.js" ]; then
    echo -e "${YELLOW}⚠️  dist/main.js not found - running build${NC}"
    npm run build > /dev/null 2>&1
fi

if [ -f "dist/main.js" ]; then
    echo -e "${GREEN}✅ TypeScript build present${NC}"
else
    echo -e "${RED}❌ TypeScript build failed${NC}"
    exit 1
fi

# Final summary
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ ALL HEALTH CHECKS PASSED${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Ready to start anyclaude:"
echo "  anyclaude"
echo ""
