# Quick Start - Debugging Tool Call Issues

## The Simple Way

Just run anyclaude with debug logging enabled:

```bash
ANYCLAUDE_DEBUG=3 anyclaude
```

That's it! The enhanced logging we added will now capture:
- Tool schemas from Claude Code
- Tool calls made by the model
- Exact parameters sent to Claude Code

## Usage

1. **Start anyclaude with debug logging:**
   ```bash
   ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/tool-debug.log
   ```

2. **Trigger the error**

   Type a prompt that causes "Invalid tool parameters":
   - `Read the README.md file`
   - `Check the GitHub issues for this repo`
   - `List all TypeScript files`

3. **Analyze the logs**

   Open a new terminal and run:
   ```bash
   ./analyze-tool-calls.sh
   ```

   Or manually check:
   ```bash
   grep -A 10 "\[Tool Call\]" /tmp/tool-debug.log
   ```

## What the Logs Show

### Tool Schema (what Claude Code expects)
```
[ANYCLAUDE DEBUG] [Tool 1/16] Read {
  "description": "Reads a file...",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "The absolute path to the file"
      }
    },
    "required": ["file_path"]
  }
}
```

### Tool Call (what the model sent)
```
[ANYCLAUDE DEBUG] [Tool Call] Model called tool: Read {
  "toolCallId": "call_abc123",
  "toolName": "Read",
  "input": {
    "file_path": "/Users/user/project/README.md"
  }
}
```

### SSE Event (what we sent to Claude Code)
```
[ANYCLAUDE DEBUG] [SSE → Claude Code] Writing tool_use event: {
  "event": "content_block_start",
  "tool_name": "Read",
  "input": {
    "file_path": "/Users/user/project/README.md"
  }
}
```

## Common Issues

### Empty Input
**Log shows:**
```json
"input": {}
```

**Cause:** Model doesn't understand the schema

**Fix:** Configure model adapter in `src/model-adapters.ts`

### Wrong Parameter Names
**Log shows:**
```json
"input": { "filePath": "..." }  // Should be file_path
```

**Cause:** Model using different naming convention

**Fix:** Model limitation - try different model

### Missing Required Parameters
**Log shows:**
```json
"input": { "offset": 10 }  // Missing required file_path
```

**Cause:** Model hallucinating or misunderstanding schema

**Fix:** Simplify schema with model adapter

## Redirect Logs to File

If the terminal output is too noisy:

```bash
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/tool-debug-$(date +%Y%m%d-%H%M%S).log
```

Then analyze later:
```bash
grep -A 10 "\[Tool Call\]" /tmp/tool-debug-*.log | less
```

## Compare with Claude API

Want to see how real Claude handles the same prompt?

**Terminal 1: Real Claude**
```bash
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/claude-debug.log
# Type your prompt
```

**Terminal 2: LMStudio**
```bash
ANYCLAUDE_MODE=lmstudio ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/lmstudio-debug.log
# Type SAME prompt
```

**Terminal 3: Compare**
```bash
# Extract tool calls
grep -A 10 "\[Tool Call\]" /tmp/claude-debug.log > /tmp/claude-calls.txt
grep -A 10 "\[Tool Call\]" /tmp/lmstudio-debug.log > /tmp/lmstudio-calls.txt

# Show differences
diff /tmp/claude-calls.txt /tmp/lmstudio-calls.txt
```

This shows you EXACTLY what's different between working (Claude) and failing (LMStudio) tool calls.

## Need Help?

If you find a bug, capture:
```bash
# Full debug log
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/bug-report.log

# Include in bug report:
# 1. Model name: qwen3-coder-30b-a3b-instruct-mlx
# 2. Prompt that caused error
# 3. Screenshot of "Invalid tool parameters"
# 4. /tmp/bug-report.log (or grep for [Tool Call])
```
