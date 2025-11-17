#!/bin/bash
# Test MLX tool calling functionality

set -e

BASE_URL="${1:-http://localhost:8081}"

echo "🧪 MLX Tool Calling Test"
echo "=============================="
echo "Base URL: $BASE_URL"
echo ""

# Check if server is running
echo "✓ Checking server health..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ Server not running at $BASE_URL"
    exit 1
fi

echo "✓ Server is healthy"
echo ""

# Test 1: Simple request with tools
echo "Test 1: Chat with available tools"
echo "---------------------------------"

RESPONSE=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Can you search the web for information about Claude?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "search_web",
          "description": "Search the web for information",
          "parameters": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "The search query"
              }
            },
            "required": ["query"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "City name"
              }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "stream": false
  }')

echo "Response:"
echo "$RESPONSE" | jq '.'

# Check for tool calls
TOOL_CALLS=$(echo "$RESPONSE" | jq '.choices[0].message.tool_calls // empty')
if [ ! -z "$TOOL_CALLS" ]; then
    echo ""
    echo "✅ Tool calls detected:"
    echo "$TOOL_CALLS" | jq '.'
else
    echo ""
    echo "⚠️  No tool calls in response (model may have just answered without tools)"
fi

echo ""
echo "📊 Response metadata:"
echo "  Finish reason: $(echo $RESPONSE | jq -r '.choices[0].finish_reason')"
echo "  Usage:"
echo "$RESPONSE" | jq '.usage'

echo ""
echo "🎉 Tool calling test complete!"
