#!/usr/bin/env python3
"""Test proxy safe filter by sending a request with large system prompt"""
import requests
import json

# Read CLAUDE.md to simulate Claude Code's system prompt
with open("CLAUDE.md", "r") as f:
    claude_md = f.read()

print(f"CLAUDE.md size: {len(claude_md)} chars (~{len(claude_md)//4} tokens)")

# Construct a minimal request like Claude Code would send
payload = {
    "model": "claude-opus-4-5-20251101",
    "max_tokens": 100,
    "system": claude_md,
    "messages": [
        {"role": "user", "content": "hi who are you?"}
    ]
}

print(f"\nSending to proxy at http://localhost:65523...")
print(f"System prompt: {len(payload['system'])} chars")

try:
    # Send to the proxy (use the port from the user's output)
    r = requests.post(
        "http://localhost:65523/v1/messages",
        json=payload,
        headers={"Content-Type": "application/json", "x-api-key": "test"},
        timeout=60
    )

    print(f"\nStatus: {r.status_code}")
    print(f"Response: {r.text[:500]}...")

except requests.exceptions.ConnectionError:
    print("ERROR: Could not connect to proxy. Make sure anyclaude is running.")
except Exception as e:
    print(f"ERROR: {e}")
