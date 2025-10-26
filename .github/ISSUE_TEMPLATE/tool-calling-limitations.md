---
name: Tool Calling Limitations with Local Models
about: Document known limitations and workarounds for tool calling with local LLMs
title: "[LIMITATION] Tool calling reliability varies significantly with local models"
labels: documentation, enhancement, help-wanted
assignees: ''
---

## Summary

Tool calling (function calling) works with local models through anyclaude, but reliability varies significantly depending on the model. Some models like Qwen3-Coder-30B can successfully call simple tools but struggle with Claude Code's complex tool schemas.

## Test Results

### ✅ Simple Tool Test (Successful)
**Model**: Qwen3-Coder-30B-A3B-Instruct-MLX-6bit (262K context)

**Tool Schema**:
```json
{
  "name": "Bash",
  "description": "Executes a bash command",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": {"type": "string"},
      "description": {"type": "string"}
    },
    "required": ["command"]
  }
}
```

**Result**: ✅ Model successfully called tool with correct parameters
```json
{
  "type": "tool_use",
  "id": "call_903069732330016",
  "name": "Bash",
  "input": {
    "command": "git status",
    "description": "Get the current git status"
  }
}
```

### ❌ Claude Code Complex Tools (Failed)
**Model**: Same (Qwen3-Coder-30B-A3B-Instruct-MLX-6bit)

**User Request**: "what are the issues I have in git"

**Symptoms**:
- Model attempts to call Bash tool 7+ times
- Each attempt results in "Invalid tool parameters" error
- Model cannot determine what's wrong with the parameters
- Eventually gives up with generic response

**Likely Causes**:
1. Claude Code's Bash tool schema is much more complex (10+ properties, nested objects, enums)
2. Model struggles with optional vs required parameters
3. Model may not understand `additionalProperties: false` constraint
4. Context length from complex schemas reduces model performance

## Known Working Models

Based on community reports and testing:

| Model | Tool Calling | Notes |
|-------|-------------|-------|
| Qwen3-Coder-30B | ⚠️ Partial | Simple tools work, complex schemas fail |
| GPT-OSS-20B-MLX | ⚠️ Partial | Basic tool calling works |
| DeepSeek-Coder-V2-Lite | ❌ Poor | Weak tool calling capability |
| Mistral-7B | ❌ Poor | Not trained for tool calling |

**Note**: For comparison, Claude Sonnet 4.5 has >95% tool calling accuracy even with complex schemas.

## Workarounds

### Option 1: Use Text-Based Commands (Recommended)
Instead of relying on tool calling, use the model's natural language understanding:

```bash
# Good: Clear instructions
> "Run git status and show me the output"

# Bad: Requires tool calling
> "what are the issues I have in git"
```

### Option 2: Simplify Tool Schemas
If you're building a custom application, simplify tool schemas:
- Use only required parameters
- Avoid optional parameters when possible
- Use simple types (string, number, boolean)
- Avoid nested objects and arrays

### Option 3: Use Better Models
Some models have stronger tool calling:
- **Qwen2.5-Coder-32B**: Better instruction following
- **Command-R+ (35B)**: Trained specifically for tool use
- **GPT-4 via LiteLLM**: Near-perfect tool calling (but not local)

### Option 4: Disable Tool Calling
For pure conversation with local models:
```bash
# Run without Claude Code's tool system
# Just use LMStudio's chat interface directly
```

## Technical Details

### Schema Conversion
anyclaude correctly converts between:
- **Anthropic Messages API** (Claude Code format)
- **OpenAI Chat Completions** (LMStudio format)

The conversion is verified working via `tests/manual/test_bash_tool.js`.

### What Gets Sent to LMStudio

**Anthropic Format** (from Claude Code):
```json
{
  "tools": [{
    "name": "Bash",
    "description": "...",
    "input_schema": { "type": "object", "properties": {...} }
  }]
}
```

**OpenAI Format** (sent to LMStudio):
```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "Bash",
      "description": "...",
      "parameters": { "type": "object", "properties": {...} }
    }
  }]
}
```

Conversion handled by `@ai-sdk/openai-compatible` package.

## Recommendations for Users

### For General Use
1. **Expect limitations**: Tool calling with local models is experimental
2. **Test your model**: Run `node tests/manual/test_bash_tool.js` to verify tool calling works
3. **Use text commands**: More reliable than relying on tool calling
4. **Provide context**: Give models explicit instructions rather than expecting tool inference

### For Developers
1. **Simplify schemas**: Only use essential parameters
2. **Add error handling**: Gracefully handle tool calling failures
3. **Provide examples**: Include example tool calls in system prompts
4. **Test thoroughly**: Tool calling accuracy varies significantly between models

## Future Improvements

- [ ] Add tool calling accuracy metrics for popular models
- [ ] Create simplified tool schema profiles for weak models
- [ ] Implement fallback to text-based commands when tool calling fails
- [ ] Add debug mode to log tool calling failures with detailed error messages

## Related Issues

- Context window management (#X)
- Timeout handling for slow models (#X)
- Performance comparison with Claude Sonnet 4.5 (#X)

## Test Script

To test tool calling with your model:

```bash
# Start anyclaude with debug mode
ANYCLAUDE_DEBUG=2 PROXY_ONLY=true anyclaude &

# In another terminal
node tests/manual/test_bash_tool.js
```

This will show you:
- Whether your model can call the simplified Bash tool
- What parameters it provides
- How the schema is converted

---

**Expected Behavior**: Tool calling should work reliably for simple schemas, but complex Claude Code schemas may cause failures.

**Current Behavior**: Works for simple tools, fails for complex Claude Code schemas with most local models.

**Impact**: Users cannot use Claude Code's full capabilities with local models that have weak tool calling.
