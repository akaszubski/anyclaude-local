# Test Plan: Phase 1.2 - Tool Calling Verification

**Status**: RED (TDD Red Phase - Tests written, implementation pending)
**Date**: 2025-11-17
**Target**: Custom MLX Server Tool Calling

## Overview

This test plan validates that the custom MLX server (`scripts/mlx-server.py`) can correctly handle tool calling for Claude Code. Tests are written FIRST (TDD red phase) and should initially FAIL until implementation is complete.

## Test Coverage Target

- **Target**: 80%+ coverage of tool calling functionality
- **Focus Areas**:
  - Schema conversion (Anthropic ↔ OpenAI formats)
  - Tool response parsing (streaming and complete)
  - Integration with MLX server
  - Error handling and edge cases
  - Large responses and performance

## Test Categories

### 1. Unit Tests (No Server Required)

Fast tests that validate conversion logic without needing a running server.

#### 1.1 Tool Schema Conversion

**File**: `tests/unit/test-tool-schema-conversion.js`

**Tests**:

- ✓ Basic schema conversion (Read tool)
- ✓ Complex schema with nested objects (Write tool)
- ✓ Schema with array types (Bash with arguments)
- ✓ Schema with union types (oneOf, anyOf)
- ✓ Empty schema (no parameters)
- ✓ Batch conversion (multiple tools)
- ✓ Invalid schema rejection
- ✓ Additional metadata handling

**Success Criteria**:

- All Anthropic `input_schema` correctly converted to OpenAI `parameters`
- Type preservation (string, number, object, array)
- Required fields maintained
- Invalid schemas rejected with clear errors

#### 1.2 Tool Response Parsing

**File**: `tests/unit/test-tool-response-parsing.js`

**Tests**:

- ✓ Parse complete tool call (non-streaming)
- ✓ Parse complex arguments (nested objects)
- ✓ Parse multiple tool calls
- ✓ Handle malformed JSON
- ✓ Assemble streaming tool call from deltas
- ✓ Handle incomplete streaming (qwen3-coder pattern)
- ✓ Handle out-of-order chunks
- ✓ Empty arguments
- ✓ Tool call ID validation
- ✓ Parameter validation

**Success Criteria**:

- OpenAI `tool_calls` correctly converted to Anthropic `tool_use`
- Streaming deltas assembled into complete JSON
- Malformed JSON rejected gracefully
- Edge cases handled (no deltas, out-of-order, etc.)

### 2. Integration Tests (Require Running Server)

Tests that validate end-to-end tool calling with the actual MLX server.

#### 2.1 Basic Tool Calls

**File**: `tests/integration/test-mlx-server-basic-tools.js`

**Tests**:

- ✓ Read tool - request to read a file
- ✓ Write tool - request to write content
- ✓ Bash tool - safe command execution
- ✓ Tool selection - model chooses correct tool
- ✓ No tools needed - simple question without tool use

**Success Criteria**:

- Model calls Read, Write, Bash tools correctly
- Tool parameters match request intent
- Model selects appropriate tool from available options
- Model responds without tools when not needed

**Prerequisites**:

- MLX server running on port 8081
- Model loaded with tool calling support

#### 2.2 Streaming Tool Calls

**File**: `tests/integration/test-mlx-server-streaming-tools.js`

**Tests**:

- ✓ Basic streaming tool call
- ✓ Streaming with complex JSON
- ✓ Large parameter streaming (multiple chunks)
- ✓ Stream event ordering (start → deltas → stop)
- ✓ Handle incomplete streaming (no deltas)
- ✓ Stream error handling

**Success Criteria**:

- Tool parameters assembled correctly from streaming chunks
- Events arrive in correct order
- Large parameters streamed without truncation
- Incomplete streaming handled gracefully

#### 2.3 Multiple Tool Calls

**File**: `tests/integration/test-mlx-server-multiple-tools.js`

**Tests**:

- ✓ Parallel tool calls (multiple tools in one response)
- ✓ Sequential tool calls (multi-turn conversation)
- ✓ Mixed tool types (different tools in same request)
- ✓ Tool chaining (use result from first in second)
- ✓ Multiple tool results in conversation
- ✓ Tool call limit (prevent infinite loops)

**Success Criteria**:

- Model can call multiple tools in parallel
- Multi-turn conversations maintain context
- Tool results correctly incorporated in follow-up
- Turn limit prevents runaway loops

#### 2.4 Error Handling

**File**: `tests/integration/test-mlx-server-tool-errors.js`

**Tests**:

- ✓ Invalid tool name (non-existent tool)
- ✓ Missing required parameters
- ✓ Malformed tool schema
- ✓ Server timeout handling
- ✓ Empty tool array
- ✓ Null/undefined in parameters
- ✓ Large error messages
- ✓ Invalid JSON in arguments
- ✓ Rapid successive requests
- ✓ Server not running (connection refused)

