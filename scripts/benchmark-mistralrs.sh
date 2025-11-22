#!/bin/bash
# Quick benchmark script for mistral.rs with MLX MoE model

MISTRALRS_BIN="$HOME/Documents/GitHub/mistral.rs/target/release/mistralrs-server"
MODEL_PATH="$HOME/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
PORT=8082

echo "🚀 Starting mistral.rs server..."
$MISTRALRS_BIN \
    --port $PORT \
    --token-source none \
    --isq Q4K \
    plain \
    -m "$MODEL_PATH" \
    -a qwen3moe > /tmp/mistralrs-benchmark.log 2>&1 &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
sleep 30

echo ""
echo "📊 Running benchmarks..."

# Test 1: Simple math
echo "Test 1: Simple math"
time curl -s -X POST "http://localhost:$PORT/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"2+2=?"}],"max_tokens":10}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Test 2: Code generation
echo ""
echo "Test 2: Code generation"
time curl -s -X POST "http://localhost:$PORT/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"Write a function to add two numbers in Python"}],"max_tokens":50}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Test 3: Multi-turn (cache test)
echo ""
echo "Test 3: Multi-turn conversation (cache test)"
time curl -s -X POST "http://localhost:$PORT/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi"},{"role":"user","content":"How are you?"}],"max_tokens":20}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

echo ""
echo "📈 Server Stats:"
tail -5 /tmp/mistralrs-benchmark.log | grep "Throughput"

echo ""
echo "🛑 Stopping server..."
kill $SERVER_PID

echo "✅ Benchmark complete!"
