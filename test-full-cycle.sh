#!/bin/bash

echo "=== Step 1: Send initial request ==="
RESPONSE1=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mlx" \
  -d '{
  "model": "gpt-oss-20b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant. Use the available tools to complete tasks."},
    {"role": "user", "content": "Please read the README.md file and tell me what this project does."}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "Read",
        "description": "Read a file from the filesystem",
        "parameters": {
          "type": "object",
          "properties": {
            "file_path": {"type": "string", "description": "The path to the file to read"}
          },
          "required": ["file_path"]
        }
      }
    }
  ],
  "stream": false,
  "max_tokens": 1000
}')

echo "$RESPONSE1" | python3 -m json.tool
echo ""
echo "=== Extracting tool_call_id and function arguments ==="

TOOL_CALL_ID=$(echo "$RESPONSE1" | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['tool_calls'][0]['id'])")
TOOL_NAME=$(echo "$RESPONSE1" | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['tool_calls'][0]['function']['name'])")
TOOL_ARGS=$(echo "$RESPONSE1" | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['tool_calls'][0]['function']['arguments'])")

echo "Tool Call ID: $TOOL_CALL_ID"
echo "Tool Name: $TOOL_NAME"
echo "Tool Args: $TOOL_ARGS"
echo ""

echo "=== Step 2: Send tool result with the same tool_call_id ==="
RESPONSE2=$(curl -s -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mlx" \
  -d "{
  \"model\": \"gpt-oss-20b\",
  \"messages\": [
    {\"role\": \"system\", \"content\": \"You are a helpful assistant. Use the available tools to complete tasks.\"},
    {\"role\": \"user\", \"content\": \"Please read the README.md file and tell me what this project does.\"},
    {
      \"role\": \"assistant\",
      \"content\": \"\",
      \"tool_calls\": [{
        \"id\": \"$TOOL_CALL_ID\",
        \"type\": \"function\",
        \"function\": {
          \"name\": \"$TOOL_NAME\",
          \"arguments\": $TOOL_ARGS
        }
      }]
    },
    {
      \"role\": \"tool\",
      \"tool_call_id\": \"$TOOL_CALL_ID\",
      \"content\": \"# anyclaude\\n\\nTranslation layer for Claude Code that enables using local MLX models.\"
    }
  ],
  \"tools\": [
    {
      \"type\": \"function\",
      \"function\": {
        \"name\": \"Read\",
        \"description\": \"Read a file from the filesystem\",
        \"parameters\": {
          \"type\": \"object\",
          \"properties\": {
            \"file_path\": {\"type\": \"string\", \"description\": \"The path to the file to read\"}
          },
          \"required\": [\"file_path\"]
        }
      }
    }
  ],
  \"stream\": false,
  \"max_tokens\": 1000
}")

echo "$RESPONSE2" | python3 -m json.tool
