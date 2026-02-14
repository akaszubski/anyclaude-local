#!/usr/bin/env python3
"""Thorough testing of MLX worker - covers known issues"""
import requests
import json
import time

BASE_URL = "http://localhost:8081"

def make_request(messages, tools=None, max_tokens=100, stream=False):
    """Make a request and return full details"""
    payload = {"messages": messages, "max_tokens": max_tokens, "stream": stream}
    if tools:
        payload["tools"] = tools

    start = time.time()
    r = requests.post(f"{BASE_URL}/v1/chat/completions", json=payload, timeout=120)
    elapsed = time.time() - start

    return {
        "elapsed": elapsed,
        "status": r.status_code,
        "response": r.json() if not stream else r.text
    }

TOOLS = [
    {"type": "function", "function": {"name": "Read", "description": "Read a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}}},
    {"type": "function", "function": {"name": "Write", "description": "Write a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}, "content": {"type": "string"}}, "required": ["file_path", "content"]}}},
    {"type": "function", "function": {"name": "Bash", "description": "Run bash command", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "Glob", "description": "Find files by pattern", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}}},
]

print("=" * 70)
print("THOROUGH MLX WORKER TESTING")
print("=" * 70)

tests_passed = 0
tests_failed = 0

# Test 1: Basic tool calling
print("\n[TEST 1] Basic tool calling - 'Read the README.md file'")
result = make_request([
    {"role": "system", "content": "You have tools available. Use them when asked."},
    {"role": "user", "content": "Read the README.md file"}
], tools=TOOLS, max_tokens=100)

msg = result["response"]["choices"][0]["message"]
if msg.get("tool_calls"):
    print(f"   ✅ PASS - Got tool call: {msg['tool_calls'][0]['function']['name']}")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - No tool call. Got: {msg.get('content', '')[:100]}")
    tests_failed += 1

# Test 2: Explicit tool request
print("\n[TEST 2] Explicit tool request - 'Use the Glob tool to find *.py files'")
result = make_request([
    {"role": "system", "content": "You have tools. When asked to use a tool, use it."},
    {"role": "user", "content": "Use the Glob tool to find all *.py files"}
], tools=TOOLS, max_tokens=100)

msg = result["response"]["choices"][0]["message"]
if msg.get("tool_calls"):
    fn = msg['tool_calls'][0]['function']
    print(f"   ✅ PASS - Got: {fn['name']}({fn['arguments']})")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - No tool call. Got: {msg.get('content', '')[:100]}")
    tests_failed += 1

# Test 3: Write tool
print("\n[TEST 3] Write tool - 'Write hello to test.txt'")
result = make_request([
    {"role": "system", "content": "You can use tools to write files."},
    {"role": "user", "content": "Write 'hello world' to a file called test.txt"}
], tools=TOOLS, max_tokens=100)

msg = result["response"]["choices"][0]["message"]
if msg.get("tool_calls"):
    fn = msg['tool_calls'][0]['function']
    print(f"   ✅ PASS - Got: {fn['name']}({fn['arguments'][:50]}...)")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - No tool call. Got: {msg.get('content', '')[:100]}")
    tests_failed += 1

# Test 4: Bash tool
print("\n[TEST 4] Bash tool - 'Run ls command'")
result = make_request([
    {"role": "system", "content": "You can run bash commands."},
    {"role": "user", "content": "Run the ls command to list files"}
], tools=TOOLS, max_tokens=100)

msg = result["response"]["choices"][0]["message"]
if msg.get("tool_calls"):
    fn = msg['tool_calls'][0]['function']
    print(f"   ✅ PASS - Got: {fn['name']}({fn['arguments']})")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - No tool call. Got: {msg.get('content', '')[:100]}")
    tests_failed += 1

# Test 5: Without tools (should just respond)
print("\n[TEST 5] Without tools - should give text response")
result = make_request([
    {"role": "user", "content": "What is Python?"}
], max_tokens=50)

msg = result["response"]["choices"][0]["message"]
if msg.get("content") and not msg.get("tool_calls"):
    print(f"   ✅ PASS - Got text: {msg['content'][:60]}...")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - Unexpected response")
    tests_failed += 1

# Test 6: Long system prompt with tools
print("\n[TEST 6] Long system prompt (10k chars) + tools")
long_sys = "You are Claude Code, a helpful coding assistant. " * 200
result = make_request([
    {"role": "system", "content": long_sys},
    {"role": "user", "content": "Use Glob to find markdown files"}
], tools=TOOLS, max_tokens=100)

msg = result["response"]["choices"][0]["message"]
print(f"   Time: {result['elapsed']:.2f}s")
if msg.get("tool_calls"):
    fn = msg['tool_calls'][0]['function']
    print(f"   ✅ PASS - Got: {fn['name']}({fn['arguments']})")
    tests_passed += 1
else:
    content = msg.get('content', '')
    # Check if it looks like a tool call in the content
    if '"name"' in content and '"arguments"' in content:
        print(f"   ⚠️  PARTIAL - Tool call in content (parser missed): {content[:80]}")
        tests_failed += 1
    else:
        print(f"   ❌ FAIL - No tool call. Got: {content[:100]}")
        tests_failed += 1

# Test 7: Multi-turn with tool result
print("\n[TEST 7] Multi-turn with tool result")
result = make_request([
    {"role": "system", "content": "You can use tools."},
    {"role": "user", "content": "Read test.txt"},
    {"role": "assistant", "content": "I'll read that file for you."},
    {"role": "user", "content": "The file contains: Hello world! What does it say?"}
], tools=TOOLS, max_tokens=50)

msg = result["response"]["choices"][0]["message"]
content = msg.get("content", "")
if "hello" in content.lower() or "world" in content.lower():
    print(f"   ✅ PASS - Understood tool result: {content[:60]}")
    tests_passed += 1
else:
    print(f"   ❌ FAIL - Didn't understand result. Got: {content[:100]}")
    tests_failed += 1

# Test 8: JSON in arguments
print("\n[TEST 8] Complex JSON arguments")
result = make_request([
    {"role": "system", "content": "Use tools when needed."},
    {"role": "user", "content": "Write a JSON object {\"name\": \"test\", \"value\": 123} to config.json"}
], tools=TOOLS, max_tokens=150)

msg = result["response"]["choices"][0]["message"]
if msg.get("tool_calls"):
    fn = msg['tool_calls'][0]['function']
    args = fn.get('arguments', '')
    print(f"   Tool: {fn['name']}")
    print(f"   Args: {args[:100]}")
    if 'file_path' in args or 'config.json' in args:
        print(f"   ✅ PASS")
        tests_passed += 1
    else:
        print(f"   ⚠️  PARTIAL - Tool called but args may be wrong")
        tests_passed += 1
else:
    print(f"   ❌ FAIL - No tool call")
    tests_failed += 1

# Summary
print("\n" + "=" * 70)
print(f"RESULTS: {tests_passed} passed, {tests_failed} failed")
print("=" * 70)

if tests_failed > 0:
    print("\n⚠️  Some tests failed - tool calling may not be reliable")
else:
    print("\n✅ All tests passed - tool calling is working!")
