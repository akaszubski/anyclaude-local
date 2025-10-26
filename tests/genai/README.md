# GenAI Tests

**Real-world testing with actual LMStudio models.**

---

## What Are GenAI Tests?

GenAI tests verify behavior that can only be tested with real models running in LMStudio:

- **Semantic correctness** - Does the model understand what to do?
- **Real model behavior** - How does qwen3-coder actually perform?
- **User experience** - Are responses helpful and clear?
- **End-to-end workflows** - Can the model complete multi-step tasks?

**These are NOT traditional unit tests** - they're slow, require LMStudio, and test semantics rather than logic.

---

## Directory Structure

```
tests/genai/
├── framework/
│   └── lmstudio-harness.js         # Testing utilities
│
├── model-compatibility/
│   └── test_basic_completion.js    # Smoke tests for any model
│
├── user-experience/
│   └── (future: error message quality tests)
│
├── semantic-correctness/
│   └── (future: tool description clarity tests)
│
├── workflows/
│   └── (future: multi-step coding task tests)
│
└── README.md                        # This file
```

---

## Running GenAI Tests

### Prerequisites

1. **LMStudio must be running**
   ```bash
   # Start LMStudio server (default: http://localhost:1234)
   ```

2. **A model must be loaded**
   - Load any model in LMStudio (e.g., qwen3-coder-30b, llama-3.1-8b)
   - The tests will use whatever model is currently loaded

### Run Tests

```bash
# Run a specific test file
node tests/genai/model-compatibility/test_basic_completion.js

# With custom LMStudio URL
LMSTUDIO_URL=http://localhost:5678/v1 node tests/genai/model-compatibility/test_basic_completion.js
```

### Expected Output

```
================================================================================
GENAI: BASIC COMPLETION TESTS
================================================================================

These tests verify the loaded model can:
  - Complete simple text generation
  - Generate multi-sentence responses
  - Follow basic instructions

Testing: Basic text completion...
   Model: qwen3-coder-30b-a3b-instruct-mlx
   Context: 262144 tokens
   Response: "Hello, World!"
   Timing: 2543ms
✓ Basic text completion passed

Testing: Multi-sentence completion...
   Model: qwen3-coder-30b-a3b-instruct-mlx
   Context: 262144 tokens
   Response length: 156 chars
   Timing: 4821ms
✓ Multi-sentence completion passed

Testing: Model follows instructions...
   Model: qwen3-coder-30b-a3b-instruct-mlx
   Context: 262144 tokens
   Response had 3 lines
✓ Model follows instructions passed

================================================================================
GENAI TEST SUMMARY
================================================================================
Passed:  3
Skipped: 0
Failed:  0
================================================================================
```

### If No Model Loaded

```
Testing: Basic text completion...
⚠️  Skipped: No model loaded in LMStudio
   Suggestion: Load a model in LMStudio and try again
```

---

## Writing GenAI Tests

### Pattern: Model Compatibility Test

```javascript
const { runGenAITest, makeAnyclaudeRequest } = require("../framework/lmstudio-harness");

async function test_my_feature() {
  return await runGenAITest({
    name: "My feature test",
    testFn: async ({ lmstudioUrl, modelInfo }) => {
      // Make request
      const result = await makeAnyclaudeRequest({
        prompt: "Your test prompt here",
        lmstudioUrl,
        timeout: 30000,
      });

      // Verify behavior
      assert.ok(result.success, "Should succeed");
      assert.ok(result.response.includes("expected content"));

      // Return metrics
      return {
        metrics: {
          responseTime: result.timing.total,
        },
      };
    },
  });
}
```

### Pattern: Skippable Test

```javascript
async function test_optional_feature() {
  return await runGenAITest({
    name: "Optional feature",
    skipIfNoModel: true, // Skip if LMStudio not ready
    testFn: async ({ lmstudioUrl }) => {
      // Test code...
    },
  });
}
```

### Pattern: Required Test

```javascript
async function test_critical_feature() {
  return await runGenAITest({
    name: "Critical feature",
    skipIfNoModel: false, // Fail if LMStudio not ready
    testFn: async ({ lmstudioUrl }) => {
      // Test code...
    },
  });
}
```

---

## When to Write GenAI Tests

