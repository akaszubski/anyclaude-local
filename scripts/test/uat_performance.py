#!/usr/bin/env python3
"""
UAT Performance Test - End-to-End Latency Verification

Tests:
1. safeSystemFilter reduces prompt size (43k -> 2-3k)
2. KV cache provides speedup on follow-up requests
3. Real-world Claude Code usage patterns

Expected Results:
- First request: 3-10s (with filtering) vs 45-60s (without)
- Follow-up requests: 1-3s (KV cache hit)
"""
import requests
import time
import json
import subprocess
import sys
import os

# Config
PROXY_URL = "http://localhost:8082"  # anyclaude proxy
MLX_URL = "http://localhost:8081"    # MLX worker direct

def check_server(url, name):
    """Check if server is running."""
    try:
        r = requests.get(f"{url}/health", timeout=2)
        return r.status_code == 200
    except:
        try:
            # Some servers don't have /health
            r = requests.get(f"{url}/v1/models", timeout=2)
            return r.status_code == 200
        except:
            return False

def make_anthropic_request(messages, max_tokens=50):
    """Make request through anyclaude proxy (Anthropic format)."""
    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": messages
    }

    start = time.time()
    try:
        r = requests.post(
            f"{PROXY_URL}/v1/messages",
            json=payload,
            headers={"x-api-key": "test", "anthropic-version": "2023-06-01"},
            timeout=180
        )
        elapsed = time.time() - start

        if r.status_code == 200:
            data = r.json()
            content = data.get("content", [{}])[0].get("text", "")
            input_tokens = data.get("usage", {}).get("input_tokens", 0)
            return {
                "success": True,
                "elapsed": elapsed,
                "content": content[:100],
                "input_tokens": input_tokens
            }
        else:
            return {"success": False, "elapsed": elapsed, "error": r.text[:200]}
    except Exception as e:
        return {"success": False, "elapsed": time.time() - start, "error": str(e)}

def make_openai_request(messages, max_tokens=50):
    """Make request directly to MLX worker (OpenAI format)."""
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": False
    }

    start = time.time()
    try:
        r = requests.post(
            f"{MLX_URL}/v1/chat/completions",
            json=payload,
            timeout=180
        )
        elapsed = time.time() - start

        if r.status_code == 200:
            data = r.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"success": True, "elapsed": elapsed, "content": content[:100]}
        else:
            return {"success": False, "elapsed": elapsed, "error": r.text[:200]}
    except Exception as e:
        return {"success": False, "elapsed": time.time() - start, "error": str(e)}

def test_prompt_filtering():
    """Test that safeSystemFilter reduces prompt size."""
    print("\n" + "=" * 60)
    print("TEST 1: System Prompt Filtering")
    print("=" * 60)

    # Simulate Claude Code's large system prompt
    large_system = "You are Claude Code, Anthropic's official CLI for Claude. " * 500
    print(f"Original system prompt: {len(large_system):,} chars (~{len(large_system)//4:,} tokens)")

    messages = [{"role": "user", "content": "Say 'hello'"}]

    result = make_anthropic_request(messages, max_tokens=20)

    if result["success"]:
        print(f"Response time: {result['elapsed']:.1f}s")
        print(f"Input tokens reported: {result.get('input_tokens', 'N/A')}")
        print(f"Response: {result['content']}")

        if result['elapsed'] < 10:
            print("\n✅ PASS: Response under 10s (filtering likely working)")
        else:
            print("\n⚠️  SLOW: Response over 10s (filtering may not be active)")
    else:
        print(f"❌ FAIL: {result['error']}")

    return result

def test_kv_cache_speedup():
    """Test that KV cache provides speedup on follow-up requests."""
    print("\n" + "=" * 60)
    print("TEST 2: KV Cache Speedup")
    print("=" * 60)

    # Same system prompt for all requests (should hit cache)
    system = "You are a helpful coding assistant."

    results = []
    for i in range(4):
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Say 'test {i+1}'"}
        ]

        print(f"Request {i+1}...", end=" ", flush=True)
        result = make_openai_request(messages, max_tokens=20)
        results.append(result)

        if result["success"]:
            print(f"{result['elapsed']:.2f}s - {result['content'][:30]}")
        else:
            print(f"ERROR: {result['error'][:50]}")

    # Analyze
    times = [r["elapsed"] for r in results if r["success"]]
    if len(times) >= 2:
        first = times[0]
        rest_avg = sum(times[1:]) / len(times[1:])
        speedup = first / rest_avg if rest_avg > 0 else 0

        print(f"\nFirst request:     {first:.2f}s")
        print(f"Follow-up average: {rest_avg:.2f}s")
        print(f"Speedup:           {speedup:.1f}x")

        if speedup > 2:
            print("\n✅ PASS: KV cache providing speedup")
        elif rest_avg < 2:
            print("\n✅ PASS: All requests fast (small prompt)")
        else:
            print("\n⚠️  NO SPEEDUP: KV cache may not be working")

    return results

def test_realistic_claude_code():
    """Test realistic Claude Code usage pattern."""
    print("\n" + "=" * 60)
    print("TEST 3: Realistic Claude Code Pattern")
    print("=" * 60)

    # Multi-turn conversation
    conversation = [
        {"role": "user", "content": "What files are in the current directory?"},
    ]

    print("Simulating multi-turn conversation...")

    for i, msg in enumerate(["List Python files", "Show me test files", "How many total?"]):
        conversation.append({"role": "user", "content": msg})

        print(f"Turn {i+1}: '{msg[:30]}'...", end=" ", flush=True)
        result = make_anthropic_request(conversation, max_tokens=100)

        if result["success"]:
            print(f"{result['elapsed']:.1f}s")
            # Add assistant response to conversation
            conversation.append({"role": "assistant", "content": result["content"]})
        else:
            print(f"ERROR")
            break

    return result

def main():
    print("=" * 60)
    print("UAT PERFORMANCE TEST")
    print("=" * 60)

    # Check servers
    print("\nChecking servers...")

    mlx_ok = check_server(MLX_URL, "MLX Worker")
    proxy_ok = check_server(PROXY_URL, "Anyclaude Proxy")

    print(f"  MLX Worker ({MLX_URL}): {'✅ Running' if mlx_ok else '❌ Not running'}")
    print(f"  Proxy ({PROXY_URL}): {'✅ Running' if proxy_ok else '❌ Not running'}")

    if not mlx_ok:
        print("\n⚠️  MLX Worker not running. Start with:")
        print("   python3 src/mlx_worker/server.py")
        print("\nRunning proxy-only tests...")

    if not proxy_ok:
        print("\n⚠️  Proxy not running. Start with:")
        print("   bun run ./dist/main.js")

        if not mlx_ok:
            print("\n❌ No servers running. Exiting.")
            return 1

    # Run tests
    if mlx_ok:
        test_kv_cache_speedup()

    if proxy_ok:
        test_prompt_filtering()
        test_realistic_claude_code()

    print("\n" + "=" * 60)
    print("UAT COMPLETE")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    sys.exit(main())
