#!/usr/bin/env python3
"""Replay a real Claude Code trace against local MLX worker"""
import json
import os
import requests
import time
import sys

# Load trace
trace_path = os.path.expanduser('~/.anyclaude/traces/openrouter/2025-11-20T11-08-53-595Z.json')
d = json.load(open(trace_path))
b = d['request']['body']

# Convert to OpenAI format for MLX worker
messages = []

# Add system prompt
sys_prompt = b.get('system', '')
if isinstance(sys_prompt, list):
    sys_text = ' '.join([x.get('text','') for x in sys_prompt if isinstance(x, dict)])
else:
    sys_text = str(sys_prompt)

# Use full system prompt (no truncation) to simulate real Claude Code
messages.append({'role': 'system', 'content': sys_text})

# Add user message - be explicit about using tools
messages.append({'role': 'user', 'content': 'Use the Glob tool to find all *.md files in the current directory.'})

# Get tools (first 5 for test)
tools = b.get('tools', [])[:5]

print(f'System prompt: {len(sys_text)} chars (FULL - no truncation)')
print(f'Tools: {len(tools)}')
print(f'Tool names: {[t["name"] for t in tools]}')

# Convert tools to OpenAI format
openai_tools = []
for t in tools:
    openai_tools.append({
        'type': 'function',
        'function': {
            'name': t['name'],
            'description': t.get('description', '')[:200],
            'parameters': t.get('input_schema', {'type': 'object', 'properties': {}})
        }
    })

# Send to MLX worker
print('\nSending to MLX worker...')
start = time.time()
try:
    r = requests.post('http://localhost:8081/v1/chat/completions', json={
        'messages': messages,
        'max_tokens': 300,
        'tools': openai_tools,
        'stream': False
    }, timeout=60)
    elapsed = time.time() - start

    print(f'Time: {elapsed:.2f}s')
    print(f'Status: {r.status_code}')

    resp = r.json()
    print(f'\nFull response:\n{json.dumps(resp, indent=2)[:2000]}')

    choice = resp.get('choices', [{}])[0]
    msg = choice.get('message', {})

    print(f'\n--- Analysis ---')
    print(f'Response type: {msg.get("role")}')
    if msg.get('tool_calls'):
        print('✅ TOOL CALLS DETECTED!')
        for tc in msg['tool_calls']:
            fn = tc.get('function', {})
            print(f'  - {fn.get("name")}: {fn.get("arguments", "")[:200]}')
    else:
        content = msg.get("content", "")
        print(f'❌ No tool calls - got text response:')
        print(f'Content: {content[:500]}')

except Exception as e:
    print(f'Error: {e}')
