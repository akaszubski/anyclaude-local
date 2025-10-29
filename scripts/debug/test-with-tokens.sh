#!/bin/bash
set -e

echo "Testing model with actual token generation..."
echo ""

# Make a simple API call that will generate tokens
RESPONSE=$(curl -s http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"current-model","messages":[{"role":"user","content":"Write a haiku about coding. Just the haiku, nothing else."}],"temperature":0.7,"max_tokens":100,"stream":false}')

echo "Response:"
echo "$RESPONSE" | jq -r '.choices[0].message.content'
echo ""
echo "Usage:"
echo "$RESPONSE" | jq '.usage'
