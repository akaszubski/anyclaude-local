#!/usr/bin/env python3
"""Test tool calling with mlx-omni-server to see what prompt is generated."""

import json
import os
import requests

# Enable DEBUG logging for mlx_omni_server
os.environ["LOG_LEVEL"] = "DEBUG"

# Simple tool calling request
url = "http://localhost:8080/v1/messages"
headers = {"Content-Type": "application/json"}

payload = {
    "model": "qwen3-coder",
    "max_tokens": 100,
    "messages": [
        {
            "role": "user",
            "content": "Read the README.md file"
        }
    ],
    "tools": [
        {
            "name": "Read",
            "description": "Reads a file from the local filesystem",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The absolute path to the file to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    ]
}

print("=" * 80)
print("SENDING REQUEST:")
print(json.dumps(payload, indent=2))
print("=" * 80)

response = requests.post(url, headers=headers, json=payload, timeout=60)

print("\nRESPONSE:")
print(json.dumps(response.json(), indent=2))
