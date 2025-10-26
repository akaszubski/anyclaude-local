#!/bin/bash

# Test trace capture functionality

echo "Starting proxy in debug mode..."
ANYCLAUDE_DEBUG=1 PROXY_ONLY=true ./dist/main-cli.js 2>&1 | grep -E "Proxy URL|LMStudio endpoint" &
PROXY_PID=$!

# Wait for proxy to start
sleep 3

# Extract port from proxy URL
PORT=$(lsof -ti:50000-51000 -sTCP:LISTEN 2>/dev/null | head -1 | xargs -I {} lsof -p {} -sTCP:LISTEN -a -P -n 2>/dev/null | grep -o "localhost:[0-9]*" | head -1 | cut -d: -f2)

if [ -z "$PORT" ]; then
    echo "❌ Failed to find proxy port"
    kill $PROXY_PID 2>/dev/null
    exit 1
fi

echo "Proxy listening on port: $PORT"
echo "Making test request..."

# Make a simple test request
curl -s "http://localhost:${PORT}/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "current-model",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello in one word"}]
  }' > /tmp/trace-test-response.json 2>&1

echo "Request completed"
sleep 1

# Stop proxy
kill $PROXY_PID 2>/dev/null
wait $PROXY_PID 2>/dev/null

echo "Checking for trace files..."
ls -lh ~/.anyclaude/traces/lmstudio/

echo ""
echo "Trace capture test complete!"
