#!/usr/bin/env python3
"""Check if Qwen chat template supports tools."""

from mlx_lm import load

model, tokenizer = load("/Users/andrewkaszubski/Models/Qwen2.5-Coder-7B-Instruct-4bit")

# Check if tokenizer has chat_template
if hasattr(tokenizer, 'chat_template'):
    print("Chat template available:")
    print(tokenizer.chat_template[:500] if tokenizer.chat_template else "None")
else:
    print("No chat_template attribute")

# Try apply_chat_template with tools
try:
    messages = [{"role": "user", "content": "Read README.md"}]
    tools = [{"type": "function", "function": {"name": "Read", "description": "Read a file", "parameters": {"type": "object", "properties": {"file_path": {"type": "string"}}}}}]

    result = tokenizer.apply_chat_template(messages, tools=tools, add_generation_prompt=True, tokenize=False)
    print("\n\nWith tools:")
    print(result[:1000])
except Exception as e:
    print(f"\nTools error: {e}")