### ✅ DO Write GenAI Tests For:

- **Model compatibility** - Does qwen3-coder work correctly?
- **Semantic behavior** - Does the model understand tool descriptions?
- **Performance validation** - Is response time acceptable?
- **User experience** - Are error messages helpful?
- **End-to-end workflows** - Can the model complete a coding task?

### ❌ DON'T Write GenAI Tests For:

- **Logic bugs** - Use traditional unit tests (fast, deterministic)
- **API contracts** - Use traditional integration tests
- **Edge cases** - Use traditional tests (null, undefined, etc.)
- **Simple string manipulation** - Too slow for GenAI testing

---

## Best Practices

### 1. Document Why It's a GenAI Test

```javascript
/**
 * GenAI Test: Tool calling with qwen3-coder
 *
 * Why GenAI test:
 * - We need to verify REAL qwen3-coder behavior, not mocked
 * - Unit tests can't capture incomplete streaming quirk
 * - We need to measure actual performance with this model
 */
```

### 2. Make Tests Skippable

```javascript
// Good: Gracefully handle missing prerequisites
return await runGenAITest({
  skipIfNoModel: true,
  // ...
});

// Bad: Crash if LMStudio not ready
const client = new LMStudioClient();
const model = await client.getModelInfo(); // Throws if not ready
```

### 3. Collect Metrics

```javascript
return {
  metrics: {
    responseTime: result.timing.total,
    tokensGenerated: result.usage?.completion_tokens,
    firstTokenTime: result.timing.firstToken,
  },
};
```

### 4. Test Semantics, Not Exact Output

```javascript
// Good: Test semantic properties
assert.ok(response.toLowerCase().includes("typescript"));

// Bad: Test exact string (flaky)
assert.strictEqual(response, "TypeScript is a typed superset...");
```

### 5. Use Reasonable Timeouts

```javascript
// Simple completion
timeout: 30000  // 30 seconds

// Multi-step task
timeout: 120000 // 2 minutes

// Complex workflow
timeout: 300000 // 5 minutes
```

---

## Running in CI/CD

### Development
- Run manually when testing model-specific changes
- Run before commits that affect prompt/schema changes

### Pre-Release
- Run full GenAI suite with representative models
- Collect and analyze metrics
- Verify no regressions

### Continuous Integration
- **Don't** run on every commit (too slow)
- **Do** run nightly builds with qwen3-coder, llama-3.1
- **Do** run before major releases

---

## Troubleshooting

### Test Skipped: No Model Loaded

```bash
# Start LMStudio
# Load a model in the UI
# Run tests again
node tests/genai/model-compatibility/test_basic_completion.js
```

### Test Failed: Timeout

```bash
# Increase timeout in test
timeout: 120000 // 2 minutes

# Or use a faster model
# Load llama-3.1-8b instead of qwen3-coder-30b
```

### Test Failed: Cannot Connect

```bash
# Check LMStudio is running
curl http://localhost:1234/v1/models

# Check custom URL
LMSTUDIO_URL=http://localhost:5678/v1 node tests/...
```

---

## Examples

### Test Files to Study

1. **test_basic_completion.js** - Start here
   - Simple smoke tests
   - Shows runGenAITest pattern
   - Demonstrates metrics collection

2. **(Future) test_tool_calling.js**
   - Model-specific tool calling
   - Performance measurement
   - Real-world qwen3-coder testing

3. **(Future) test_error_messages.js**
   - UX validation
   - Semantic quality checks
   - GenAI-assisted evaluation

---

## Contributing GenAI Tests

When adding GenAI tests:

1. **Justify why it's a GenAI test** (not traditional)
2. **Make it skippable** (handle missing prerequisites)
3. **Collect metrics** (performance data)
4. **Test semantics** (not exact strings)
5. **Document prerequisites** (which model, what setup)

See [GenAI Testing Guide](../../docs/development/genai-testing-guide.md) for complete details.

---

## Related Documentation

- **GenAI Testing Guide**: `docs/development/genai-testing-guide.md`
- **TDD Guide**: `docs/development/tdd-guide.md`
- **Model Testing**: `docs/development/model-testing.md`
- **Trace Analysis**: `docs/guides/trace-analysis-guide.md`
