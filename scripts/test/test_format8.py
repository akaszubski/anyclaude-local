#!/usr/bin/env python3
"""Test Format 8 (code block) parsing"""
import sys
sys.path.insert(0, 'scripts')
from lib.qwen_tool_parser import QwenToolParser

p = QwenToolParser()

# Test the exact format from the model
test_input = '''```json
{
  "name": "Read",
  "arguments": {
    "file_path": "README.md"
  }
}
```'''

print("Input:")
print(test_input)
print()

result = p.parse(test_input)
print("Parsed:", result)

if result:
    print("✅ Format 8 parsing works!")
else:
    print("❌ Format 8 parsing FAILED")
    print()
    # Debug: check if pattern matches
    import re
    pattern = p.patterns.get('raw_json_block')
    if pattern:
        match = pattern.search(test_input)
        print(f"Pattern match: {match}")
        if match:
            print(f"Group 1: {match.group(1)}")
