#!/usr/bin/env python3
"""Debug Test 1 - why isn't it parsing the code block?"""
import requests
import json

TOOLS = [
    {"type": "function", "function": {"name": "Read", "description": "Read a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}}},
]

result = requests.post("http://localhost:8081/v1/chat/completions", json={
    "messages": [
        {"role": "system", "content": "You have tools available. Use them when asked."},
        {"role": "user", "content": "Read the README.md file"}
    ],
    "tools": TOOLS,
    "max_tokens": 100,
    "stream": False
}, timeout=60)

print("Status:", result.status_code)
print()
print("Full response:")
print(json.dumps(result.json(), indent=2))
