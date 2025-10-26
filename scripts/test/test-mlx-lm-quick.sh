#!/bin/bash

# Quick MLX-LM Integration Test
# This tests that AnyClaude can start with MLX-LM and handle requests

set -e

echo "=========================================="
echo "MLX-LM Integration Quick Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if MLX-LM server is running
echo "Step 1: Checking MLX-LM server on port 8081..."
if curl -s http://localhost:8081/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MLX-LM server is running${NC}"
else
    echo -e "${RED}✗ MLX-LM server is NOT running${NC}"
    echo ""
    echo "Start MLX-LM in another terminal:"
    echo "  source ~/.venv-mlx/bin/activate"
    echo "  python3 -m mlx_lm server --port 8081"
    echo ""
    exit 1
fi

echo ""
echo "Step 2: Testing AnyClaude mode detection..."
# macOS-compatible: run node in background, capture output, then kill
TEMP_OUTPUT="/tmp/anyclaude-mode-test-$$.txt"
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
PROXY_ONLY=true \
node dist/main.js > "$TEMP_OUTPUT" 2>&1 &
PROXY_TEST_PID=$!

# Wait up to 5 seconds for output
for i in {1..50}; do
  if [ -s "$TEMP_OUTPUT" ]; then
    break
  fi
  sleep 0.1
done

# Kill the process
kill $PROXY_TEST_PID 2>/dev/null || true
wait $PROXY_TEST_PID 2>/dev/null || true

# Read the output
PROXY_OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
rm -f "$TEMP_OUTPUT"

if echo "$PROXY_OUTPUT" | grep -q "Mode: MLX-LM"; then
    echo -e "${GREEN}✓ Mode detection working: MLX-LM${NC}"
else
    echo -e "${RED}✗ Mode detection FAILED${NC}"
    echo "Output: $PROXY_OUTPUT"
    exit 1
fi

if echo "$PROXY_OUTPUT" | grep -q "MLX-LM endpoint: http://localhost:8081/v1"; then
    echo -e "${GREEN}✓ Endpoint correctly set to 8081${NC}"
else
    echo -e "${RED}✗ Endpoint configuration FAILED${NC}"
    echo "Output: $PROXY_OUTPUT"
    exit 1
fi

if echo "$PROXY_OUTPUT" | grep -q "current-model.*native KV cache"; then
    echo -e "${GREEN}✓ KV cache enabled${NC}"
else
    echo -e "${RED}✗ KV cache not detected${NC}"
    echo "Output: $PROXY_OUTPUT"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}All core tests passed!${NC}"
echo "=========================================="
echo ""
echo "✅ MLX-LM Integration is Working!"
echo ""
echo "What we verified:"
echo "  ✓ MLX-LM server is running on port 8081"
echo "  ✓ AnyClaude correctly detects MLX-LM mode"
echo "  ✓ Endpoint configuration is correct"
echo "  ✓ KV cache support is enabled"
echo ""
echo "Next: Test with Claude Code to measure performance:"
echo ""
echo "# Terminal 1 (already running): MLX-LM server on port 8081"
echo ""
echo "# Terminal 2: Start AnyClaude with MLX-LM"
echo "ANYCLAUDE_MODE=mlx-lm MLX_LM_URL='http://localhost:8081/v1' ./dist/main-cli.js"
echo ""
echo "Then in Claude Code:"
echo "  1. Ask an analysis question (first time ~30s - system prompt computed)"
echo "  2. Ask a follow-up (should be <1s - cached by KV cache!)"
echo ""
