#!/usr/bin/env python3
"""Quick UAT performance test."""
import requests
import time
import sys

MLX_URL = "http://localhost:8081"
PROXY_URL = "http://localhost:62235"

print("=" * 60)
print("UAT PERFORMANCE TEST")
print("=" * 60)

# Test 1: Check servers
print("\n[1] Checking servers...")
try:
    r = requests.get(f"{MLX_URL}/v1/models", timeout=2)
    print(f"  MLX Worker: Running")
except:
    print(f"  MLX Worker: Not running")
    sys.exit(1)

# Test 2: KV Cache speedup (direct to MLX)
print("\n[2] KV Cache Speedup Test (MLX Worker)")
print("-" * 40)

system = "You are a helpful coding assistant."
results = []

for i in range(4):
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Say 'test {i+1}'"}
    ]

    start = time.time()
    try:
        r = requests.post(f"{MLX_URL}/v1/chat/completions",
            json={"messages": messages, "max_tokens": 20, "stream": False},
            timeout=120)
        elapsed = time.time() - start

        if r.status_code == 200:
            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")[:40]
            print(f"  Request {i+1}: {elapsed:.2f}s - {content}")
            results.append(elapsed)
        else:
            print(f"  Request {i+1}: ERROR {r.status_code}")
    except Exception as e:
        print(f"  Request {i+1}: ERROR {e}")

if len(results) >= 2:
    first = results[0]
    rest = sum(results[1:]) / len(results[1:])
    speedup = first / rest if rest > 0 else 0
    print(f"\n  First: {first:.2f}s | Follow-up avg: {rest:.2f}s | Speedup: {speedup:.1f}x")

    if speedup > 2:
        print("  KV CACHE WORKING")
    else:
        print("  NO SPEEDUP - cache may not be working")

# Test 3: Prompt filtering (through proxy)
print("\n[3] System Prompt Filtering Test (Proxy)")
print("-" * 40)

start = time.time()
try:
    r = requests.post(f"{PROXY_URL}/v1/messages",
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 20,
            "messages": [{"role": "user", "content": "Say hello"}]
        },
        headers={"x-api-key": "test", "anthropic-version": "2023-06-01"},
        timeout=120)
    elapsed = time.time() - start

    if r.status_code == 200:
        data = r.json()
        content = data.get("content", [{}])[0].get("text", "")[:50]
        input_tokens = data.get("usage", {}).get("input_tokens", "N/A")
        print(f"  Response: {elapsed:.2f}s")
        print(f"  Input tokens: {input_tokens}")
        print(f"  Content: {content}")

        if elapsed < 10:
            print("  FAST RESPONSE (filtering likely working)")
        else:
            print("  SLOW - check if safeSystemFilter is enabled")
    else:
        print(f"  ERROR: {r.status_code} - {r.text[:100]}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n" + "=" * 60)
print("UAT COMPLETE")
print("=" * 60)
