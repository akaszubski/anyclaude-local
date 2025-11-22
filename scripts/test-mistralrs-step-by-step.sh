#!/bin/bash
# Test mistral.rs with MLX MoE model (Qwen3-Coder-30B-A3B)
#
# This script tests the switch_mlp fix step-by-step

set -e

MISTRALRS_BIN="$HOME/Documents/GitHub/mistral.rs/target/release/mistralrs-server"
MODEL_PATH="$HOME/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
TEST_PORT=8082

echo "=== Step 1: Check mistral.rs binary ==="
if [ ! -f "$MISTRALRS_BIN" ]; then
    echo "❌ Error: mistralrs-server not found at $MISTRALRS_BIN"
    echo "Please build with: cd ~/Documents/GitHub/mistral.rs && cargo build --release --features metal"
    exit 1
fi
echo "✅ Found: $MISTRALRS_BIN"

echo ""
echo "=== Step 2: Check model files ==="
if [ ! -d "$MODEL_PATH" ]; then
    echo "❌ Error: Model not found at $MODEL_PATH"
    exit 1
fi
echo "✅ Found model at: $MODEL_PATH"

echo ""
echo "=== Step 3: Verify switch_mlp weights exist ==="
if ! grep -q "switch_mlp" "$MODEL_PATH/model.safetensors.index.json"; then
    echo "❌ Error: No switch_mlp weights found in model"
    exit 1
fi
echo "✅ Model contains switch_mlp weights"

echo ""
echo "=== Step 4: Start mistral.rs server ==="
echo "Port: $TEST_PORT"
echo "Model: $MODEL_PATH"
echo ""

# Kill any existing server on this port
lsof -ti:$TEST_PORT | xargs kill -9 2>/dev/null || true

# Start server
"$MISTRALRS_BIN" \
    --port "$TEST_PORT" \
    --token-source none \
    --isq Q4K \
    plain \
    -m "$MODEL_PATH" \
    -a qwen3moe &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
echo ""
echo "=== Step 5: Wait for server to load model ==="
echo "This may take 30-60 seconds..."
sleep 5

for i in {1..60}; do
    if curl -s "http://localhost:$TEST_PORT/health" > /dev/null 2>&1; then
        echo "✅ Server is ready!"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

echo ""
echo "=== Step 6: Test basic completion ==="
RESPONSE=$(curl -s -X POST "http://localhost:$TEST_PORT/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "qwen3moe",
        "messages": [{"role": "user", "content": "What is 2+2?"}],
        "max_tokens": 50,
        "temperature": 0
    }')

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "error"; then
    echo ""
    echo "❌ Error in response"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "✅ Basic completion works!"

echo ""
echo "=== Step 7: Test tool calling ==="
TOOL_RESPONSE=$(curl -s -X POST "http://localhost:$TEST_PORT/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "qwen3moe",
        "messages": [{"role": "user", "content": "What files are in the current directory?"}],
        "tools": [{
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files in a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Directory path"}
                    },
                    "required": ["path"]
                }
            }
        }],
        "max_tokens": 100,
        "temperature": 0
    }')

echo "Tool Response:"
echo "$TOOL_RESPONSE" | python3 -m json.tool || echo "$TOOL_RESPONSE"

if echo "$TOOL_RESPONSE" | grep -q "tool_calls"; then
    echo ""
    echo "✅ Tool calling works!"
else
    echo ""
    echo "⚠️  Tool calling may not be working (no tool_calls in response)"
fi

echo ""
echo "=== Step 8: Cleanup ==="
kill $SERVER_PID 2>/dev/null || true
echo "✅ Server stopped"

echo ""
echo "=== ✅ All tests complete! ==="
echo ""
echo "Next steps:"
echo "1. If all tests passed, the switch_mlp fix works!"
echo "2. Update anyclaude config to use mistral.rs"
echo "3. Test with Claude Code"
