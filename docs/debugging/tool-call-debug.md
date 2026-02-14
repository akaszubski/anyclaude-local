# Tool Call Debugging Guide

This guide helps you debug "Invalid tool parameters" errors when using anyclaude with LMStudio models.

## Quick Start

```bash
./capture-tool-call-debug.sh
```

This will:

1. Start anyclaude with TRACE level logging (level 3)
2. Capture all tool call details
3. Show you exactly what's being sent to Claude Code

## What Gets Logged

### Level 3 (TRACE) Logging Captures:

1. **Tool Schemas from Claude Code**
   - All 16 tools with complete schemas
   - Required vs optional parameters
   - Parameter types and descriptions

2. **Tool Calls from Model**
   - Which tool the model called
   - Tool call ID
   - Input parameters the model provided

3. **SSE Events to Claude Code**
   - Exact format sent back to Claude Code
   - Parameter validation details
   - Content block structure

## Understanding the Output

### Successful Tool Call

```
[ANYCLAUDE DEBUG] [Tool Call] Model called tool: Read {
  "toolCallId": "call_abc123",
  "toolName": "Read",
  "input": {
    "file_path": "/Users/user/project/README.md"
  }
}

[ANYCLAUDE DEBUG] [Tool Call → Claude Code] Sending content_block_start: {
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "tool_use",
    "id": "call_abc123",
    "name": "Read",
    "input": {
      "file_path": "/Users/user/project/README.md"
    }
  }
}

[ANYCLAUDE DEBUG] [SSE → Claude Code] Writing tool_use event: {
  "event": "content_block_start",
  "index": 0,
  "tool_name": "Read",
  "tool_id": "call_abc123",
  "input": {
    "file_path": "/Users/user/project/README.md"
  }
}
```

### Failed Tool Call (Invalid Parameters)

If you see "Invalid tool parameters" in Claude Code's UI, look for:

1. **Missing required parameters**

   ```json
   // Schema requires file_path, but model sent:
   "input": {}
   ```

2. **Wrong parameter types**

   ```json
   // Schema expects string, but model sent:
   "input": { "file_path": null }
   ```

3. **Extra parameters not in schema**

   ```json
   // Schema doesn't have 'format', but model sent:
   "input": {
     "file_path": "/path/to/file",
     "format": "json"  // <-- Not in schema!
   }
   ```

4. **Parameter casing mismatch**
   ```json
   // Schema has file_path, but model sent:
   "input": { "filePath": "/path/to/file" }  // <-- Wrong casing!
   ```

## Comparison Testing

### Test 1: Known Working Model (Real Claude API)

```bash
# Run with Claude API mode to capture successful tool calls
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude > claude-stdout.log 2> claude-stderr.log &

# Trigger same prompt
# ... test ...

# Extract Claude's tool call format
grep -A 10 "[Tool Call]" claude-stderr.log > claude-tool-calls.txt
```

### Test 2: LMStudio Model (Potentially Failing)

```bash
# Run with LMStudio mode
ANYCLAUDE_MODE=lmstudio ANYCLAUDE_DEBUG=3 anyclaude > lmstudio-stdout.log 2> lmstudio-stderr.log &

# Trigger SAME prompt
# ... test ...

# Extract LMStudio's tool call format
grep -A 10 "[Tool Call]" lmstudio-stderr.log > lmstudio-tool-calls.txt
```

### Test 3: Compare

```bash
# Compare the two formats
diff claude-tool-calls.txt lmstudio-tool-calls.txt
```

This will show you exactly what's different between a working (Claude) and failing (LMStudio) tool call.

## Common Issues

### Issue 1: Model Sends Empty Input

**Symptom:**

```json
"input": {}
```

**Cause:** Model doesn't understand the tool schema

**Fix:** Add a model-specific adapter in `src/adapters/` extending `BaseAdapter`:

```typescript
// Example adapter config
  maxParameters: 3,
  removeOptionalParams: true,
  toolCallingHint: '\\n\\nUse tools by calling them with required parameters only.'
}
```

### Issue 2: Model Sends Wrong Parameter Names

**Symptom:**

```json
// Schema has: file_path
// Model sends: filePath
```

**Cause:** Model using camelCase instead of snake_case

**Fix:** Currently no automatic fix - this is a model limitation. Consider using a different model that follows the schema exactly.

### Issue 3: Model Sends Extra Parameters

**Symptom:**

```json
"input": {
  "file_path": "/path",
  "extra_param": "value"  // <-- Not in schema
}
```

**Cause:** Model hallucinating parameters

**Fix:** Set `additionalProperties: false` in schema (already done), or use model adapter to filter parameters.

## Advanced Debugging

### Enable Full Request/Response Logging

```bash
# Save complete request/response pairs
ANYCLAUDE_DEBUG=3 anyclaude
```

Check `~/.anyclaude/traces/lmstudio/` for JSON files containing:

- Complete request body
- Complete response body
- All tool schemas
- All tool calls

### Compare with Real Anthropic API

```bash
# Test with real Claude API
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 anyclaude

# Check traces
ls -la ~/.anyclaude/traces/claude/

# Compare trace files
cat ~/.anyclaude/traces/claude/$(ls -t ~/.anyclaude/traces/claude/ | head -1) | jq '.request.tools[0]'
cat ~/.anyclaude/traces/lmstudio/$(ls -t ~/.anyclaude/traces/lmstudio/ | head -1) | jq '.request.tools[0]'
```

## Next Steps

Once you've identified the issue:

1. **If model is sending wrong format**: Configure model adapter
2. **If model doesn't support tool calling**: Use `--test-model` to verify
3. **If schemas are too complex**: Simplify with model adapter
4. **If issue persists**: File bug report with captured logs

## Capturing Logs for Bug Reports

```bash
# Run the debug script
./capture-tool-call-debug.sh

# When done, compress logs
tar -czf tool-call-debug-$(date +%Y%m%d).tar.gz /tmp/tool-call-debug-*.log

# Attach to GitHub issue
```

Include:

- Model name and quantization
- Exact prompt that triggered error
- Screenshots of "Invalid tool parameters" error
- Compressed debug logs

## See Also

- [MODEL_TESTING.md](MODEL_TESTING.md) - Test model compatibility
- [MODEL_ADAPTERS.md](MODEL_ADAPTERS.md) - Configure model-specific adaptations
- [CLAUDE.md](CLAUDE.md) - Project architecture overview
