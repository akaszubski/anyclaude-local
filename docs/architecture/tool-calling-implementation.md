# Tool Calling Implementation Guide

**Phase 1.2 - Tool Calling Test & Verification Infrastructure**

## Overview

This document describes the tool calling architecture for anyclaude's custom MLX server. The system converts between Anthropic's tool format and OpenAI's function calling format, enabling Claude Code's tool features (Read, Write, Edit, Bash, etc.) to work with local MLX models.

## Architecture

```
Claude Code
    ↓
Anthropic Messages API
    ↓
anyclaude proxy → [SCHEMA CONVERSION] → OpenAI Chat Completions
    ↓
Custom MLX Server (scripts/mlx-server.py)
    ↓
MLX-Textgen or LMStudio → generates OpenAI tool_calls
    ↓
[RESPONSE PARSING] → Anthropic tool_use format
    ↓
anyclaude proxy → Anthropic Messages SSE format
    ↓
Claude Code (displays results)
```

## Format Conversion

### Schema Conversion: Anthropic → OpenAI

**File**: `src/tool-schema-converter.ts`

**Purpose**: Convert Anthropic tool definitions to OpenAI function calling format

**Input (Anthropic format)**:
```typescript
{
  name: "Read",
  description: "Read a file",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" }
    },
    required: ["path"]
  }
}
```

**Output (OpenAI format)**:
```typescript
{
  type: "function",
  function: {
    name: "Read",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" }
      },
      required: ["path"]
    }
  }
}
```

**Key Functions**:

1. `convertAnthropicToolToOpenAI(tool: AnthropicTool): OpenAITool`
   - Converts a single Anthropic tool definition
   - Validates required fields (name, input_schema)
   - Preserves description and all schema properties
   - Throws descriptive errors for invalid input

2. `convertAnthropicToolsToOpenAI(tools: AnthropicTool[]): OpenAITool[]`
   - Batch conversion of multiple tools
   - Maps over array, converts each tool
   - Includes index in error messages for debugging

**Edge Cases Handled**:

- Empty schema (tools with no parameters)
- Nested objects (complex schemas)
- Array types
- Union types (oneOf, anyOf, allOf)
- Missing optional fields (description)

**See**: `src/tool-schema-converter.ts:50-104`

### Response Parsing: OpenAI → Anthropic

**File**: `src/tool-response-parser.ts`

**Purpose**: Parse OpenAI tool call responses back to Anthropic format, handling both streaming and complete responses

**Input (OpenAI tool_calls)**:
```typescript
{
  id: "call_abc123",
  type: "function",
  function: {
    name: "Read",
    arguments: '{"path":"/test.txt"}'  // JSON string!
  }
}
```

**Output (Anthropic tool_use)**:
```typescript
{
  type: "tool_use",
  id: "call_abc123",
  name: "Read",
  input: { path: "/test.txt" }  // Parsed object
}
```

**Key Functions**:

1. `parseOpenAIToolCall(toolCall: OpenAIToolCall): AnthropicToolUse`
   - Parse a single OpenAI tool call to Anthropic format
   - Validates required fields (id, function.name, function.arguments)
   - Parses JSON string arguments to object
   - Throws clear errors for malformed JSON

2. `assembleStreamingToolCall(deltas: StreamingToolCallDelta[]): AnthropicToolUse`
   - Assemble complete tool call from streaming deltas
   - Handles streaming patterns:
     - Normal: start → deltas → end
     - Incomplete (qwen3-coder): start → end → complete
     - Out-of-order: delta before start
   - Accumulates `delta` events into complete arguments
   - Handles `complete` events (alternative to accumulated deltas)
   - Returns empty object {} if no arguments

3. `parseOpenAIToolCalls(toolCalls: OpenAIToolCall[]): AnthropicToolUse[]`
   - Batch parsing of multiple tool calls
   - Maps over array, parses each call
   - Includes index in error messages

**Streaming Patterns**:

1. **Normal streaming** (AI SDK):
   ```
   { type: "tool_call_start", id: "call_123", name: "Read" }
   { type: "tool_call_delta", id: "call_123", delta: '{"path":"' }
   { type: "tool_call_delta", id: "call_123", delta: '/test' }
   { type: "tool_call_delta", id: "call_123", delta: '.txt"}' }
   { type: "tool_call_end", id: "call_123" }
   ```

