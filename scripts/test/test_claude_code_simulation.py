#!/usr/bin/env python3
"""
Claude Code Simulation Test

Replays REAL Claude Code requests captured from traces to measure
actual performance with realistic system prompts, tools, and message patterns.

This simulates the exact sequence Claude Code sends:
1. Startup probe (max_tokens=1)
2. System prompt + tools + user message (the real request)
3. Follow-up with same system prompt (should hit cache)

Usage:
    # Start MLX worker first:
    MLX_MODEL_PATH=<path> python3 -m src.mlx_worker.server

    # Run simulation:
    python3 scripts/test/test_claude_code_simulation.py
"""

import json
import os
import sys
import time
import glob
import requests

BASE_URL = os.environ.get("MLX_BASE_URL", "http://localhost:8081")


def find_largest_trace():
    """Find the trace with the largest system prompt (most realistic)."""
    trace_dir = os.path.expanduser("~/.anyclaude/traces/mlx-lm/")
    traces = glob.glob(os.path.join(trace_dir, "*.json"))

    best = None
    best_size = 0

    for tf in traces:
        try:
            with open(tf) as f:
                d = json.load(f)
            body = d.get("request", {}).get("body", {})
            if isinstance(body, str):
                body = json.loads(body)

            sys_blocks = body.get("system", [])
            tools = body.get("tools", [])
            if isinstance(sys_blocks, list):
                sys_size = sum(len(json.dumps(b)) for b in sys_blocks)
            else:
                sys_size = len(str(sys_blocks))

            # Want: big system prompt + tools + real max_tokens
            max_tok = body.get("max_tokens", 0)
            if sys_size > best_size and len(tools) > 10 and max_tok > 100:
                best_size = sys_size
                best = body
        except Exception:
            continue

    return best, best_size


def convert_to_openai_format(anthropic_body):
    """Convert Anthropic API format to OpenAI format for MLX worker."""
    messages = []

    # Convert system blocks to system message
    sys_blocks = anthropic_body.get("system", [])
    if sys_blocks:
        if isinstance(sys_blocks, list):
            sys_text = "\n\n".join(
                b.get("text", str(b)) if isinstance(b, dict) else str(b)
                for b in sys_blocks
            )
        else:
            sys_text = str(sys_blocks)
        messages.append({"role": "system", "content": sys_text})

    # Convert messages
    for msg in anthropic_body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            # Extract text from content blocks
            text_parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif block.get("type") == "tool_result":
                        text_parts.append(json.dumps(block))
                else:
                    text_parts.append(str(block))
            content = "\n".join(text_parts)
        messages.append({"role": role, "content": content})

    # Convert tools from Anthropic to OpenAI format
    tools = []
    for t in anthropic_body.get("tools", []):
        tools.append({
            "type": "function",
            "function": {
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {}),
            },
        })

    return messages, tools


