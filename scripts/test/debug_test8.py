#!/usr/bin/env python3
"""Debug Test 8 - Complex JSON arguments"""
import requests
import json

TOOLS = [
    {"type": "function", "function": {"name": "Read", "description": "Read a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}}},
    {"type": "function", "function": {"name": "Write", "description": "Write a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}, "content": {"type": "string"}}, "required": ["file_path", "content"]}}},
    {"type": "function", "function": {"name": "Bash", "description": "Run bash command", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "Glob", "description": "Find files by pattern", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}}},
]

result = requests.post("http://localhost:8081/v1/chat/completions", json={
    "messages": [
        {"role": "system", "content": "Use tools when needed."},
        {"role": "user", "content": "Write a JSON object {\"name\": \"test\", \"value\": 123} to config.json"}
    ],
    "tools": TOOLS,
    "max_tokens": 150,
    "stream": False
}, timeout=60)

print("Status:", result.status_code)
print()
print("Full response:")
resp = result.json()
print(json.dumps(resp, indent=2))

msg = resp["choices"][0]["message"]
if msg.get("tool_calls"):
    print("\n✅ Tool calls detected!")
    for tc in msg["tool_calls"]:
        fn = tc.get("function", {})
        print(f"  - {fn.get('name')}: {fn.get('arguments')}")
else:
    print("\n❌ No tool calls. Content:")
    print(msg.get("content", ""))
