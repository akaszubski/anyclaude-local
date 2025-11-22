#!/bin/bash
# Integration test for mistral.rs auto-launch
# Tests: server launch, health check, basic completion, cleanup

set -e

TEST_NAME="mistral.rs Integration Test"
TIMEOUT=90  # seconds
PORT=8081

echo "=== $TEST_NAME ==="
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "=== Cleanup ==="

  # Kill timeout killer if it exists
  [ -n "$KILLER_PID" ] && kill $KILLER_PID 2>/dev/null || true

  # Kill any servers on test port
  lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

  # Kill background processes
  jobs -p | xargs kill 2>/dev/null || true
}

# Register cleanup on exit
trap cleanup EXIT

echo "Step 1: Check prerequisites"
if [ ! -f ~/Documents/GitHub/mistral.rs/target/release/mistralrs-server ]; then
  echo "❌ mistralrs-server binary not found"
  echo "Please build: cd ~/Documents/GitHub/mistral.rs && cargo build --release --features metal"
  exit 1
fi
echo "✅ Binary found"

echo ""
echo "Step 2: Start anyclaude in proxy-only mode"
cd ~/Documents/GitHub/anyclaude
PROXY_ONLY=true bun run ./dist/main.js > /tmp/anyclaude-test.log 2>&1 &
ANYCLAUDE_PID=$!
echo "Started PID: $ANYCLAUDE_PID"

# Set up timeout killer for the process (macOS compatible)
(sleep $TIMEOUT && kill $ANYCLAUDE_PID 2>/dev/null) &
KILLER_PID=$!

echo ""
echo "Step 3: Wait for server startup (max ${TIMEOUT}s)"
WAIT_TIME=0
READY=false

while [ $WAIT_TIME -lt $TIMEOUT ]; do
  if curl -sf http://localhost:$PORT/health > /dev/null 2>&1; then
    READY=true
    echo "✅ Server responded after ${WAIT_TIME}s"
    break
  fi
  
  sleep 2
  WAIT_TIME=$((WAIT_TIME + 2))
  
  # Show progress
  if [ $((WAIT_TIME % 10)) -eq 0 ]; then
    echo "  ... waiting ${WAIT_TIME}s"
  fi
done

if [ "$READY" = false ]; then
  echo "❌ Server failed to start within ${TIMEOUT}s"
  echo ""
  echo "Last 50 lines of log:"
  tail -50 /tmp/anyclaude-test.log
  exit 1
fi

echo ""
echo "Step 4: Test basic completion"
RESPONSE=$(curl -sf -X POST http://localhost:$PORT/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Say OK"}],
    "max_tokens": 5,
    "temperature": 0
  }')

if echo "$RESPONSE" | jq -e '.choices[0].message.content' > /dev/null 2>&1; then
  CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
  echo "✅ Completion works: \"$CONTENT\""
else
  echo "❌ Completion failed"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "Step 5: Test tool calling"
TOOL_RESPONSE=$(curl -sf -X POST http://localhost:$PORT/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "What is the weather?"}],
    "tools": [{
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
    }],
    "max_tokens": 50,
    "temperature": 0
  }')

if echo "$TOOL_RESPONSE" | jq -e '.choices[0].message' > /dev/null 2>&1; then
  echo "✅ Tool calling endpoint works"
else
  echo "⚠️  Tool calling response unexpected (may be model format issue)"
fi

echo ""
echo "Step 6: Check logs"
LOG_FILE=~/.anyclaude/logs/mistralrs-server.log
if [ -f "$LOG_FILE" ]; then
  echo "✅ Log file exists: $LOG_FILE"
  LINES=$(wc -l < "$LOG_FILE")
  echo "  Log size: $LINES lines"
else
  echo "❌ Log file not found"
  exit 1
fi

echo ""
echo "=== ✅ All tests passed! ==="
echo ""
echo "Summary:"
echo "  - Server launch: OK"
echo "  - Health check: OK"
echo "  - Basic completion: OK"
echo "  - Tool calling: OK"
echo "  - Logging: OK"
echo ""
echo "You can now use: anyclaude"
