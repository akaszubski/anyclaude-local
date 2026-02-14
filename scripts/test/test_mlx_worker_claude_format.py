#!/usr/bin/env python3
"""
Test MLX worker with REAL Claude Code request format.
Simulates exactly what Claude Code sends through the proxy.
"""
import json
import requests
import sys

MLX_WORKER_URL = "http://localhost:8081"

# Test cases that match real Claude Code requests
TEST_CASES = [
    {
        "name": "Simple string content",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "user", "content": "hi"}
            ],
            "max_tokens": 50
        }
    },
    {
        "name": "Array content format (Claude Code style)",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": [
                    {"type": "text", "text": "What is 2+2?"}
                ]}
            ],
            "max_tokens": 50
        }
    },
    {
        "name": "Mixed content with system-reminder (Claude Code injects these)",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "system", "content": "You are a coding assistant."},
                {"role": "user", "content": [
                    {"type": "text", "text": "<system-reminder>\nThis is injected context.\n</system-reminder>"},
                    {"type": "text", "text": "Hello, who are you?"}
                ]}
            ],
            "max_tokens": 100
        }
    },
    {
        "name": "With tools (Claude Code always sends tools)",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "system", "content": "You are an assistant with tools."},
                {"role": "user", "content": [
                    {"type": "text", "text": "Read the file README.md"}
                ]}
            ],
            "max_tokens": 100,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "description": "Read contents of a file",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string", "description": "File path"}
                            },
                            "required": ["path"]
                        }
                    }
                }
            ]
        }
    },
    {
        "name": "Large system prompt (like CLAUDE.md)",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "system", "content": "# CLAUDE.md\n\n" + "This is a test. " * 500},
                {"role": "user", "content": [
                    {"type": "text", "text": "Summarize the system prompt in one sentence."}
                ]}
            ],
            "max_tokens": 100
        }
    },
    {
        "name": "Tool role message (after tool execution)",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "system", "content": "You are an assistant."},
                {"role": "user", "content": "Read README.md"},
                {"role": "assistant", "content": None, "tool_calls": [
                    {"id": "call_123", "type": "function", "function": {"name": "read_file", "arguments": "{\"path\": \"README.md\"}"}}
                ]},
                {"role": "tool", "content": "# README\n\nThis is the readme content.", "tool_call_id": "call_123"}
            ],
            "max_tokens": 100
        }
    },
    {
        "name": "Model name with dots and numbers",
        "request": {
            "model": "claude-opus-4-5-20251101",
            "messages": [
                {"role": "user", "content": "hi"}
            ],
            "max_tokens": 50
        }
    },
    {
        "name": "Empty content array",
        "request": {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {"role": "user", "content": []}
            ],
            "max_tokens": 50
        }
    },
]

def test_health():
    """Check if MLX worker is running."""
    try:
        r = requests.get(f"{MLX_WORKER_URL}/health", timeout=5)
        if r.status_code == 200:
            print("✓ MLX worker is healthy")
            return True
        else:
            print(f"✗ MLX worker unhealthy: {r.status_code}")
            return False
    except Exception as e:
        print(f"✗ MLX worker not reachable: {e}")
        return False

def test_models():
    """Check /v1/models endpoint."""
    try:
        r = requests.get(f"{MLX_WORKER_URL}/v1/models", timeout=5)
        data = r.json()
        if "data" in data and len(data["data"]) > 0:
            model = data["data"][0]
            context_length = model.get("context_length", "N/A")
            print(f"✓ Models endpoint works: {model['id']} (context: {context_length})")
            return True
        else:
            print(f"✗ No models returned: {data}")
            return False
    except Exception as e:
        print(f"✗ Models endpoint failed: {e}")
        return False

def test_chat_completion(test_case: dict) -> bool:
    """Test a single chat completion request."""
    name = test_case["name"]
    request = test_case["request"]

    try:
        r = requests.post(
            f"{MLX_WORKER_URL}/v1/chat/completions",
            json=request,
            headers={"Content-Type": "application/json"},
            timeout=120  # Long timeout for large prompts
        )

        if r.status_code == 200:
            data = r.json()
            message = data.get("choices", [{}])[0].get("message", {})
            content = message.get("content") or ""
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                tool_names = [tc.get("function", {}).get("name", "?") for tc in tool_calls]
                print(f"✓ {name}: [Tool calls: {', '.join(tool_names)}]")
            else:
                preview = content[:50] + "..." if len(content) > 50 else content
                print(f"✓ {name}: {preview}")
            return True
        elif r.status_code == 422:
            error = r.json()
            print(f"✗ {name}: 422 Validation Error")
            print(f"  Detail: {json.dumps(error.get('detail', error), indent=2)[:500]}")
            return False
        else:
            print(f"✗ {name}: {r.status_code} {r.text[:200]}")
            return False

    except requests.exceptions.Timeout:
        print(f"✗ {name}: Timeout (>120s)")
        return False
    except Exception as e:
        print(f"✗ {name}: {e}")
        return False

def main():
    print("=" * 60)
    print("MLX Worker Claude Code Format Tests")
    print("=" * 60)
    print()

    # Check worker is running
    if not test_health():
        print("\nMLX worker not running. Start with:")
        print("  source .venv/bin/activate && MLX_MODEL_PATH=... uvicorn src.mlx_worker.server:app --port 8081")
        sys.exit(1)

    if not test_models():
        sys.exit(1)

    print()
    print("-" * 60)
    print("Testing Claude Code request formats...")
    print("-" * 60)

    passed = 0
    failed = 0

    for test_case in TEST_CASES:
        if test_chat_completion(test_case):
            passed += 1
        else:
            failed += 1

    print()
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