**Success Criteria**:

- Invalid requests rejected with clear errors
- Server handles edge cases gracefully
- Connection errors handled without crashes
- Rapid requests don't overload server

#### 2.5 Large Responses

**File**: `tests/integration/test-mlx-server-large-responses.js`

**Tests**:

- ✓ Medium file content (10KB)
- ✓ Large file content (100KB)
- ✓ Deep nested JSON structure
- ✓ Long command output
- ✓ Streaming large parameters
- ✓ Multiple large tool calls
- ✓ Array parameters with many items
- ✓ Unicode and special characters

**Success Criteria**:

- Large content (up to 100KB) handled without truncation
- Nested JSON structures parsed correctly
- Streaming doesn't break with large content
- Unicode characters preserved

### 3. Manual Testing

#### 3.1 Interactive Test Script

**File**: `tests/manual/test-mlx-server-interactive.sh`

**Features**:

- Menu-driven interface
- Start/stop server
- Test individual tools (Read, Write, Bash)
- Test streaming
- View server logs
- Check server health

**Usage**:

```bash
export MLX_MODEL_PATH=/path/to/your/mlx/model
./tests/manual/test-mlx-server-interactive.sh
```

## Running Tests

### Prerequisites

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start MLX server** (for integration tests):
   ```bash
   python3 scripts/mlx-server.py --model /path/to/model --port 8081
   ```

### Run Unit Tests Only

```bash
node tests/unit/test-tool-schema-conversion.js
node tests/unit/test-tool-response-parsing.js
```

### Run Integration Tests

```bash
# Ensure server is running first!
export MLX_SERVER_URL=http://localhost:8081

node tests/integration/test-mlx-server-basic-tools.js
node tests/integration/test-mlx-server-streaming-tools.js
node tests/integration/test-mlx-server-multiple-tools.js
node tests/integration/test-mlx-server-tool-errors.js
node tests/integration/test-mlx-server-large-responses.js
```

### Run All Tests

```bash
npm run test:phase1.2
```

### Manual Testing

```bash
export MLX_MODEL_PATH=/path/to/model
chmod +x tests/manual/test-mlx-server-interactive.sh
./tests/manual/test-mlx-server-interactive.sh
```

## Expected Results (TDD Red Phase)

### Unit Tests

- ❌ **FAIL**: `convertAnthropicToolToOpenAI` not implemented
- ❌ **FAIL**: `parseOpenAIToolCall` not implemented
- ❌ **FAIL**: `assembleStreamingToolCall` not implemented

**Expected**: All unit tests fail with "not implemented" errors

### Integration Tests

- ⚠️ **SKIP**: Server not running (if not started)
- ❌ **FAIL**: Tool calling not working (if server doesn't support tools yet)
- ❌ **FAIL**: Streaming tool calls incomplete

**Expected**: Integration tests fail or skip until server implements tool calling

## Success Metrics

After implementation (TDD Green Phase):

- ✅ **Unit Tests**: 16/16 passing (100%)
- ✅ **Integration Tests**:
  - Basic: 5/5 passing
  - Streaming: 6/6 passing
  - Multiple: 6/6 passing
  - Errors: 10/10 passing
  - Large: 8/8 passing
- ✅ **Total**: 51/51 tests passing (100%)

## Security Considerations

All tests follow security best practices:

- ✓ **File operations**: Only in `/tmp` directory
- ✓ **Bash commands**: Safe commands only (echo, pwd, date)
- ✓ **No destructive operations**: No rm -rf, no sudo
- ✓ **Isolated environment**: Tests don't affect production files

## Next Steps

1. **Implement missing functions**:
   - `src/tool-schema-converter.ts`
   - `src/tool-response-parser.ts`

2. **Verify server tool support**:
   - Check `scripts/mlx-server.py` tool calling implementation
   - Test with actual model

3. **Run tests → GREEN**:
   - Fix failures one by one
   - Achieve 80%+ pass rate

4. **Document results**:
   - Update `TEST-ARTIFACTS-PHASE-1.2.md`
   - Record metrics and findings

## Related Documentation

- **Implementation Plan**: `docs/development/optimum-implementation-plan.md`
- **Test Artifacts**: `tests/TEST-ARTIFACTS-PHASE-1.2.md` (to be created)
- **Testing Guide**: `docs/development/testing-guide.md`
- **MLX Server**: `scripts/mlx-server.py`

## Notes

- This is a **TDD red phase** - tests SHOULD fail initially
- Tests validate behavior BEFORE implementation exists
- Use test failures to guide implementation
- Aim for 80%+ coverage before moving to Phase 1.3
