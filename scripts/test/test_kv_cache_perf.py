#!/usr/bin/env python3
"""
KV Cache Performance Test

Simulates Claude Code's behavior:
1. First request: system prompt + user message (cache MISS, should warm)
2. Second request: same system prompt + different user message (cache HIT, should be faster)

Measures TTFT (Time To First Token) for both requests.

Usage:
    # Start MLX worker first:
    MLX_MODEL_PATH=~/models/Qwen2.5-Coder-7B-Instruct-4bit python3 -m src.mlx_worker.server

    # Then run this test:
    python3 scripts/test/test_kv_cache_perf.py
"""

import json
import time
import sys
import requests

BASE_URL = "http://localhost:8081"

# Simulated Claude Code system prompt (abbreviated but representative)
SYSTEM_PROMPT = """You are Claude, made by Anthropic. You are a helpful AI assistant.
You have access to tools including Read, Write, Edit, Bash, Glob, Grep.
When the user asks you to perform tasks, use the appropriate tools.
Always be helpful and provide clear, concise responses.
Follow best practices for code quality and security.
""" * 10  # Repeat to make it realistic size (~2500 chars)


def measure_ttft(messages, label, stream=True):
    """Send a request and measure time to first token."""
    payload = {
        "model": "current-model",
        "messages": messages,
        "max_tokens": 50,
        "temperature": 0.7,
        "stream": stream,
    }

    start = time.time()
    first_token_time = None
    full_response = ""

    if stream:
        resp = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            stream=True,
            timeout=120,
        )
        cache_hit = resp.headers.get("X-Cache-Hit", "unknown")

        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content and first_token_time is None:
                        first_token_time = time.time()
                    full_response += content
                except json.JSONDecodeError:
                    pass
    else:
        resp = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=120,
        )
        cache_hit = resp.headers.get("X-Cache-Hit", "unknown")
        first_token_time = time.time()
        result = resp.json()
        full_response = result.get("choices", [{}])[0].get("message", {}).get("content", "")

    end = time.time()
    ttft = (first_token_time - start) if first_token_time else (end - start)
    total = end - start

    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    print(f"  Cache Hit:    {cache_hit}")
    print(f"  TTFT:         {ttft:.3f}s")
    print(f"  Total Time:   {total:.3f}s")
    print(f"  Response:     {full_response[:100]}...")
    print(f"{'='*60}")

    return ttft, total, cache_hit


def check_health():
    """Check server health and cache state."""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        health = resp.json()
        print(f"\nServer Status: {health.get('status')}")
        cache = health.get("cache", {})
        print(f"Cache Warmed:  {cache.get('warmed', 'unknown')}")
        print(f"Cache Tokens:  {cache.get('tokens', 0)}")
        print(f"Cache Hash:    {cache.get('systemPromptHash', 'none')[:16]}...")
        return True
    except Exception as e:
        print(f"\n❌ Server not reachable: {e}")
        print(f"   Start it with: python3 -m src.mlx_worker.server")
        return False


def main():
    print("KV Cache Performance Test")
    print("=" * 60)

    # Check server
    if not check_health():
        sys.exit(1)

    # Clear cache first
    print("\n--- Clearing cache ---")
    try:
        requests.post(f"{BASE_URL}/cache/warm", json={"system_prompt": ""}, timeout=10)
    except Exception:
        pass

    # Request 1: Cache MISS (first time seeing this system prompt)
    messages1 = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "What is 2 + 2?"},
    ]
    ttft1, total1, hit1 = measure_ttft(messages1, "Request 1: COLD START (cache miss)")

    # Small delay
    time.sleep(1)

    # Request 2: Cache HIT (same system prompt)
    messages2 = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "What is the capital of France?"},
    ]
    ttft2, total2, hit2 = measure_ttft(messages2, "Request 2: WARM CACHE (cache hit)")

    # Request 3: Another cache hit to confirm consistency
    time.sleep(1)
    messages3 = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Write a hello world in Python."},
    ]
    ttft3, total3, hit3 = measure_ttft(messages3, "Request 3: WARM CACHE (verify)")

    # Summary
    print(f"\n{'='*60}")
    print(f"  PERFORMANCE SUMMARY")
    print(f"{'='*60}")
    print(f"  Request 1 (cold):  TTFT={ttft1:.3f}s  Total={total1:.3f}s  Hit={hit1}")
    print(f"  Request 2 (warm):  TTFT={ttft2:.3f}s  Total={total2:.3f}s  Hit={hit2}")
    print(f"  Request 3 (warm):  TTFT={ttft3:.3f}s  Total={total3:.3f}s  Hit={hit3}")

    if ttft1 > 0 and ttft2 > 0:
        speedup = ttft1 / ttft2
        print(f"\n  TTFT Speedup:  {speedup:.1f}x faster with cache")
        if speedup > 1.5:
            print(f"  ✅ KV cache is working! {speedup:.1f}x improvement.")
        elif speedup > 1.0:
            print(f"  ⚠️  Marginal improvement ({speedup:.1f}x). Cache may not be fully effective.")
        else:
            print(f"  ❌ No improvement. Cache may not be working correctly.")

    print(f"\n  Cache hit on request 2: {'✅ YES' if hit2 == 'true' else '❌ NO'}")
    print(f"  Cache hit on request 3: {'✅ YES' if hit3 == 'true' else '❌ NO'}")

    # Check health again
    check_health()


if __name__ == "__main__":
    main()
