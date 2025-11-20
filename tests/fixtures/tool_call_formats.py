#!/usr/bin/env python3
"""
Test Fixtures: Tool Call Formats

Common test data for tool call parser tests.
Provides valid and invalid examples of different tool call formats.
"""

import json
from typing import Dict, Any, List


# ============================================================================
# OpenAI Tool Call Format
# ============================================================================

VALID_OPENAI_SINGLE_CALL = {
    "tool_calls": [
        {
            "id": "call_abc123",
            "type": "function",
            "function": {
                "name": "Read",
                "arguments": json.dumps({
                    "file_path": "/tmp/test.txt"
                })
            }
        }
    ]
}

VALID_OPENAI_MULTIPLE_CALLS = {
    "tool_calls": [
        {
            "id": "call_read_1",
            "type": "function",
            "function": {
                "name": "Read",
                "arguments": json.dumps({
                    "file_path": "/tmp/input.txt"
                })
            }
        },
        {
            "id": "call_write_1",
            "type": "function",
            "function": {
                "name": "Write",
                "arguments": json.dumps({
                    "file_path": "/tmp/output.txt",
                    "content": "processed data"
                })
            }
        }
    ]
}

VALID_OPENAI_COMPLEX_ARGS = {
    "tool_calls": [
        {
            "id": "call_edit_1",
            "type": "function",
            "function": {
                "name": "Edit",
                "arguments": json.dumps({
                    "file_path": "/tmp/code.py",
                    "old_string": "def old_function():\n    pass",
                    "new_string": "def new_function():\n    return True",
                    "replace_all": False
                })
            }
        }
    ]
}

INVALID_OPENAI_MISSING_ID = {
    "tool_calls": [
        {
            "type": "function",
            "function": {
                "name": "Read",
                "arguments": "{}"
            }
        }
    ]
}

INVALID_OPENAI_MISSING_TYPE = {
    "tool_calls": [
        {
            "id": "call_1",
            "function": {
                "name": "Read",
                "arguments": "{}"
            }
        }
    ]
}

INVALID_OPENAI_MISSING_FUNCTION = {
    "tool_calls": [
        {
            "id": "call_1",
            "type": "function"
        }
    ]
}

INVALID_OPENAI_MALFORMED_JSON = "{'tool_calls': [not valid json]}"

INVALID_OPENAI_NO_TOOL_CALLS_KEY = {
    "content": "Just a text response",
    "role": "assistant"
}


# ============================================================================
# Commentary Tool Call Format
# ============================================================================

VALID_COMMENTARY_SINGLE_CALL = """
Let me read that file for you.

[TOOL_CALL]
{
    "name": "Read",
    "arguments": {
        "file_path": "/tmp/test.txt"
    }
}
[/TOOL_CALL]

I'll analyze the contents.
"""

VALID_COMMENTARY_MULTIPLE_CALLS = """
First, I'll read the input file:

[TOOL_CALL]
{
    "name": "Read",
    "arguments": {
        "file_path": "/tmp/input.txt"
    }
}
[/TOOL_CALL]

Now I'll process the data and write the output:

[TOOL_CALL]
{
    "name": "Write",
    "arguments": {
        "file_path": "/tmp/output.txt",
        "content": "processed data"
    }
}
[/TOOL_CALL]

Done!
"""

VALID_COMMENTARY_COMPLEX_ARGS = """
I need to make some edits:

[TOOL_CALL]
{
    "name": "Edit",
    "arguments": {
        "file_path": "/tmp/code.py",
        "old_string": "def old_function():\\n    pass",
        "new_string": "def new_function():\\n    return True"
    }
}
[/TOOL_CALL]
"""

INVALID_COMMENTARY_MALFORMED_JSON = """
[TOOL_CALL]
{
    "name": "Read",
    "arguments": {invalid json here}
}
[/TOOL_CALL]
"""

INVALID_COMMENTARY_NO_TAGS = "This is just commentary with no tool call tags."

INVALID_COMMENTARY_INCOMPLETE_TAGS = """
[TOOL_CALL]
{
    "name": "Read",
    "arguments": {}
}
"""  # Missing [/TOOL_CALL]


# ============================================================================
# Custom Format Examples (for model-specific parsers)
# ============================================================================

CUSTOM_FORMAT_QWEN = """
<tool>
{
    "name": "Read",
    "args": {
        "file_path": "/tmp/test.txt"
    }
}
</tool>
"""

