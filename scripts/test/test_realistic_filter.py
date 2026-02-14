#!/usr/bin/env python3
"""Test with realistic Claude Code prompt containing critical sections."""
import requests
import time

PROXY_URL = "http://localhost:63256"

# Realistic Claude Code system prompt with critical sections
# Using raw string to avoid XML parsing issues
REALISTIC_SYSTEM = r'''You are Claude Code, Anthropic's official CLI for Claude.

In this environment you have access to a set of tools you can use to answer the user's question.
You can invoke functions by writing a block like the following:

<function_calls>
<invoke name="$FUNCTION_NAME">
<parameter name="$PARAMETER_NAME">$PARAMETER_VALUE