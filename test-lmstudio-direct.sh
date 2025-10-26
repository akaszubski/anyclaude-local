#!/bin/bash
# Test LMStudio tool calling directly to see what it sends

curl -s -N http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-30b-a3b-instruct-mlx",
    "messages": [
      {
        "role": "user",
        "content": "Read the README.md file"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "Read",
          "description": "Read a file",
          "parameters": {
            "type": "object",
            "properties": {
              "file_path": {
                "type": "string",
                "description": "Path to file"
              }
            },
            "required": ["file_path"]
          }
        }
      }
    ],
    "stream": true,
    "parallel_tool_calls": false
  }' 2>&1 | tee /tmp/lmstudio-raw-response.log | head -50
