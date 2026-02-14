#!/usr/bin/env python3
"""Test with Claude Code-sized system prompt (43k tokens)."""
import requests
import time

MLX_URL = "http://localhost:8081"
PROXY_URL = "http://localhost:62235"

# Simulate Claude Code's large system prompt (~43k tokens = ~172k chars)
LARGE_SYSTEM = """You are Claude Code, Anthropic's official CLI for Claude.
You are an interactive CLI tool that helps users with software engineering tasks.

# Tool usage policy
- When doing file search, prefer to use the Task tool
- You should proactively use the Task tool with specialized agents
- When WebFetch returns a redirect, make a new request

# Doing tasks
The user will primarily request you perform software engineering tasks.
- NEVER propose changes to code you haven't read
- Use the TodoWrite tool to plan the task
- Be careful not to introduce security vulnerabilities

""" * 200  # Repeat to get ~40k chars (~10k tokens)

print("=" * 60)
print("LARGE PROMPT TEST (simulating Claude Code)")
print("=" * 60)
print(f"System prompt: {len(LARGE_SYSTEM):,} chars (~{len(LARGE_SYSTEM)//4:,} tokens)")

# Test 1: Direct to MLX (no filtering) - should be slow
print("\n[1] DIRECT to MLX (no filtering)")
print("-" * 40)

messages = [
    {"role": "system", "content": LARGE_SYSTEM},
    {"role": "user", "content": "Say hello"}
]

start = time.time()
try:
    r = requests.post(f"{MLX_URL}/v1/chat/completions",
        json={"messages": messages, "max_tokens": 20, "stream": False},
        timeout=300)
    elapsed = time.time() - start

    if r.status_code == 200:
        content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")[:50]
        print(f"  Time: {elapsed:.1f}s")
        print(f"  Response: {content}")
    else:
        print(f"  ERROR: {r.status_code}")
except Exception as e:
    print(f"  ERROR: {e}")

# Test 2: Through proxy (with safeSystemFilter) - should be faster
print("\n[2] THROUGH PROXY (with safeSystemFilter)")
print("-" * 40)

start = time.time()
try:
    r = requests.post(f"{PROXY_URL}/v1/messages",
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 20,
            "system": LARGE_SYSTEM,
            "messages": [{"role": "user", "content": "Say hello"}]
        },
        headers={"x-api-key": "test", "anthropic-version": "2023-06-01"},
        timeout=300)
    elapsed = time.time() - start

    if r.status_code == 200:
        data = r.json()
        content = data.get("content", [{}])[0].get("text", "")[:50]
        input_tokens = data.get("usage", {}).get("input_tokens", "N/A")
        print(f"  Time: {elapsed:.1f}s")
        print(f"  Input tokens: {input_tokens} (should be ~2-3k if filtered)")
        print(f"  Response: {content}")
    else:
        print(f"  ERROR: {r.status_code} - {r.text[:200]}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n" + "=" * 60)
print("COMPARISON")
print("=" * 60)
print("If proxy is much faster, safeSystemFilter is working!")