CUSTOM_FORMAT_HERMES = """
<function=Read>
{"file_path": "/tmp/test.txt"}
</function>
"""


# ============================================================================
# Plain Text Responses (no tool calls)
# ============================================================================

PLAIN_TEXT_RESPONSE = "This is just a plain text response with no tool calls."

PLAIN_TEXT_MULTILINE = """
This is a longer response that spans
multiple lines but contains no tool calls.

It might have some code:
```python
def example():
    return "Hello"
```

But no actual tool calls.
"""


# ============================================================================
# Edge Cases
# ============================================================================

EDGE_CASE_EMPTY_STRING = ""

EDGE_CASE_WHITESPACE_ONLY = "   \n\t   \n   "

EDGE_CASE_VERY_LARGE_JSON = json.dumps({
    "tool_calls": [
        {
            "id": f"call_{i}",
            "type": "function",
            "function": {
                "name": "Read",
                "arguments": json.dumps({
                    "file_path": f"/tmp/file_{i}.txt",
                    "padding": "X" * 1000  # Large argument
                })
            }
        }
        for i in range(100)
    ]
})

EDGE_CASE_NESTED_JSON = {
    "tool_calls": [
        {
            "id": "call_1",
            "type": "function",
            "function": {
                "name": "ComplexTool",
                "arguments": json.dumps({
                    "config": {
                        "nested": {
                            "deeply": {
                                "structure": {
                                    "value": [1, 2, 3, {"key": "value"}]
                                }
                            }
                        }
                    }
                })
            }
        }
    ]
}

EDGE_CASE_UNICODE = {
    "tool_calls": [
        {
            "id": "call_unicode",
            "type": "function",
            "function": {
                "name": "Write",
                "arguments": json.dumps({
                    "file_path": "/tmp/unicode.txt",
                    "content": "Hello 世界 🌍 émojis"
                })
            }
        }
    ]
}


# ============================================================================
# Mixed Format (ambiguous cases)
# ============================================================================

MIXED_FORMAT_BOTH = """
{
    "tool_calls": [
        {
            "id": "call_1",
            "type": "function",
            "function": {"name": "Read", "arguments": "{}"}
        }
    ]
}

Also has commentary tags:

[TOOL_CALL]
{"name": "Write", "arguments": {}}
[/TOOL_CALL]
"""


# ============================================================================
# Helper Functions
# ============================================================================

def get_all_valid_openai_examples() -> List[Dict[str, Any]]:
    """Get all valid OpenAI format examples"""
    return [
        VALID_OPENAI_SINGLE_CALL,
        VALID_OPENAI_MULTIPLE_CALLS,
        VALID_OPENAI_COMPLEX_ARGS,
        EDGE_CASE_NESTED_JSON,
        EDGE_CASE_UNICODE
    ]


def get_all_invalid_openai_examples() -> List[Any]:
    """Get all invalid OpenAI format examples"""
    return [
        INVALID_OPENAI_MISSING_ID,
        INVALID_OPENAI_MISSING_TYPE,
        INVALID_OPENAI_MISSING_FUNCTION,
        INVALID_OPENAI_MALFORMED_JSON,
        INVALID_OPENAI_NO_TOOL_CALLS_KEY
    ]


def get_all_valid_commentary_examples() -> List[str]:
    """Get all valid commentary format examples"""
    return [
        VALID_COMMENTARY_SINGLE_CALL,
        VALID_COMMENTARY_MULTIPLE_CALLS,
        VALID_COMMENTARY_COMPLEX_ARGS
    ]


def get_all_invalid_commentary_examples() -> List[str]:
    """Get all invalid commentary format examples"""
    return [
        INVALID_COMMENTARY_MALFORMED_JSON,
        INVALID_COMMENTARY_NO_TAGS,
        INVALID_COMMENTARY_INCOMPLETE_TAGS
    ]


def get_all_plain_text_examples() -> List[str]:
    """Get all plain text (no tool calls) examples"""
    return [
        PLAIN_TEXT_RESPONSE,
        PLAIN_TEXT_MULTILINE,
        EDGE_CASE_WHITESPACE_ONLY
    ]


def get_all_edge_cases() -> List[Any]:
    """Get all edge case examples"""
    return [
        EDGE_CASE_EMPTY_STRING,
        EDGE_CASE_WHITESPACE_ONLY,
        EDGE_CASE_VERY_LARGE_JSON,
        EDGE_CASE_NESTED_JSON,
        EDGE_CASE_UNICODE,
        MIXED_FORMAT_BOTH
    ]
