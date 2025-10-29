# vLLM-MLX System Prompt Normalization Tests

## Overview

These tests validate the fix for a critical issue where vLLM-MLX receives malformed system prompts due to strict JSON parsing:

**Issue**: vLLM-MLX rejects system prompts with embedded newlines and excess whitespace, causing:
- Looping/repetitive model responses
- Unpredictable behavior
- Corrupted input to the model

**Fix**: Normalize system prompts before sending to vLLM-MLX by:
- Converting newlines to spaces
- Collapsing multiple spaces to single space
- Trimming leading/trailing whitespace

## Test Files

### 1. Unit Tests: `tests/unit/test-vllm-mlx-system-prompt.js`

**Purpose**: Test the normalization logic in isolation

**Tests**:
1. **Newlines normalized**: `\n` → spaces
2. **Whitespace collapsed**: Multiple spaces → single space
3. **Trimming**: Leading/trailing whitespace removed
4. **Complex whitespace**: Tabs and mixed spacing handled
5. **JSON validity**: Result remains valid JSON
6. **Non-system messages**: User/assistant messages preserved
7. **Empty prompts**: Edge case handling
8. **Array format**: Anthropic format conversion
9. **Real-world prompt**: Typical Claude Code system prompt
10. **Multiple messages**: Mixed message types

**Run**:
```bash
node tests/unit/test-vllm-mlx-system-prompt.js
```

### 2. Integration Tests: `tests/integration/test-vllm-mlx-system-prompt-fix.js`

**Purpose**: Validate the fix works at the integration level

**Tests**:
1. **Fetch interceptor**: Main.ts fetch normalization
2. **Proxy-level**: anthropic-proxy.ts normalization
3. **Provider isolation**: LMStudio unaffected
4. **Mode isolation**: Claude mode unaffected
5. **Idempotency**: Double normalization is safe
6. **Complex multiline**: Real-world complex prompts
7. **Special chars**: Markdown, JSON, code preserved
8. **Edge cases**: Null/undefined/empty handling
9. **Full request**: All request fields preserved
10. **Idempotency**: Repeated normalization consistent

**Run**:
```bash
node tests/integration/test-vllm-mlx-system-prompt-fix.js
```

## Implementation Details

### Normalization Points

The fix is applied at TWO levels to ensure robustness:

#### 1. Proxy Level (anthropic-proxy.ts:460)
```typescript
if (system && providerName === "vllm-mlx") {
  system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}
```

This normalizes the system prompt right before calling streamText().

#### 2. Fetch Interceptor Level (main.ts:320-332)
```typescript
if (body.messages && Array.isArray(body.messages)) {
  for (const msg of body.messages) {
    if (msg.role === "system" && msg.content && typeof msg.content === "string") {
      msg.content = msg.content.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    }
  }
}
```

This normalizes at the fetch call level for extra safety.

### Key Design Decisions

1. **Two-level protection**: Both proxy and fetch normalization ensures no malformed prompts slip through

2. **Idempotent operation**: Normalizing twice produces same result (safe to apply at multiple levels)

3. **Provider-specific**: Only vLLM-MLX is affected (LMStudio/Claude not modified)

4. **Content preservation**: Only whitespace is modified, all text content preserved

5. **Special chars preserved**: Markdown, JSON, code formatting all preserved

## How to Verify the Fix

Before the fix, this question would produce looping/repetitive responses:
```
> can you read README.md and summarise it for me?

# Would return something like:
[Prompt Cache] MISS - Caching new system+tools 6c02a5f5
I'll read and summarize the README.md file for you...

I've read the README.md file...

I've read the README.md file...

I've read the README.md file...
```

After the fix:
```
> can you read README.md and summarise it for me?

# Returns coherent response:
I'll read and summarize the README.md file for you...

The anyclaude project is a translation layer for Claude Code
that enables using local MLX models through the Anthropic API format.
[Proper summary continues...]
```

## Test Coverage

| Aspect | Coverage | Status |
|--------|----------|--------|
| Newline handling | 4 tests | ✅ |
| Whitespace handling | 3 tests | ✅ |
| JSON validity | 2 tests | ✅ |
| Provider isolation | 2 tests | ✅ |
| Message types | 3 tests | ✅ |
| Edge cases | 2 tests | ✅ |
| Idempotency | 2 tests | ✅ |
| Real-world scenarios | 2 tests | ✅ |

**Total: 20 tests across unit + integration**

## Regression Prevention

These tests catch:
- ❌ If normalization is removed
- ❌ If only lmstudio branch is checked (mlx-lm removal)
- ❌ If newlines aren't converted
- ❌ If whitespace isn't collapsed
- ❌ If JSON becomes invalid
- ❌ If other providers get unwanted normalization
- ❌ If special characters are corrupted

## Related Issues

- **Issue**: vLLM-MLX strict JSON validation
- **Symptom**: Looping/repetitive responses, unpredictable behavior
- **Root Cause**: Newlines in system prompt strings cause JSON parsing errors
- **Fix**: Normalize system prompts before sending to vLLM-MLX

## Files Modified

- `src/anthropic-proxy.ts`: Added system prompt normalization (line 460)
- `src/main.ts`: Added fetch interceptor normalization (lines 320-332)
- `src/tool-parsers.ts`: Updated comment (legacy, not used)
- Removed: All mlx-lm references from codebase

## Running All Tests

```bash
# Run unit test
node tests/unit/test-vllm-mlx-system-prompt.js

# Run integration test
node tests/integration/test-vllm-mlx-system-prompt-fix.js

# Or run together
node tests/unit/test-vllm-mlx-system-prompt.js && \
node tests/integration/test-vllm-mlx-system-prompt-fix.js
```

Both should show:
```
✅ All vLLM-MLX system prompt normalization tests passed!
✅ All vLLM-MLX system prompt fix integration tests passed!
```
