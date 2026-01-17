#!/usr/bin/env python3
"""
Test if KV cache is actually providing speedup.

Expected behavior:
- Request 1: ~45-60s (cold, processes full prompt)
- Request 2+: ~2-5s (warm, KV cache reused)

If both requests take ~45s, KV caching is NOT working.
"""
import requests
import time
import json

BASE_URL = "http://localhost:8081"

# Large system prompt (simulating Claude Code's ~12k token prompt)
SYSTEM_PROMPT = "You are Claude Code, Anthropic's CLI assistant. " * 300  # ~12k chars

def make_request(request_num):
    """Make a request and measure time."""
    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Say 'hello {request_num}'"}
        ],
        "max_tokens": 20,
        "stream": False
    }

    start = time.time()
    try:
        r = requests.post(f"{BASE_URL}/v1/chat/completions", json=payload, timeout=180)
        elapsed = time.time() - start

        if r.status_code == 200:
            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"success": True, "elapsed": elapsed, "content": content[:50]}
        else:
            return {"success": False, "elapsed": elapsed, "error": r.text[:100]}
    except Exception as e:
        return {"success": False, "elapsed": time.time() - start, "error": str(e)}

print("=" * 60)
print("KV CACHE SPEEDUP TEST")
print("=" * 60)
print(f"System prompt size: {len(SYSTEM_PROMPT):,} chars")
print()

# Make 5 requests with SAME system prompt
results = []
for i in range(5):
    print(f"Request {i+1}...", end=" ", flush=True)
    result = make_request(i+1)
    results.append(result)

    if result["success"]:
        print(f"{result['elapsed']:.1f}s - {result['content']}")
    else:
        print(f"{result['elapsed']:.1f}s - ERROR: {result['error']}")

print()
print("=" * 60)
print("ANALYSIS")
print("=" * 60)

times = [r["elapsed"] for r in results if r["success"]]
if len(times) >= 2:
    first = times[0]
    rest_avg = sum(times[1:]) / len(times[1:])
    speedup = first / rest_avg if rest_avg > 0 else 0

    print(f"First request:     {first:.1f}s")
    print(f"Follow-up average: {rest_avg:.1f}s")
    print(f"Speedup:           {speedup:.1f}x")
    print()

    if speedup > 5:
        print("✅ KV CACHE IS WORKING! (5x+ speedup)")
    elif speedup > 2:
        print("⚠️  Partial speedup (2-5x) - cache may be partially working")
    else:
        print("❌ NO SPEEDUP - KV cache is NOT working")
        print("   Every request is reprocessing the full system prompt")
else:
    print("Not enough successful requests to analyze")
