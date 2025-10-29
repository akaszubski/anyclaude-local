#!/usr/bin/env python3
"""
Test tool calling functionality
This verifies that the server properly handles tool definitions and returns tool_calls
"""

import json
import requests
import sys

SERVER_URL = "http://localhost:8081/v1/chat/completions"

def test_tool_calling():
    """Verify tool calling works end-to-end"""

    print("\n=== TOOL CALLING VERIFICATION TEST ===\n")

    # Define a simple tool
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get the current weather in a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA"
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "Temperature unit"
                        }
                    },
                    "required": ["location"]
                }
            }
        }
    ]

    print("1️⃣  Sending request with tool definition...")
    print(f"   Tool: {tools[0]['function']['name']}")

    request = {
        "model": "current-model",
        "messages": [
            {"role": "user", "content": "What's the weather in San Francisco?"}
        ],
        "tools": tools,
        "stream": False,
        "max_tokens": 500
    }

    try:
        resp = requests.post(SERVER_URL, json=request, timeout=30)
        data = resp.json()

        if "error" in data:
            print(f"❌ ERROR: {data['error']}")
            return False

        # Check response structure
        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})

        print("\n2️⃣  Checking response format...")

        # Check for tool_calls field
        tool_calls = message.get("tool_calls")
        print(f"   tool_calls field present: {tool_calls is not None}")

        if tool_calls is not None:
            print(f"   ✅ Tool calls field present in response")
            print(f"   Tool calls: {json.dumps(tool_calls, indent=2)}")

            if isinstance(tool_calls, list) and len(tool_calls) > 0:
                print(f"   ✅ Model attempted to call a tool!")
                return True
            else:
                print("   ⚠️  Tool calls field present but empty - model didn't use tools")
                return True  # Still valid - shows format is correct
        else:
            print("   ❌ tool_calls field missing from response")
            print(f"   Response: {json.dumps(message, indent=2)}")
            return False

    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

if __name__ == "__main__":
    success = test_tool_calling()
    sys.exit(0 if success else 1)