def measure_request(messages, tools, max_tokens, label, stream=True):
    """Send request and measure timing."""
    payload = {
        "model": "current-model",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "stream": stream,
    }
    if tools:
        payload["tools"] = tools

    start = time.time()
    first_token_time = None
    full_response = ""
    token_count = 0

    try:
        if stream:
            resp = requests.post(
                f"{BASE_URL}/v1/chat/completions",
                json=payload,
                stream=True,
                timeout=300,
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
                        if "error" in chunk:
                            print(f"  ERROR: {chunk['error']}")
                            break
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            token_count += 1
                            if first_token_time is None:
                                first_token_time = time.time()
                            full_response += content
                    except json.JSONDecodeError:
                        pass
        else:
            resp = requests.post(
                f"{BASE_URL}/v1/chat/completions",
                json=payload,
                timeout=300,
            )
            cache_hit = resp.headers.get("X-Cache-Hit", "unknown")
            first_token_time = time.time()
            result = resp.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            full_response = content or ""
            token_count = len(full_response.split())

    except requests.exceptions.Timeout:
        end = time.time()
        print(f"\n{'='*70}")
        print(f"  {label}")
        print(f"{'='*70}")
        print(f"  ❌ TIMEOUT after {end - start:.1f}s")
        print(f"{'='*70}")
        return None, end - start, "timeout"
    except Exception as e:
        end = time.time()
        print(f"\n{'='*70}")
        print(f"  {label}")
        print(f"{'='*70}")
        print(f"  ❌ ERROR: {e}")
        print(f"{'='*70}")
        return None, end - start, "error"

    end = time.time()
    ttft = (first_token_time - start) if first_token_time else (end - start)
    total = end - start
    tps = token_count / (end - (first_token_time or start)) if first_token_time and end > first_token_time else 0

    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")
    print(f"  Cache Hit:       {cache_hit}")
    print(f"  TTFT:            {ttft:.3f}s")
    print(f"  Total Time:      {total:.3f}s")
    print(f"  Tokens:          {token_count}")
    print(f"  Tokens/sec:      {tps:.1f}")
    print(f"  Response:        {full_response[:120]}...")
    print(f"{'='*70}")

    return ttft, total, cache_hit


def check_health():
    """Check server health."""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        health = resp.json()
        cache = health.get("cache", {})
        print(f"  Server:    {health.get('status')}")
        print(f"  Warmed:    {cache.get('warmed', '?')}")
        print(f"  Tokens:    {cache.get('tokens', 0)}")
        return True
    except Exception as e:
        print(f"  ❌ Server not reachable: {e}")
        return False


def main():
    print("=" * 70)
    print("  CLAUDE CODE SIMULATION TEST")
    print("  Replaying real Claude Code requests from traces")
    print("=" * 70)

    # Check server
    print("\n--- Server Status ---")
    if not check_health():
        print("\nStart server with:")
        print("  MLX_MODEL_PATH=<path> python3 -m src.mlx_worker.server")
        sys.exit(1)

    # Find the real Claude Code request
    print("\n--- Loading Real Claude Code Request ---")
    body, sys_size = find_largest_trace()
    if not body:
        print("  ❌ No traces found in ~/.anyclaude/traces/mlx-lm/")
        print("  Run Claude Code with anyclaude first to capture traces.")
        sys.exit(1)

    messages, tools = convert_to_openai_format(body)

    sys_msg_len = len(messages[0]["content"]) if messages and messages[0]["role"] == "system" else 0
    user_msg = messages[-1]["content"] if messages else "hello"

    print(f"  System prompt:   {sys_msg_len:,} chars")
    print(f"  Tools:           {len(tools)}")
    print(f"  Messages:        {len(messages)}")
    print(f"  User message:    {user_msg[:80]}...")

    # =========================================================================
    # SIMULATION SEQUENCE (matches Claude Code startup)
    # =========================================================================

    print("\n" + "=" * 70)
    print("  PHASE 1: COLD START (first request, no cache)")
    print("=" * 70)

    # Request 1: First real request — cache miss, must warm
    ttft1, total1, hit1 = measure_request(
        messages, tools, max_tokens=200,
        label="Request 1: COLD — system prompt + tools + user message"
    )

    time.sleep(2)

    print("\n" + "=" * 70)
    print("  PHASE 2: WARM CACHE (same system prompt, new user message)")
    print("=" * 70)

    # Request 2: Same system prompt, different user message — should hit cache
    warm_messages = list(messages)
    # Replace user message
    warm_messages[-1] = {"role": "user", "content": "What files are in the current directory?"}

    ttft2, total2, hit2 = measure_request(
        warm_messages, tools, max_tokens=200,
        label="Request 2: WARM — same system prompt, different question"
    )

    time.sleep(1)

    # Request 3: Multi-turn (system + user + assistant + user)
    print("\n" + "=" * 70)
    print("  PHASE 3: MULTI-TURN (simulated conversation)")
    print("=" * 70)

    multi_messages = list(messages)
    multi_messages.append({"role": "assistant", "content": "I can help with that. Let me check."})
    multi_messages.append({"role": "user", "content": "Now read the README.md file"})

    ttft3, total3, hit3 = measure_request(
        multi_messages, tools, max_tokens=200,
        label="Request 3: MULTI-TURN — 4 messages, same system prompt"
    )

    # =========================================================================
    # SUMMARY
    # =========================================================================

    print("\n" + "=" * 70)
    print("  PERFORMANCE SUMMARY")
    print("=" * 70)
    print(f"  System prompt size:  {sys_msg_len:,} chars")
    print(f"  Tools:               {len(tools)}")
    print()

    results = [
        ("Cold start", ttft1, total1, hit1),
        ("Warm cache", ttft2, total2, hit2),
        ("Multi-turn", ttft3, total3, hit3),
    ]

    for label, ttft, total, hit in results:
        if ttft is not None:
            print(f"  {label:12s}  TTFT={ttft:6.3f}s  Total={total:6.3f}s  Hit={hit}")
        else:
            print(f"  {label:12s}  FAILED ({hit})")

    if ttft1 and ttft2:
        speedup = ttft1 / ttft2
        print(f"\n  Cache speedup:  {speedup:.1f}x (cold→warm)")
        if speedup > 1.5:
            print(f"  ✅ KV cache is providing {speedup:.1f}x improvement")
        elif speedup > 1.0:
            print(f"  ⚠️  Marginal improvement — cache may not be fully effective")
        else:
            print(f"  ❌ No improvement — cache not working")

    if ttft1:
        print(f"\n  {'✅' if ttft1 < 5 else '⚠️' if ttft1 < 15 else '❌'} Cold TTFT: {ttft1:.1f}s (target: <5s)")
    if ttft2:
        print(f"  {'✅' if ttft2 < 3 else '⚠️' if ttft2 < 10 else '❌'} Warm TTFT: {ttft2:.1f}s (target: <3s)")

    print("\n--- Final Server State ---")
    check_health()
    print()


if __name__ == "__main__":
    main()
