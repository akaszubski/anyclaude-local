#!/usr/bin/env python3
"""Test inference with tools to debug empty response issue"""
import sys
import os
sys.path.insert(0, 'src')
sys.path.insert(0, 'scripts')
from mlx_worker.inference import generate_stream
from lib.qwen_tool_parser import QwenToolParser

# Test the parser on the actual model output
test_input = '<tool_call>\n<function=Read>\n<parameter=file_path>\nPROJECT.md\n</parameter>\n</function>\n</tool_call>'

print('=== Testing Parser ===')
parser = QwenToolParser()
print(f'Input: {repr(test_input)}')
print(f'can_parse: {parser.can_parse(test_input)}')
result = parser.parse(test_input)
print(f'parse result: {result}')
print()

# Also test inference
model_path = os.path.expanduser('~/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit')
messages = [{'role': 'user', 'content': 'Read the file PROJECT.md'}]
tools = [{'type': 'function', 'function': {'name': 'Read', 'description': 'Read file', 'parameters': {'type': 'object', 'properties': {'file_path': {'type': 'string'}}}}}]

print('=== Testing Inference ===')
print(f'Model: {model_path}')
tokens = []
for t in generate_stream(messages, model_path=model_path, max_tokens=100, tools=tools):
    tokens.append(t)
print('Full output:', repr(''.join(tokens)))
print()

# Parse the actual output
actual_output = ''.join(tokens)
print('=== Parsing Actual Output ===')
print(f'can_parse: {parser.can_parse(actual_output)}')
result = parser.parse(actual_output)
print(f'parse result: {result}')
