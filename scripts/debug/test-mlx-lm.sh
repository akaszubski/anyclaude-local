#!/bin/bash

echo "Testing mlx-lm server..."

curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder",
    "messages": [
      {"role": "user", "content": "Say hello in one sentence"}
    ],
    "max_tokens": 50,
    "stream": false
  }' | jq .
