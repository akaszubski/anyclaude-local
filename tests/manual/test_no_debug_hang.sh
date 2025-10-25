#!/bin/bash
# Test if proxy hangs without debug mode
# This reproduces the exact scenario the user reported

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Testing Proxy WITHOUT Debug Mode"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start anyclaude WITHOUT debug
echo "1️⃣  Starting anyclaude WITHOUT debug mode..."
PROXY_ONLY=true node dist/main.js > /tmp/anyclaude-no-debug.log 2>&1 &
PROXY_PID=$!
sleep 2

# Extract proxy URL
PROXY_URL=$(grep -o 'http://localhost:[0-9]*' /tmp/anyclaude-no-debug.log | head -1)

if [ -z "$PROXY_URL" ]; then
    echo "❌ Failed to start proxy"
    kill $PROXY_PID 2>/dev/null
    exit 1
fi

echo "   ✅ Proxy started: $PROXY_URL"
echo ""

# Test with a streaming request (what Claude Code sends)
echo "2️⃣  Sending streaming request with 10 second timeout..."
echo ""

timeout 10s curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Say hello in 5 words"
      }
    ]
  }' \
  -N 2>&1 | head -20

CURL_EXIT=$?

echo ""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $CURL_EXIT -eq 124 ]; then
    echo "❌ REQUEST TIMED OUT"
    echo "   This indicates the hang issue!"
elif [ $CURL_EXIT -eq 0 ]; then
    echo "✅ REQUEST COMPLETED"
    echo "   No hang detected"
else
    echo "⚠️  REQUEST FAILED (exit code: $CURL_EXIT)"
fi

echo ""
echo "Proxy log (last 20 lines):"
tail -20 /tmp/anyclaude-no-debug.log

# Cleanup
kill $PROXY_PID 2>/dev/null
wait $PROXY_PID 2>/dev/null

exit $CURL_EXIT
