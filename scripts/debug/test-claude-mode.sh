#!/bin/bash
# Test anyclaude in Claude mode

echo "🧪 Testing anyclaude in Claude mode (session-based auth)"
echo ""

# Start proxy in background
echo "1️⃣  Starting proxy in Claude mode..."
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 PROXY_ONLY=true node dist/main-cli.js > claude-mode-stdout.log 2> claude-mode-stderr.log &
PROXY_PID=$!

# Wait for proxy to start
sleep 3

# Check if proxy started
if ! kill -0 $PROXY_PID 2>/dev/null; then
  echo "❌ Proxy failed to start"
  echo ""
  echo "STDOUT:"
  cat claude-mode-stdout.log
  echo ""
  echo "STDERR:"
  cat claude-mode-stderr.log
  exit 1
fi

# Get proxy URL from logs
PROXY_URL=$(grep -o "http://localhost:[0-9]*" claude-mode-stdout.log | head -1)

if [ -z "$PROXY_URL" ]; then
  echo "❌ Could not find proxy URL in logs"
  echo ""
  echo "STDOUT:"
  cat claude-mode-stdout.log
  echo ""
  echo "STDERR:"
  cat claude-mode-stderr.log
  kill $PROXY_PID
  exit 1
fi

echo "✅ Proxy started: $PROXY_URL"
echo ""

# Check mode
MODE=$(grep "Mode:" claude-mode-stdout.log | head -1)
echo "$MODE"
echo ""

# Show what's in the logs
echo "2️⃣  Debug logs (first 20 lines):"
head -20 claude-mode-stderr.log
echo ""

echo "3️⃣  Testing proxy with simple request..."
# Send a test request
RESPONSE=$(curl -s -X POST "$PROXY_URL/v1/messages" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }')

echo "Response status: $(echo $RESPONSE | jq -r '.type // "error"')"
echo ""

# Show trace files if any
echo "4️⃣  Checking for trace files..."
if [ -d ~/.anyclaude/traces/claude ]; then
  TRACE_COUNT=$(ls -1 ~/.anyclaude/traces/claude/ 2>/dev/null | wc -l)
  echo "Found $TRACE_COUNT trace file(s)"

  if [ $TRACE_COUNT -gt 0 ]; then
    LATEST_TRACE=$(ls -t ~/.anyclaude/traces/claude/ | head -1)
    echo "Latest trace: $LATEST_TRACE"
    echo ""
    echo "Trace preview (request headers):"
    cat ~/.anyclaude/traces/claude/$LATEST_TRACE | jq '.request.headers' | head -15
  fi
else
  echo "No trace directory found"
fi

echo ""
echo "5️⃣  Cleaning up..."
kill $PROXY_PID
echo "✅ Proxy stopped"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Full logs saved to:"
echo "  - claude-mode-stdout.log"
echo "  - claude-mode-stderr.log"
echo ""
echo "To use with Claude Code:"
echo "  ANYCLAUDE_MODE=claude anyclaude"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
