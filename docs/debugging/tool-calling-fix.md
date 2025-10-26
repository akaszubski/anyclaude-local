# Tool calling: Error fixes with LMStudio models

## ✅ RESOLVED

Tool calling now works with LMStudio models! Two major issues were fixed:

1. Incorrect handling of streaming tool parameters
2. JSON Schema union types causing "invalid_union" errors

## Issue Summary

When using LMStudio models with anyclaude, Claude Code showed "Error reading file" and other tool execution errors. The root cause was incorrect handling of the AI SDK's streaming tool parameter events.

## The Fix

### ✅ Root Cause: Incorrect Tool Streaming Approach

**Problem**: Tool calls were being duplicated or malformed, causing "Error reading file" and similar issues.

**Root Cause**: The AI SDK sends tool calls in TWO ways:

1. **Streaming**: `tool-input-start` → `tool-input-delta` (many) → `tool-input-end` → `tool-call`
2. **Complete**: `tool-call` only (for backward compatibility)

Our original approach was WRONG - we skipped the streaming events and only sent the final `tool-call`. This caused duplicates when both were sent, and the first tool block had empty `input: {}`.

**Correct Solution** (comparing to original [coder/anyclaude](https://github.com/coder/anyclaude)):

```typescript
// Track which tools we've sent via streaming to avoid duplicates
const streamedToolIds = new Set<string>();

case "tool-input-start": {
  // Send streaming tool parameters as input_json_delta (Anthropic format)
  streamedToolIds.add(chunk.id); // Mark as streamed
  controller.enqueue({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: chunk.id,
      name: chunk.toolName,
      input: {}, // Start with empty, build via deltas
    },
  });
  break;
}

case "tool-input-delta": {
  // Stream each piece of the JSON parameter incrementally
  controller.enqueue({
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: chunk.delta },
  });
  break;
}

case "tool-input-end": {
  controller.enqueue({ type: "content_block_stop", index });
  index += 1;
  break;
}

case "tool-call": {
  // Skip if already sent via streaming (AI SDK sends BOTH!)
  if (streamedToolIds.has(chunk.toolCallId)) {
    break; // Avoid duplicate
  }

  // Handle atomic tool calls (non-streaming models)
  controller.enqueue({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: chunk.toolCallId,
      name: chunk.toolName,
      input: chunk.input,
    },
  });
  controller.enqueue({ type: "content_block_stop", index });
  index += 1;
  break;
}
```

**Result**: ✅ Tool calls work perfectly! No more errors.

## Key Learnings

### 1. AI SDK Sends Redundant Events

The AI SDK sends **both** streaming tool inputs AND a final atomic `tool-call` event. We must handle one or the other, not both.

### 2. Claude Code Expects Streaming Format

Claude Code works better with incremental `input_json_delta` events rather than atomic tool calls with complete parameters.

### 3. Original anyclaude Had It Right

By comparing to [coder/anyclaude](https://github.com/coder/anyclaude), we found they properly handle streaming tool parameters. Our port had deviated from this approach.

### 4. Not Model-Specific

Tested with multiple models (Qwen3 Coder 30B, GPT-OSS-20B) - all showed the same issue. The problem was our translation layer, not the models.

## Debug Tools Added

### 1. Enhanced Claude Mode Logging

Added SSE parsing to Claude mode to log tool calls from real Claude API:

```typescript
// In src/anthropic-proxy.ts
if (mode === "claude" && isTraceDebugEnabled()) {
  // Parse SSE events and log tool_use blocks
  if (
    data.type === "content_block_start" &&
    data.content_block?.type === "tool_use"
  ) {
    debug(3, `[Claude API → Tool Call] Tool use from real Claude:`, {
      tool_name: data.content_block.name,
      tool_id: data.content_block.id,
      input: data.content_block.input,
    });
  }
}
```

### 2. Comparison Script

Created `./compare-modes.sh` for side-by-side testing:

```bash
./compare-modes.sh "Read the README.md file"
```

Shows:

- Tool schema count (both have 17 tools)
- Tool calls made (Claude: 0, LMStudio: 3)
- Parameter format differences
- Full debug logs for analysis

### 3. Analysis Script

Enhanced `./analyze-tool-calls.sh` to extract tool call details:

```bash
./analyze-tool-calls.sh
```

Displays:

- Tool call count
- Complete parameters
- SSE events sent to Claude Code

## Environment

- **OS**: macOS (Darwin 24.6.0)
- **Node**: v18+
- **LMStudio**: Latest (serving on localhost:1234/v1)
- **Claude Code**: Latest version
- **Model**: Qwen/DeepSeek (various local models tested)

## Reproduction Steps

1. Start LMStudio with any model loaded
2. Run: `ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/debug.log`
3. When Claude Code starts, type: "Read the README.md file"
4. Observe: 1 "Invalid tool parameters" error
5. Model retries and succeeds with correct parameters
6. Check logs: `./analyze-tool-calls.sh`

## Next Steps

1. **Identify the failing tool call** - Which tool/parameters cause the error?
2. **Compare with Claude traces** - What does real Claude send differently?
3. **Schema validation** - Is `additionalProperties: false` too strict?
4. **Model behavior** - Do some models send extra parameters we need to filter?

## Related Files

- `src/convert-to-anthropic-stream.ts` - Stream conversion (main fix location)
- `src/anthropic-proxy.ts` - Enhanced Claude mode logging
- `src/json-schema.ts` - Tool schema conversion
- `compare-modes.sh` - Comparison testing script
- `PROJECT.md` - Full architecture documentation

## Testing the Fix

### Before (Broken)

```
> Read the README.md file
⏺ Read(README.md)
  ⎿  Read 802 lines
  ⎿  Error reading file  ❌
```

### After (Fixed)

```
> Read the README.md file
⏺ Read(README.md)
  ⎿  Read 802 lines  ✅
⏺ I've taken a look at the repository's README...  ✅
```

### Verified With

- ✅ Qwen3 Coder 30B - Works perfectly
- ✅ GPT-OSS-20B - Works perfectly
- ✅ Multiple tool types (Read, Bash, Glob, etc.)

## Fix #2: Union Type Schema Errors (2025-10-26)

### ✅ Root Cause: Invalid JSON Schema Union Types

**Problem**: Models like `tongyi-deepresearch-30b-a3b-mlx` and `gpt-oss-20b-mlx` failed with:

```
API Error: 400 {"type":"error","error":"Invalid type for 'input'."}
Error code: "invalid_union"
```

**Root Cause**: LMStudio doesn't support JSON Schema union types (`oneOf`, `anyOf`, `allOf`). Claude Code sends complex tool schemas that use these union patterns, which LMStudio rejects.

**Solution**: Enhanced `providerizeSchema()` in `src/json-schema.ts` to resolve union types:

```typescript
/**
 * Helper function to resolve union types (oneOf, anyOf, allOf)
 * LMStudio doesn't support JSON Schema union types, so we need to resolve them
 * to a single, concrete schema.
 */
function resolveUnionType(schema: JSONSchema7): JSONSchema7 {
  // Handle oneOf/anyOf: use the first non-null type
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const firstSchema = schema.oneOf.find(
      (s) => typeof s === "object" && s.type !== "null"
    );
    // ... remove oneOf and use the resolved schema
  }

  // Handle allOf: merge all schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    // Merge properties, required fields, and types
    // ... return merged schema
  }

  // Handle multi-type arrays: type: ['string', 'number']
  if (Array.isArray(schema.type)) {
    // Use first non-null type
  }
}
```

**Transformation Examples**:

Before (Claude Code sends):

```json
{
  "type": "object",
  "properties": {
    "value": {
      "oneOf": [{ "type": "string" }, { "type": "number" }]
    }
  }
}
```

After (LMStudio receives):

```json
{
  "type": "object",
  "properties": {
    "value": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Affected Models**:

- ✅ tongyi-deepresearch-30b-a3b-mlx - Now works
- ✅ gpt-oss-20b-mlx - Now works
- ✅ qwen3-coder-30b - Still works (backwards compatible)

**Testing**:

```bash
# Run unit tests
npm run test:unit

# Manual schema transformation test
node tests/manual/test_union_schema.js

# Test with affected models
ANYCLAUDE_DEBUG=3 anyclaude
# Try complex tool calls like Explore agent
```

## Debug Commands

```bash
# Test with LMStudio (basic logging)
ANYCLAUDE_DEBUG=1 anyclaude

# Test with verbose logging
ANYCLAUDE_DEBUG=2 anyclaude 2> /tmp/debug.log

# Test with trace-level logging (shows all tool events)
ANYCLAUDE_DEBUG=3 anyclaude 2> /tmp/trace.log
```
