#!/bin/bash
# Reproduce the exact freeze scenario with real Claude Code request

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Testing EXACT Claude Code Freeze Scenario"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start anyclaude in background
echo "1️⃣  Starting anyclaude with verbose debug..."
ANYCLAUDE_DEBUG=2 PROXY_ONLY=true node dist/main.js > /tmp/anyclaude-freeze-test.log 2>&1 &
PROXY_PID=$!
sleep 2

# Extract proxy URL from log
PROXY_URL=$(grep -o 'http://localhost:[0-9]*' /tmp/anyclaude-freeze-test.log | head -1)

if [ -z "$PROXY_URL" ]; then
    echo "❌ Failed to start proxy"
    kill $PROXY_PID 2>/dev/null
    exit 1
fi

echo "   ✅ Proxy started: $PROXY_URL"
echo ""

# This is the EXACT request that Claude Code sends (from your log)
echo "2️⃣  Sending EXACT Claude Code request..."
echo ""

cat > /tmp/claude-request.json << 'EOF'
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 32000,
  "stream": true,
  "system": "You are Claude Code, Anthropic's official CLI for Claude.\nYou are a file search specialist for Claude Code.",
  "messages": [
    {
      "role": "user",
      "content": "Find files matching pattern: *.ts"
    }
  ]
}
EOF

echo "   Request payload:"
cat /tmp/claude-request.json | jq '.' 2>/dev/null || cat /tmp/claude-request.json
echo ""
echo "   Sending request (30 second timeout)..."
echo ""

# Send request with timeout
timeout 30s curl -X POST "$PROXY_URL/v1/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -H "anthropic-version: 2023-06-01" \
  -d @/tmp/claude-request.json \
  -v 2>&1 | tee /tmp/curl-output.log

CURL_EXIT=$?

echo ""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $CURL_EXIT -eq 124 ]; then
    echo "❌ REQUEST TIMED OUT (30 seconds)"
    echo ""
    echo "This confirms the freeze!"
    echo ""
    echo "Last lines from proxy log:"
    tail -20 /tmp/anyclaude-freeze-test.log
elif [ $CURL_EXIT -eq 0 ]; then
    echo "✅ REQUEST COMPLETED"
    echo ""
    echo "Response received successfully"
else
    echo "⚠️  REQUEST FAILED (exit code: $CURL_EXIT)"
    echo ""
    echo "Last lines from proxy log:"
    tail -20 /tmp/anyclaude-freeze-test.log
fi

echo ""
echo "Full proxy log saved to: /tmp/anyclaude-freeze-test.log"
echo "Curl output saved to: /tmp/curl-output.log"
echo ""

# Cleanup
kill $PROXY_PID 2>/dev/null
wait $PROXY_PID 2>/dev/null

if [ $CURL_EXIT -eq 124 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "FREEZE REPRODUCED!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Analyze the logs:"
    echo "  cat /tmp/anyclaude-freeze-test.log"
    echo "  cat /tmp/curl-output.log"
    echo ""
    exit 1
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "NO FREEZE DETECTED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
fi
