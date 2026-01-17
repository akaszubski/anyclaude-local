#!/usr/bin/env python3
"""Performance test for MLX worker with Claude Code-like workloads"""
import requests
import time
import json

BASE_URL = "http://localhost:8081"

def test_latency(name, messages, tools=None, max_tokens=100):
    """Run a single request and measure latency"""
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": False
    }
    if tools:
        payload["tools"] = tools

    start = time.time()
    r = requests.post(f"{BASE_URL}/v1/chat/completions", json=payload, timeout=120)
    elapsed = time.time() - start

    resp = r.json()
    content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
    tool_calls = resp.get("choices", [{}])[0].get("message", {}).get("tool_calls", [])

    output_tokens = len(content.split()) if content else 0
    if tool_calls:
        output_tokens = sum(len(json.dumps(tc)) for tc in tool_calls) // 4

    return {
        "elapsed": elapsed,
        "output_tokens": output_tokens,
        "has_tool_calls": len(tool_calls) > 0,
        "status": r.status_code
    }

# Test scenarios
print("=" * 60)
print("MLX WORKER PERFORMANCE TEST")
print("=" * 60)

# 1. Minimal prompt (baseline)
print("\n1. MINIMAL PROMPT (baseline)")
result = test_latency("minimal", [
    {"role": "user", "content": "Say hello"}
], max_tokens=20)
print(f"   Time: {result['elapsed']:.2f}s")

# 2. Medium system prompt
print("\n2. MEDIUM SYSTEM PROMPT (2k chars)")
result = test_latency("medium", [
    {"role": "system", "content": "You are a helpful coding assistant. " * 50},
    {"role": "user", "content": "What is 2+2?"}
], max_tokens=20)
print(f"   Time: {result['elapsed']:.2f}s")

# 3. Large system prompt (Claude Code size)
print("\n3. LARGE SYSTEM PROMPT (12k chars - Claude Code size)")
result = test_latency("large", [
    {"role": "system", "content": "You are Claude Code. " * 600},
    {"role": "user", "content": "Hello"}
], max_tokens=20)
print(f"   Time: {result['elapsed']:.2f}s")

# 4. With tools
print("\n4. WITH TOOLS (5 tools)")
tools = [
    {"type": "function", "function": {"name": "Read", "description": "Read file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "Write", "description": "Write file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "Bash", "description": "Run command", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "Glob", "description": "Find files", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}}}},
    {"type": "function", "function": {"name": "Grep", "description": "Search content", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}}}}
]
result = test_latency("with_tools", [
    {"role": "system", "content": "You are a coding assistant with tools."},
    {"role": "user", "content": "Use Glob to find all .py files"}
], tools=tools, max_tokens=50)
print(f"   Time: {result['elapsed']:.2f}s")
print(f"   Tool calls: {'Yes' if result['has_tool_calls'] else 'No'}")

# 5. Long output generation
print("\n5. LONG OUTPUT (500 tokens)")
result = test_latency("long_output", [
    {"role": "user", "content": "Write a Python function to reverse a linked list with comments"}
], max_tokens=500)
print(f"   Time: {result['elapsed']:.2f}s")
print(f"   Tokens/sec: {result['output_tokens'] / result['elapsed']:.1f}")

# 6. Multi-turn conversation
print("\n6. MULTI-TURN (3 turns)")
result = test_latency("multi_turn", [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Python?"},
    {"role": "assistant", "content": "Python is a high-level programming language known for its readability and versatility."},
    {"role": "user", "content": "What are its main features?"},
    {"role": "assistant", "content": "Key features include dynamic typing, garbage collection, and extensive standard library."},
    {"role": "user", "content": "Give me an example"}
], max_tokens=100)
print(f"   Time: {result['elapsed']:.2f}s")

# 7. Full Claude Code simulation
print("\n7. FULL CLAUDE CODE SIMULATION")
print("   (12k system + 5 tools + tool-calling request)")
result = test_latency("claude_code", [
    {"role": "system", "content": "You are Claude Code, Anthropic's CLI assistant. " * 300},
    {"role": "user", "content": "Read the README.md file and summarize it"}
], tools=tools, max_tokens=200)
print(f"   Time: {result['elapsed']:.2f}s")
print(f"   Tool calls: {'Yes' if result['has_tool_calls'] else 'No'}")

# Summary
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print("""
Scenario                    | Expected Time
----------------------------|---------------
Minimal prompt              | 0.2-0.5s
Medium system (2k)          | 0.5-1.0s
Large system (12k)          | 2-4s
With tools                  | 1-2s
Long output (500 tok)       | 3-6s
Multi-turn (3 turns)        | 1-2s
Full Claude Code sim        | 3-5s

Model: Qwen2.5-Coder-7B-4bit on Apple Silicon
""")
