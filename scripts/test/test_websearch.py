#!/usr/bin/env python3
"""Test WebSearch tool call with local model"""
import requests
import json

response = requests.post(
    "http://localhost:8081/v1/chat/completions",
    headers={"Content-Type": "application/json"},
    json={
        "messages": [{"role": "user", "content": "search the web for latest news"}],
        "tools": [{"type": "function", "function": {"name": "WebSearch", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}}}}],
        "max_tokens": 200,
        "stream": False
    },
    timeout=30
)

print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)}")
