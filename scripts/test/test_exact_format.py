#!/usr/bin/env python3
"""Test parser with exact Test 6 output format"""
import sys
sys.path.insert(0, 'scripts')
from lib.qwen_tool_parser import QwenToolParser

p = QwenToolParser()

# Exact output from Test 6 - code block format
test = '''```json
{
  "name": "Glob",
  "arguments": {
    "pattern": "*.md"
  }
}
```'''

print('Input:')
print(test)
print()
print('can_parse:', p.can_parse(test))
result = p.parse(test)
print('Parsed:', result)

if result:
    print('\n✅ Parser detected tool call!')
else:
    print('\n❌ Parser FAILED to detect tool call')

    # Debug: check patterns individually
    import re
    for name, pattern in p.patterns.items():
        match = pattern.search(test)
        if match:
            print(f'  Pattern "{name}" matched: {match.group(0)[:80]}...')
        else:
            print(f'  Pattern "{name}": no match')
