# Backend Client Tests - TDD Red Phase Summary

**Issue**: #39 - Auto-detect model context length from MLX worker

**Test File**: `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/test_backend_client.js`

## Test Status

**Total Tests**: 26
**Passing**: 18 (infrastructure tests)
**Failing**: 8 (expected - TDD red phase)

## Test Coverage

### 1. Constructor Tests (2 tests - PASSING)

- ✓ Creates client instance correctly
- ✓ Strips `/v1` suffix from base URL

### 2. getModels() Tests (2 tests - PASSING)

- ✓ Returns correct structure on success
- ✓ Handles API errors correctly

### 3. getFirstModel() Tests (3 tests - PASSING)

- ✓ Returns first model from array
- ✓ Returns null for empty array
- ✓ Returns null on API error

### 4. getModelInfo() - MLX Context Length Support (8 tests)

**Core Functionality** (2 tests - FAILING ❌):

- ❌ Extracts `context_length` from MLX response (expects 8192, got null)
- ❌ Handles large context values (expects 131072, got null)

**Validation** (6 tests - PASSING):

- ✓ Returns null when `context_length` missing
- ✓ Returns null for string `context_length`
- ✓ Returns null for zero `context_length`
- ✓ Returns null for negative `context_length`
- ✓ Returns null for NaN `context_length`
- ✓ Returns null for empty data array

### 5. LMStudio Compatibility (2 tests - FAILING ❌)

- ❌ Extracts `loaded_context_length` (expects 32768, got null)
- ❌ Falls back to `max_context_length` (expects 8192, got null)

### 6. Priority Order Tests (3 tests - FAILING ❌)

- ❌ Prioritizes `loaded_context_length` > `context_length` (expects 16384, got null)
- ❌ Prioritizes `context_length` > `max_context_length` (expects 8192, got null)
- ❌ Correct priority with all three fields (expects 16384, got null)

### 7. Edge Cases (4 tests - PASSING)

- ✓ Handles null `context_length`
- ✓ Handles undefined `context_length`
- ✓ Handles fractional `context_length`
- ✓ Returns null for Infinity `context_length`

### 8. Integration Tests (2 tests)

- ❌ Realistic MLX response (expects 32768, got null)
- ✓ OpenAI-style response (no context field)

## Expected Behavior

The implementation should extract context length with this priority:

1. `loaded_context_length` (LMStudio specific)
2. `context_length` (MLX specific)
3. `max_context_length` (fallback)
4. `null` (if none available or invalid)

### Validation Rules

Context length must be:

- A number (not string)
- Greater than zero
- Not NaN
- Not Infinity

## Implementation Requirements

**File**: `/Users/andrewkaszubski/Dev/anyclaude/src/backend-client.ts`

**Interface Update**:

```typescript
export interface BackendModelInfo {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  context_length?: number; // Add MLX support
  loaded_context_length?: number; // Add LMStudio support
  max_context_length?: number; // Add fallback support
}
```

**Method Update**:

```typescript
async getModelInfo(): Promise<{
  name: string;
  context: number | null;
} | null> {
  const model = await this.getFirstModel();
  if (!model) return null;

  // Extract context with priority:
  // 1. loaded_context_length (LMStudio)
  // 2. context_length (MLX)
  // 3. max_context_length (fallback)
  let context: number | null = null;

  const potentialContext =
    model.loaded_context_length ||
    model.context_length ||
    model.max_context_length;

  // Validate: must be a positive number
  if (
    typeof potentialContext === "number" &&
    potentialContext > 0 &&
    isFinite(potentialContext)
  ) {
    context = potentialContext;
  }

  return {
    name: model.id,
    context,
  };
}
```

## Sample Responses

### MLX Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
      "object": "model",
      "created": 1704067200,
      "owned_by": "mlx-community",
      "context_length": 32768
    }
  ]
}
```

### LMStudio Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "lmstudio-model",
      "object": "model",
      "loaded_context_length": 32768,
      "max_context_length": 131072
    }
  ]
}
```

### OpenAI Response (no context)

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    }
  ]
}
```

## Running Tests

```bash
# Build project
bun run build

# Run backend client tests
node tests/unit/test_backend_client.js

# Run all tests (includes backend client tests)
npm test
```

## Next Steps

1. **Implementation Phase**: Update `src/backend-client.ts` with the logic above
2. **Verification**: Run tests to ensure all 26 tests pass
3. **Integration**: Verify MLX worker integration works end-to-end
4. **Documentation**: Update CHANGELOG.md with new feature

## Test Design Notes

- Uses standard Node.js `assert` module (consistent with project)
- Mock `fetch` API for isolated unit tests
- Comprehensive edge case coverage (NaN, Infinity, negative, etc.)
- LMStudio backward compatibility preserved
- Priority order thoroughly tested
- Realistic response examples included

---

**Test Author**: test-master agent
**Test Creation Date**: 2026-01-02
**TDD Phase**: RED (8 tests failing as expected)
**Coverage**: 26 tests covering all scenarios
