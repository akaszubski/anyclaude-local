#!/usr/bin/env python3
"""Create a test request with full CLAUDE.md as system prompt."""
import json
from pathlib import Path

claude_md = Path("/Users/andrewkaszubski/Dev/anyclaude/CLAUDE.md").read_text()

request = {
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 100,
    "system": claude_md,
    "messages": [{"role": "user", "content": "What is this project about? Answer in one sentence."}]
}

output_path = Path("/Users/andrewkaszubski/Dev/anyclaude/test-large-request.json")
output_path.write_text(json.dumps(request))
print(f"Created {output_path} with {len(claude_md)} char system prompt")
