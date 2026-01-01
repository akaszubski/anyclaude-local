#!/usr/bin/env python3
"""UAT Tests for Qwen Tool Parser (Issue #33)"""

import requests
import json
import sys

BASE_URL = "http://localhost:8081"

def test_tool_call(name, messages, tools, expected_tool=None):
    """Run a single UAT test"""
    print(f"\n{'='*60}")
    print(f"UAT TEST: {name}")
    print(f"{'='*60}")

    payload = {
        "model": "current-model",
        "messages": messages,
        "tools": tools,
        "max_tokens": 500,
        "temperature": 0.1,
        "stream": False
    }

    try:
        resp = requests.post(f"{BASE_URL}/v1/chat/completions", json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        # Check response structure
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        content = message.get("content", "")
        tool_calls = message.get("tool_calls", [])
        finish_reason = choice.get("finish_reason", "")

        print(f"Status: {resp.status_code}")
        print(f"Finish Reason: {finish_reason}")
        if content:
            print(f"Content: {content[:200]}...")
        else:
            print(f"Content: (none)")
        print(f"Tool Calls: {len(tool_calls)}")

        if tool_calls:
            for i, tc in enumerate(tool_calls):
                func = tc.get("function", {})
                args = func.get("arguments", "")
                print(f"  Tool {i+1}: {func.get('name')} -> {args[:100]}...")

            # Verify expected tool was called
            if expected_tool:
                names = [tc.get("function", {}).get("name") for tc in tool_calls]
                if expected_tool in names:
                    print(f"✅ PASS: Expected tool '{expected_tool}' was called")
                    return True
                else:
                    print(f"❌ FAIL: Expected '{expected_tool}', got {names}")
                    return False
            else:
                print(f"✅ PASS: Tool calls detected")
                return True
        else:
            if expected_tool:
                print(f"❌ FAIL: No tool calls, expected '{expected_tool}'")
                return False
            else:
                print(f"ℹ️  INFO: No tool calls in response")
                return True

    except requests.exceptions.Timeout:
        print(f"❌ ERROR: Request timed out (120s)")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def main():
    print("="*60)
    print("UAT TESTING: Qwen Tool Parser (Issue #33)")
    print("="*60)

    # Check server is up
    try:
        health = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Server Status: {health.json().get('status', 'unknown')}")
    except Exception as e:
        print(f"❌ Server not responding: {e}")
        sys.exit(1)

    # Define test tools
    read_tool = {
        "type": "function",
        "function": {
            "name": "Read",
            "description": "Read a file from the filesystem",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to file"}
                },
                "required": ["file_path"]
            }
        }
    }

    write_tool = {
        "type": "function",
        "function": {
            "name": "Write",
            "description": "Write content to a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to file"},
                    "content": {"type": "string", "description": "Content to write"}
                },
                "required": ["file_path", "content"]
            }
        }
    }

    bash_tool = {
        "type": "function",
        "function": {
            "name": "Bash",
            "description": "Execute a bash command",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The command to run"}
                },
                "required": ["command"]
            }
        }
    }

    # Run tests
    results = []

    # Test 1: Basic Read tool
    results.append(test_tool_call(
        "Basic Read Tool",
        [{"role": "user", "content": "Read the file /tmp/test.txt"}],
        [read_tool],
        expected_tool="Read"
    ))

    # Test 2: Multiple tools available - Bash
    results.append(test_tool_call(
        "Multiple Tools - Bash Command",
        [{"role": "user", "content": "List the files in /tmp directory using ls command"}],
        [read_tool, write_tool, bash_tool],
        expected_tool="Bash"
    ))

    # Test 3: Write with complex args
    results.append(test_tool_call(
        "Write Tool with Content",
        [{"role": "user", "content": "Write the text 'Hello World' to /tmp/hello.txt"}],
        [read_tool, write_tool],
        expected_tool="Write"
    ))

    # Test 4: No tool needed (conversational)
    results.append(test_tool_call(
        "No Tool Needed (Conversational)",
        [{"role": "user", "content": "What is 2 + 2?"}],
        [read_tool, write_tool, bash_tool],
        expected_tool=None  # Model should answer directly
    ))

    # Test 5: Complex nested arguments
    results.append(test_tool_call(
        "Complex Arguments",
        [{"role": "user", "content": "Write a Python function that prints hello to /tmp/script.py"}],
        [write_tool],
        expected_tool="Write"
    ))

    # Summary
    print(f"\n{'='*60}")
    print("UAT SUMMARY")
    print(f"{'='*60}")
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")

    if passed == total:
        print("✅ ALL UAT TESTS PASSED")
        return 0
    else:
        print(f"❌ {total - passed} TESTS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
