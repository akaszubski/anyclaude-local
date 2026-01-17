#!/usr/bin/env python3
"""Debug Gemma format parsing"""
import sys
sys.path.insert(0, 'scripts')
from lib.qwen_tool_parser import QwenToolParser

parser = QwenToolParser()

# Test the Gemma format
response = '<start_function_call>call:Read{file_path:/tmp/test.txt}<end_function_call>'
result = parser.parse(response)
print('Response:', repr(response))
print('Result:', result)

# Check _parse_gemma_args directly
args = parser._parse_gemma_args('file_path:/tmp/test.txt')
print('Parsed args:', args)

# Test with space between args
args2 = parser._parse_gemma_args('file_path:/tmp/out.txt content:Hello World')
print('Parsed args2:', args2)
