# Test-Driven Development (TDD) Guide

**How to write tests for anyclaude following TDD principles.**

---

## Philosophy

**"Write tests first, then code to make them pass."**

This project follows TDD to ensure:
- Bug fixes are verified and won't regress
- New features are testable from the start
- Code is designed for testability
- Documentation through tests (tests show how code should work)

---

## TDD Workflow

### 1. **Red** - Write a failing test

```javascript
// tests/unit/test_new_feature.js
function test_new_feature_handles_edge_case() {
  console.log("Testing: New feature edge case...");

  const result = myNewFeature({ edge: "case" });

  assert.strictEqual(result.status, "success", "Should handle edge case");

  console.log("✓ Edge case handled");
}
```

**Run the test** - it should FAIL (feature doesn't exist yet):
```bash
node tests/unit/test_new_feature.js
# ❌ Expected: 'success', got: undefined
```

### 2. **Green** - Write minimal code to pass

```javascript
// src/new-feature.ts
export function myNewFeature(input: any) {
  if (input.edge === "case") {
    return { status: "success" };
  }
  return { status: "unknown" };
}
```

**Run the test again**:
```bash
node tests/unit/test_new_feature.js
# ✓ Edge case handled
```

### 3. **Refactor** - Improve code while keeping tests green

```javascript
// src/new-feature.ts
interface Input {
  edge?: string;
}

export function myNewFeature(input: Input): { status: string } {
  return {
    status: input.edge === "case" ? "success" : "unknown",
  };
}
```

**Run tests again** - should still pass:
```bash
npm test
# ✓ All tests passing
```

---

## Test Patterns Used

### Pattern 1: Unit Tests with Fixtures

See `tests/unit/test_trace_analyzer.js` for example.

**Structure:**
1. Create test fixtures (sample data)
2. Write individual test functions
3. Run all tests in `runTests()`
4. Export for test runner

```javascript
const assert = require("assert");

// Test fixtures
function setupTestFixtures() {
  // Create test data files
}

function cleanupTestFixtures() {
  // Clean up after tests
}

// Individual test
function test_something() {
  console.log("Testing: Something...");

  const result = doSomething();

  assert.ok(result, "Result should exist");
  assert.strictEqual(result.value, 42, "Value should be 42");

  console.log("✓ Something works");
}

// Test runner
function runTests() {
  console.log("=".repeat(80));
  console.log("MY FEATURE TESTS");
  console.log("=".repeat(80));

  try {
    setupTestFixtures();

    test_something();
    test_another_thing();

    console.log("✓ ALL TESTS PASSED");
    return 0;
  } catch (error) {
    console.error("✗ TEST FAILED");
    console.error(error);
    return 1;
  } finally {
    cleanupTestFixtures();
  }
}

if (require.main === module) {
  process.exit(runTests());
}

module.exports = { runTests };
```

### Pattern 2: Mocking External APIs

See `tests/unit/test_lmstudio_client.js` for example.

```javascript
// Save original fetch
global.originalFetch = global.fetch;

// Mock fetch for testing
function mockFetchSuccess(data) {
  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => data,
    };
  };
}

// Restore after test
function restoreFetch() {
  global.fetch = global.originalFetch;
}

async function test_api_call() {
  const mockData = { result: "success" };
  mockFetchSuccess(mockData);

  const client = new MyClient();
  const result = await client.fetchData();

  assert.strictEqual(result.result, "success");

  restoreFetch();
  console.log("✓ API call works");
}
```

### Pattern 3: Testing State Machines

See `tests/unit/test_tool_calling.js` for example.

```javascript
class StateMachine {
  constructor() {
    this.state = "initial";
  }

  transition(event) {
    // State transition logic
  }
}

function test_state_transitions() {
  const machine = new StateMachine();

  // Test initial state
  assert.strictEqual(machine.state, "initial");

  // Test transition
  machine.transition("start");
  assert.strictEqual(machine.state, "started");

  // Test invalid transition
  machine.transition("invalid");
  assert.strictEqual(machine.state, "started", "Should ignore invalid");

  console.log("✓ State transitions work");
}
```

---

## Adding Tests to the Suite

### 1. Create the test file

```bash
touch tests/unit/test_my_feature.js
```

### 2. Write the test (following Pattern 1 above)

### 3. Add to test runner

Edit `tests/run_all_tests.js`:

```javascript
const tests = [
  // ... existing tests
  {
    file: path.join(__dirname, "unit", "test_my_feature.js"),
    description: "My Feature Unit Tests",
  },
];
```

### 4. Run all tests

```bash
npm test
```

---

## What to Test

### ✅ Unit/Integration Tests (Traditional)

**Use traditional tests for:**

**Bug fixes:**
- Write a test that reproduces the bug
- Fix the bug
- Test should now pass
- Bug can never come back (regression protection)

**Edge cases:**
- Empty input
- Null/undefined
- Very large input
- Invalid types
- Out-of-order events

**Public APIs:**
- All exported functions
- All class methods
- Error handling
- Return values

**Critical logic:**
- Tool calling (incomplete streaming, deduplication)
- Message format conversion
- Token counting
- API parameter mapping

### ✅ GenAI Tests (When Necessary)

**Use GenAI testing for:**

**Semantic correctness:**
- "Does the model understand the user's intent?"
- "Is the tool calling prompt clear enough?"
- "Does the system prompt guide behavior correctly?"

**End-to-end workflows:**
- "Can the model complete a multi-step coding task?"
- "Does Read → Edit → Write workflow succeed?"
- "Are error messages helpful to users?"

**Model-specific quirks:**
- "Does qwen3-coder handle streaming correctly in practice?"
- "Do different models interpret the same schema differently?"
- "Is the token overhead acceptable for this model?"

**Natural language interactions:**
- "Does the user get helpful responses?"
- "Are error messages clear and actionable?"
- "Does the context window warning trigger appropriately?"

**Examples:**
- `tests/genai/test_tool_calling_real_models.js` - Test actual LMStudio models
- `tests/genai/test_user_experience.js` - Validate UX with real prompts
- `tests/genai/test_model_compatibility.js` - Check model-specific behaviors

### ❌ Don't Test (Neither Traditional nor GenAI)

**Implementation details:**
- Private helper functions (test through public API)
- Internal data structures
- Third-party libraries (assume they work)

**Simple pass-through code:**
```javascript
// Don't test this
export function getId() {
  return this.id;
}
```

**Things better tested manually:**
- CLI output formatting (visual inspection)
- Installation process (manual verification)

---

## Example: TDD for a New Feature

**Feature**: Add support for Claude 3 Opus model detection

### Step 1: Write the test first (RED)

```javascript
// tests/unit/test_model_detection.js
function test_detect_claude_opus() {
  console.log("Testing: Claude Opus detection...");

  const model = detectModel("claude-3-opus-20240229");

  assert.strictEqual(model.family, "claude-3");
  assert.strictEqual(model.size, "opus");
  assert.strictEqual(model.capabilities.vision, true);

  console.log("✓ Claude Opus detected correctly");
}
```

**Run it** - should FAIL:
```bash
node tests/unit/test_model_detection.js
# ❌ TypeError: detectModel is not defined
```

### Step 2: Write minimal code (GREEN)

```typescript
// src/model-detection.ts
export function detectModel(modelId: string) {
  if (modelId.includes("claude-3-opus")) {
    return {
      family: "claude-3",
      size: "opus",
      capabilities: { vision: true },
    };
  }
  return { family: "unknown", size: "unknown", capabilities: {} };
}
```

**Run it** - should PASS:
```bash
node tests/unit/test_model_detection.js
# ✓ Claude Opus detected correctly
```

### Step 3: Add more tests for edge cases

```javascript
function test_detect_claude_sonnet() {
  const model = detectModel("claude-3-5-sonnet-20241022");
  assert.strictEqual(model.family, "claude-3");
  assert.strictEqual(model.size, "sonnet");
  console.log("✓ Claude Sonnet detected");
}

function test_detect_unknown_model() {
  const model = detectModel("unknown-model");
  assert.strictEqual(model.family, "unknown");
  console.log("✓ Unknown model handled");
}
```

### Step 4: Refactor with confidence

```typescript
// src/model-detection.ts
interface ModelInfo {
  family: string;
  size: string;
  capabilities: {
    vision?: boolean;
    toolUse?: boolean;
  };
}

const MODEL_PATTERNS: Record<string, ModelInfo> = {
  "claude-3-opus": {
    family: "claude-3",
    size: "opus",
    capabilities: { vision: true, toolUse: true },
  },
  "claude-3-5-sonnet": {
    family: "claude-3",
    size: "sonnet",
    capabilities: { vision: true, toolUse: true },
  },
};

export function detectModel(modelId: string): ModelInfo {
  for (const [pattern, info] of Object.entries(MODEL_PATTERNS)) {
    if (modelId.includes(pattern)) {
      return info;
    }
  }
  return {
    family: "unknown",
    size: "unknown",
    capabilities: {}
  };
}
```

**Run all tests** - should still PASS:
```bash
npm test
# ✓ All tests passing
```

---

## Real-World Example: qwen3-coder Tool Calling Bug

### The Bug

qwen3-coder-30b sends incomplete streaming:
- `tool-input-start` → `tool-input-end` (NO `tool-input-delta`)
- Later sends `tool-call` with complete input

### TDD Approach

**1. Write test that reproduces the bug:**

```javascript
// tests/unit/test_tool_calling.js
function test_incomplete_streaming_qwen3_coder() {
  const tracker = new ToolCallTracker();

  // Start
  tracker.handleToolInputStart(createToolInputStartChunk("call_456", "Read", 0));

  // End WITHOUT any deltas
  const end = tracker.handleToolInputEnd(createToolInputEndChunk("call_456"));
  assert.strictEqual(end, null, "Should not close block yet");

  // Tool should still be tracked
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 1);

  // Later: tool-call chunk arrives
  const toolCall = tracker.handleToolCall(
    createToolCallChunk("call_456", "Read", { file_path: "/README.md" })
  );

  assert.ok(toolCall, "Should emit tool call");
  assert.strictEqual(tracker.toolsWithoutDeltas.size, 0, "Should be completed");

  console.log("✓ Incomplete streaming handled");
}
```

**2. Run test - FAILS** (bug exists)

**3. Fix the code:**

```typescript
// src/convert-to-anthropic-stream.ts
const toolsWithoutDeltas = new Map<string, { index: number; name: string }>();

// Track tools without deltas
handleToolInputStart(chunk) {
  this.toolsWithoutDeltas.set(id, { index, name });
  // ...
}

// Don't close block if no deltas received
handleToolInputEnd(chunk) {
  if (!this.currentStreamingTool.receivedDelta) {
    return null; // Wait for tool-call chunk
  }
  // ...
}

// Complete tool when tool-call arrives
handleToolCall(chunk) {
  if (this.toolsWithoutDeltas.has(toolCallId)) {
    const toolInfo = this.toolsWithoutDeltas.get(toolCallId);
    this.toolsWithoutDeltas.delete(toolCallId);
    return completeToolBlock(toolInfo, args);
  }
}
```

**4. Run test - PASSES** (bug fixed)

**5. The bug can never come back** - test will catch it immediately

---

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
node tests/unit/test_tool_calling.js
```

### Run only unit tests
```bash
npm run test:unit
```

### Run only regression tests
```bash
npm run test:regression
```

---

## Test Organization

```
tests/
├── unit/                           # Unit tests (fast, isolated)
│   ├── test_trace_analyzer.js      # Trace analysis logic
│   ├── test_lmstudio_client.js     # LMStudio API client
│   ├── test_tool_calling.js        # Tool calling edge cases
│   ├── test_trace_logger.js        # Trace file operations
│   └── test_json_schema.js         # Schema transformations
│
├── regression/                     # Regression tests (prevent bugs returning)
│   └── test_structure_regression.js
│
├── fixtures/                       # Test data files
│   └── traces/
│       ├── valid-with-tools.json
│       └── old-broken-format.json
│
├── manual/                         # Manual/integration tests (slow)
│   └── test_lmstudio_raw.js
│
└── run_all_tests.js                # Test runner
```

---

## Best Practices

### ✅ DO

- **Write tests first** (TDD)
- **Test one thing per test function**
- **Use descriptive test names**: `test_incomplete_streaming_qwen3_coder()`
- **Include edge cases**: null, empty, invalid input
- **Clean up after tests**: delete temp files, restore mocks
- **Use assertions liberally**: multiple asserts per test are OK
- **Add helpful console output**: "Testing: Incomplete streaming..."

### ❌ DON'T

- **Don't test implementation details** (test behavior, not code)
- **Don't skip cleanup** (use try/finally)
- **Don't rely on test order** (each test should be independent)
- **Don't mock too much** (makes tests brittle)
- **Don't test external libraries** (trust they work)
- **Don't commit failing tests** (fix or comment out with TODO)

---

## Debugging Failing Tests

### 1. Read the error message carefully

```bash
AssertionError [ERR_ASSERTION]: Should handle edge case
+ actual - expected

+ undefined
- 'success'
```

**Translation**: Expected `'success'`, got `undefined`

### 2. Add console.log debugging

```javascript
function test_something() {
  const result = doSomething({ edge: "case" });

  console.log("DEBUG: result =", result); // Add this

  assert.strictEqual(result.status, "success");
}
```

### 3. Run just that test

```bash
node tests/unit/test_my_feature.js
```

### 4. Check test fixtures

```bash
ls -la tests/fixtures/
cat tests/fixtures/test-data.json
```

### 5. Verify mocks are working

```javascript
function test_api_call() {
  mockFetchSuccess({ result: "success" });

  // Verify mock was called
  const result = await client.fetchData();
  console.log("Mock returned:", result);

  assert.ok(result, "Mock should return data");
}
```

---

## Contributing Tests

When submitting a PR:

1. **Include tests for your changes**
   - Bug fix? Add a test that would have caught the bug
   - New feature? Add tests for the feature

2. **Ensure all tests pass**
   ```bash
   npm test
   ```

3. **Follow existing test patterns**
   - Look at `tests/unit/test_tool_calling.js` for examples
   - Use same assertion style
   - Similar output formatting

4. **Update test runner if needed**
   - Add your test to `tests/run_all_tests.js`

---

## Further Reading

- **TDD Philosophy**: [Test-Driven Development by Kent Beck](https://www.amazon.com/Test-Driven-Development-Kent-Beck/dp/0321146530)
- **Testing Patterns**: `tests/unit/test_tool_calling.js` (real-world example)
- **Node.js Assert**: [Node.js Assert Documentation](https://nodejs.org/api/assert.html)
- **Mocking**: `tests/unit/test_lmstudio_client.js` (API mocking example)

---

## Questions?

See existing tests for patterns:
- **Fixtures**: `tests/unit/test_trace_analyzer.js`
- **Mocking**: `tests/unit/test_lmstudio_client.js`
- **State machines**: `tests/unit/test_tool_calling.js`
- **File operations**: `tests/unit/test_trace_logger.js`

**When in doubt, write a test!**
