#!/bin/bash
# Compare LMStudio vs vLLM-MLX performance with same model

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         BACKEND PERFORMANCE COMPARISON                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if model path is provided
if [ -z "$1" ]; then
    echo "❌ ERROR: Model path required"
    echo ""
    echo "Usage:"
    echo "  ./scripts/debug/compare-backends.sh /path/to/model"
    echo ""
    echo "Example:"
    echo "  ./scripts/debug/compare-backends.sh /Users/you/Models/MiniMax-M2-MLX-8bit"
    exit 1
fi

MODEL_PATH="$1"
MODEL_NAME=$(basename "$MODEL_PATH")

echo "Model: $MODEL_NAME"
echo "Path: $MODEL_PATH"
echo ""

# Test prompt (simple, consistent)
TEST_PROMPT="write hello world in python"

# Cleanup old traces
echo "🧹 Cleaning old traces..."
rm -rf ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null || true
rm -rf ~/.anyclaude/traces/vllm-mlx/*.json 2>/dev/null || true
echo ""

# Test 1: LMStudio
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: LMStudio Backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "   1. Open LMStudio"
echo "   2. Load model: $MODEL_NAME"
echo "   3. Start server on port 8082"
echo ""
read -p "Press ENTER when LMStudio server is ready..."

echo ""
echo "🚀 Testing LMStudio..."
echo "   Prompt: \"$TEST_PROMPT\""
echo ""

# Run proxy in background
PROXY_ONLY=true ANYCLAUDE_DEBUG=2 ANYCLAUDE_MODE=lmstudio node dist/main.js &
PROXY_PID=$!

# Wait for proxy to start
sleep 2

# Get proxy port from logs (assume default 60000-61000 range)
PROXY_PORT=$(lsof -i :60000-61000 -sTCP:LISTEN -t | head -1 | xargs lsof -Pan -p | grep LISTEN | awk '{print $9}' | cut -d: -f2 | head -1)

if [ -z "$PROXY_PORT" ]; then
    echo "❌ Failed to detect proxy port"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

echo "   Proxy running on port: $PROXY_PORT"

# Make test request
curl -s -X POST "http://localhost:$PROXY_PORT/v1/messages" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "x-api-key: test" \
  -d "{
    \"model\": \"current-model\",
    \"max_tokens\": 100,
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_PROMPT\"}],
    \"stream\": true
  }" > /tmp/lmstudio-response.txt

# Stop proxy
kill $PROXY_PID 2>/dev/null || true

echo ""
echo "✅ LMStudio test complete"
echo ""

# Test 2: vLLM-MLX
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: vLLM-MLX Backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Update config to use this model
TMP_CONFIG=$(mktemp)
jq ".backends.\"vllm-mlx\".model = \"$MODEL_PATH\"" .anyclauderc.json > "$TMP_CONFIG"
mv "$TMP_CONFIG" .anyclauderc.json

echo "🚀 Testing vLLM-MLX..."
echo "   Auto-launching server with: $MODEL_NAME"
echo "   Prompt: \"$TEST_PROMPT\""
echo ""

# Run proxy with auto-launch
PROXY_ONLY=true ANYCLAUDE_DEBUG=2 ANYCLAUDE_MODE=vllm-mlx node dist/main.js &
PROXY_PID=$!

# Wait for server to start (longer for model loading)
echo "   Waiting for model to load (~30-50 seconds)..."
sleep 50

# Get proxy port
PROXY_PORT=$(lsof -i :60000-61000 -sTCP:LISTEN -t | head -1 | xargs lsof -Pan -p | grep LISTEN | awk '{print $9}' | cut -d: -f2 | head -1)

if [ -z "$PROXY_PORT" ]; then
    echo "❌ Failed to detect proxy port"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

echo "   Proxy running on port: $PROXY_PORT"

# Make test request
curl -s -X POST "http://localhost:$PROXY_PORT/v1/messages" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "x-api-key: test" \
  -d "{
    \"model\": \"$MODEL_PATH\",
    \"max_tokens\": 100,
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_PROMPT\"}],
    \"stream\": true
  }" > /tmp/vllm-response.txt

# Stop proxy (will also stop vLLM-MLX server)
kill $PROXY_PID 2>/dev/null || true
sleep 5

echo ""
echo "✅ vLLM-MLX test complete"
echo ""

# Analysis
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract tok/s from logs (if available)
echo "📊 Performance Metrics:"
echo ""

LMSTUDIO_TRACE=$(ls -t ~/.anyclaude/traces/lmstudio/*.json 2>/dev/null | head -1)
VLLM_TRACE=$(ls -t ~/.anyclaude/traces/vllm-mlx/*.json 2>/dev/null | head -1)

if [ -f "$LMSTUDIO_TRACE" ]; then
    echo "LMStudio:"
    echo "  Trace: $(basename $LMSTUDIO_TRACE)"
    echo "  Input tokens: $(jq -r '.response.body.usage.input_tokens // "N/A"' $LMSTUDIO_TRACE)"
    echo "  Output tokens: $(jq -r '.response.body.usage.output_tokens // "N/A"' $LMSTUDIO_TRACE)"
    echo ""
fi

if [ -f "$VLLM_TRACE" ]; then
    echo "vLLM-MLX:"
    echo "  Trace: $(basename $VLLM_TRACE)"
    echo "  Input tokens: $(jq -r '.response.body.usage.input_tokens // "N/A"' $VLLM_TRACE)"
    echo "  Output tokens: $(jq -r '.response.body.usage.output_tokens // "N/A"' $VLLM_TRACE)"
    echo ""
fi

echo "📁 Trace Files:"
echo "  LMStudio: $LMSTUDIO_TRACE"
echo "  vLLM-MLX: $VLLM_TRACE"
echo ""

echo "🔍 To analyze differences:"
echo "  # Compare system prompts"
echo "  diff <(jq -r '.request.body.system' $LMSTUDIO_TRACE) <(jq -r '.request.body.system' $VLLM_TRACE)"
echo ""
echo "  # Compare tool counts"
echo "  jq '.request.body.tools | length' $LMSTUDIO_TRACE $VLLM_TRACE"
echo ""
echo "  # Compare responses"
echo "  jq '.response.body.content' $LMSTUDIO_TRACE $VLLM_TRACE"
echo ""

echo "✅ Comparison complete!"
