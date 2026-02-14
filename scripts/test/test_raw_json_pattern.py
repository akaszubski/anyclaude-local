#!/usr/bin/env python3
"""Test the raw JSON pattern matching"""
import re

# The pattern from qwen_tool_parser.py
pattern = re.compile(
    r'```(?:json)?\s*(\{[^`]*?"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:[^`]*?\})\s*```',
    re.DOTALL
)

# Test input (what the model actually outputs)
test_input = '''```json
{
  "name": "Read",
  "arguments": {
    "file_path": "/Users/andrewkaszubski/Dev/anyclaude/README.md"
  }
}
```'''

print("Testing raw_json_block pattern...")
print(f"Input length: {len(test_input)}")
print(f"Input preview: {test_input[:50]}...")

match = pattern.search(test_input)
if match:
    print("\n✅ MATCH FOUND!")
    print(f"Captured group: {match.group(1)[:100]}...")
else:
    print("\n❌ NO MATCH")

    # Debug: try simpler patterns
    print("\nDebug - checking components:")

    # Check if backticks are present
    if '```' in test_input:
        print("  - Backticks present: YES")
    else:
        print("  - Backticks present: NO")

    # Check for json tag
    if '```json' in test_input:
        print("  - ```json tag present: YES")
    else:
        print("  - ```json tag present: NO")

    # Try matching just the JSON part
    json_pattern = re.compile(r'\{[^`]*?"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:[^`]*?\}', re.DOTALL)
    json_match = json_pattern.search(test_input)
    if json_match:
        print(f"  - JSON structure found: YES -> {json_match.group(0)[:50]}...")
    else:
        print("  - JSON structure found: NO")
