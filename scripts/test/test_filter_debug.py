#!/usr/bin/env python3
"""Test filtering with debug - check if system prompt is reduced."""
import requests
import time

PROXY_URL = "http://localhost:63256"

# Simulate large system prompt
LARGE_SYSTEM = "You are Claude Code. " * 1000  # ~20k chars = ~5k tokens

print(f"Sending system prompt: {len(LARGE_SYSTEM):,} chars (~{len(LARGE_SYSTEM)//4:,} tokens)")

start = time.time()
try:
    r = requests.post(f"{PROXY_URL}/v1/messages",
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 20,
            "system": LARGE_SYSTEM,
            "messages": [{"role": "user", "content": "Say hi"}]
        },
        headers={"x-api-key": "test", "anthropic-version": "2023-06-01"},
        timeout=120)
    elapsed = time.time() - start
    print(f"Response in {elapsed:.1f}s")
    if r.status_code == 200:
        print(f"Content: {r.json().get('content', [{}])[0].get('text', '')[:50]}")
    else:
        print(f"Error: {r.text[:100]}")
except Exception as e:
    print(f"Error: {e}")