2. **Incomplete streaming** (qwen3-coder):
   ```
   { type: "tool_call_start", id: "call_123", name: "Read" }
   { type: "tool_call_end", id: "call_123" }
   { type: "tool_call_complete", id: "call_123", arguments: '{"path":"/test.txt"}' }
   ```

**Edge Cases Handled**:

- Empty or missing arguments (returns `{}`)
- Invalid JSON in arguments (descriptive error with context)
- Malformed deltas (out-of-order, missing fields)
- Inconsistent tool IDs across deltas (error on mismatch)
- Multiple tool calls in single response
- Large parameters streaming across many chunks

**See**: `src/tool-response-parser.ts:55-267`

## Integration Points

### Request Flow (Claude Code → MLX Server)

1. Claude Code sends request with Anthropic tools
2. anyclaude proxy receives request
3. **Schema conversion**: Transform `tools[].input_schema` → `tools[].function.parameters`
4. Proxy sends request to MLX server with OpenAI format
5. MLX server processes request with OpenAI-compatible tools

### Response Flow (MLX Server → Claude Code)

1. MLX server returns OpenAI format response with tool_calls
2. anyclaude proxy receives response
3. **Response parsing**: Transform `tool_calls[]` → `tool_use` blocks
4. If streaming, assemble deltas into complete tool calls
5. Proxy sends Anthropic format SSE events to Claude Code
6. Claude Code displays tool results

## Testing Strategy

**Phase 1.2 uses Test-Driven Development (TDD)** - tests written first, implementation follows

### Unit Tests (18 tests)

**File**: `tests/unit/test-tool-schema-conversion.js`

Tests schema conversion without requiring a running server:

- Basic schema conversion (Read tool)
- Complex schemas with nested objects (Write tool)
- Array types (Bash with arguments)
- Union types (oneOf, anyOf)
- Empty schema (no parameters)
- Batch conversion (multiple tools)
- Invalid schema rejection
- Additional metadata handling

**File**: `tests/unit/test-tool-response-parsing.js`

Tests response parsing without server:

- Parse complete tool call
- Parse complex arguments (nested objects)
- Parse multiple tool calls
- Handle malformed JSON
- Assemble streaming tool call
- Handle incomplete streaming (qwen3 pattern)
- Handle out-of-order chunks
- Empty arguments
- Tool call ID validation
- Parameter validation

### Integration Tests (35 tests)

**Files**: `tests/integration/test-mlx-server-*.js`

Tests with running MLX server:

- **basic-tools.js**: Read, Write, Bash tool calls
- **streaming-tools.js**: Streaming parameter assembly
- **multiple-tools.js**: Sequential and parallel calls
- **tool-errors.js**: Error handling, edge cases
- **large-responses.js**: Large content (10KB-100KB)

### Manual Testing

**File**: `tests/manual/test-mlx-server-interactive.sh`

Interactive menu-driven testing:
- Start/stop MLX server
- Run basic tool tests
- Check streaming output
- View server logs

## Error Handling

### Schema Validation

- Missing or empty name
- Missing input_schema
- Invalid schema type
- Non-array tool input

### Response Validation

- Missing tool ID or name
- Invalid JSON in arguments
- Inconsistent tool IDs in deltas
- Invalid delta types
- Missing function field

### Stream Assembly

- Empty deltas array
- Out-of-order chunks
- Incomplete streaming (graceful handling)
- Malformed JSON (context in error message)

All errors include:
- Clear description of what went wrong
- Context (tool name, ID, field name)
- Expected vs actual values
- Suggestion for fix when applicable

## Future Enhancements

- [ ] Performance optimization for large schemas
- [ ] Caching of converted schemas
- [ ] Support for additional streaming patterns
- [ ] Metrics collection (conversion times, error rates)
- [ ] Configuration for streaming chunk size
- [ ] Custom error handling callbacks

## See Also

- `tests/TEST-PLAN-PHASE-1.2.md` - Complete test plan
- `tests/TEST-ARTIFACTS-PHASE-1.2.md` - Test results and artifacts
- `CLAUDE.md` - Project setup and architecture overview
- `PROJECT.md` - Deep-dive project documentation
