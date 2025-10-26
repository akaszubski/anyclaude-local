# GenAI Testing Guide

**When and how to use GenAI-based testing instead of traditional unit/integration tests.**

---

## Philosophy

**"Use traditional tests for logic, GenAI tests for semantics and real-world behavior."**

Traditional tests verify **what** the code does.
GenAI tests verify **how well** it works with real models and users.

---

## When to Use GenAI Testing

### ✅ USE GenAI Testing When:

**1. Testing Model Behavior**
- Does qwen3-coder actually handle incomplete streaming correctly?
- Do different models interpret tool schemas the same way?
- Is the token overhead acceptable for this model size?

**2. Testing User Experience**
- Are error messages helpful and actionable?
- Does the model understand user intent?
- Do multi-step workflows complete successfully?

**3. Testing Semantic Correctness**
- Does the system prompt guide the model correctly?
- Are tool descriptions clear enough?
- Does the model use the right tool for the task?

**4. Testing End-to-End Workflows**
- Can the model read a file, analyze it, and write a summary?
- Does the fallback system work when a model is slow?
- Do context window warnings trigger appropriately?

### ❌ DON'T Use GenAI Testing When:

**Traditional tests are better for:**
- Pure logic (token counting, string manipulation)
- API contracts (function signatures, return types)
- Edge cases (null, undefined, empty arrays)
- Deterministic behavior (same input = same output)
- Fast feedback loops (GenAI tests are slow)

---

## GenAI Test Categories

### Category 1: Model Compatibility Tests

**Purpose**: Verify models work correctly with our proxy

**Location**: `tests/genai/model-compatibility/`

**Example:**
```javascript
// tests/genai/model-compatibility/test_qwen3_tool_calling.js

/**
 * Test that qwen3-coder-30b correctly calls the Read tool
 *
 * This tests the real-world bug we fixed:
 * - qwen3 sends incomplete streaming (no tool-input-delta)
 * - We track tools without deltas and complete them
 *
 * GenAI test is needed because:
 * - Unit tests mock the behavior, but we need to verify
 *   the ACTUAL model does it
 * - Different quantizations may behave differently
 * - We need to measure real performance (time to first token)
 */

async function test_qwen3_read_tool() {
  console.log("Testing: qwen3-coder Read tool with real model...");

  // Prerequisites
  const modelInfo = await checkModelLoaded("qwen3-coder");
  if (!modelInfo) {
    console.log("⚠️  Skipping: qwen3-coder not loaded in LMStudio");
    return { skipped: true };
  }

  // Make a real request through anyclaude
  const startTime = Date.now();
  const result = await makeRequest({
    prompt: "Read the README.md file and summarize it in one sentence",
    model: "qwen3-coder-30b",
  });
  const endTime = Date.now();

  // Verify the tool was called correctly
  assert.ok(result.toolCalls, "Should have tool calls");
  assert.strictEqual(result.toolCalls.length, 1, "Should call one tool");
  assert.strictEqual(result.toolCalls[0].name, "Read", "Should use Read tool");
  assert.ok(
    result.toolCalls[0].input.file_path,
    "Should have file_path parameter"
  );

  // Verify performance is acceptable
  const timeToFirstToken = result.timing.promptProcessing;
  console.log(`  Time to first token: ${timeToFirstToken}ms`);
  assert.ok(
    timeToFirstToken < 120000,
    "Should respond within 2 minutes (with 10min timeout)"
  );

  // Verify the tool completed (no hanging)
  assert.ok(result.completed, "Request should complete successfully");

  console.log("✓ qwen3-coder Read tool works correctly");
  return {
    passed: true,
    metrics: {
      timeToFirstToken,
      totalTime: endTime - startTime,
    },
  };
}
```

**When to run**: Before releases, when testing new models

### Category 2: User Experience Tests

**Purpose**: Validate that users get helpful responses

**Location**: `tests/genai/user-experience/`

**Example:**
```javascript
// tests/genai/user-experience/test_error_messages.js

/**
 * Test that error messages are helpful and actionable
 *
 * This uses GenAI to evaluate:
 * - Clarity: Is the error message understandable?
 * - Actionability: Does it tell the user what to do?
 * - Helpfulness: Does it link to documentation?
 *
 * GenAI test is needed because:
 * - Traditional tests can only check that an error is thrown
 * - We need to verify the ERROR MESSAGE QUALITY
 * - This is a semantic judgment, not a logic check
 */

async function test_no_model_loaded_error() {
  console.log("Testing: Error message when no model loaded...");

  // Stop LMStudio or unload model
  await ensureNoModelLoaded();

  // Try to make a request
  let errorMessage;
  try {
    await makeRequest({ prompt: "Hello" });
  } catch (error) {
    errorMessage = error.message;
  }

  assert.ok(errorMessage, "Should throw an error");

  // Use GenAI to evaluate the error message quality
  const evaluation = await evaluateWithAI({
    type: "error_message_quality",
    errorMessage,
    criteria: [
      "Clearly states what went wrong (no model loaded)",
      "Tells the user what to do (load a model in LMStudio)",
      "Provides a link to documentation or next steps",
    ],
  });

  console.log("  GenAI Evaluation:");
  console.log(`    Clarity: ${evaluation.clarity}/10`);
  console.log(`    Actionability: ${evaluation.actionability}/10`);
  console.log(`    Helpfulness: ${evaluation.helpfulness}/10`);

  assert.ok(
    evaluation.clarity >= 8,
    "Error should be clear (8+ / 10)"
  );
  assert.ok(
    evaluation.actionability >= 8,
    "Error should be actionable (8+ / 10)"
  );

  console.log("✓ Error message is helpful");
  return { passed: true, evaluation };
}
```

**When to run**: Before major releases, when changing error messages

### Category 3: Semantic Correctness Tests

**Purpose**: Verify prompts and schemas guide models correctly

**Location**: `tests/genai/semantic-correctness/`

**Example:**
```javascript
// tests/genai/semantic-correctness/test_tool_descriptions.js

/**
 * Test that tool descriptions are clear enough for models
 *
 * This uses GenAI to check:
 * - Do models understand when to use each tool?
 * - Are parameter descriptions clear?
 * - Do models provide correct parameter values?
 *
 * GenAI test is needed because:
 * - This is about SEMANTIC UNDERSTANDING, not logic
 * - Different models may interpret the same description differently
 * - We need to test with REAL model reasoning
 */

async function test_read_tool_description_clarity() {
  console.log("Testing: Read tool description clarity...");

  // Test scenarios where Read should be used
  const scenarios = [
    "Show me the contents of README.md",
    "What's in the package.json file?",
    "Read the error log at /var/log/error.log",
  ];

  const results = [];
  for (const prompt of scenarios) {
    const result = await makeRequest({ prompt });

    // Check if model chose Read tool
    const usedRead = result.toolCalls?.some((tc) => tc.name === "Read");

    results.push({
      prompt,
      usedRead,
      toolCalls: result.toolCalls,
    });
  }

  // All scenarios should use Read tool
  const allUsedRead = results.every((r) => r.usedRead);

  assert.ok(
    allUsedRead,
    "Model should understand when to use Read tool"
  );

  console.log("✓ Read tool description is clear");
  return { passed: true, results };
}
```

**When to run**: When changing tool schemas, before releases

### Category 4: End-to-End Workflow Tests

**Purpose**: Verify complete user workflows work

**Location**: `tests/genai/workflows/`

**Example:**
```javascript
// tests/genai/workflows/test_multi_step_coding.js

/**
 * Test a complete multi-step coding workflow
 *
 * Scenario: User asks to refactor a function
 * Steps:
 *   1. Read the file
 *   2. Analyze the function
 *   3. Write an improved version
 *   4. Verify the changes
 *
 * GenAI test is needed because:
 * - This tests the ENTIRE SYSTEM working together
 * - We need to verify real model reasoning across steps
 * - Unit tests can't capture this end-to-end behavior
 */

async function test_refactor_workflow() {
  console.log("Testing: Multi-step refactoring workflow...");

  // Setup: Create a test file with a function to refactor
  const testFile = "/tmp/test-refactor.js";
  fs.writeFileSync(
    testFile,
    `
    function calculateTotal(items) {
      let total = 0;
      for (let i = 0; i < items.length; i++) {
        total = total + items[i].price;
      }
      return total;
    }
  `
  );

  // Make request
  const result = await makeRequest({
    prompt: `Refactor the calculateTotal function in ${testFile} to use reduce() instead of a for loop`,
  });

  // Verify workflow steps
  assert.ok(result.toolCalls, "Should use tools");

  const toolNames = result.toolCalls.map((tc) => tc.name);

  assert.ok(
    toolNames.includes("Read"),
    "Should read the file first"
  );
  assert.ok(
    toolNames.includes("Write") || toolNames.includes("Edit"),
    "Should write or edit the file"
  );

  // Verify the refactored code
  const refactoredCode = fs.readFileSync(testFile, "utf8");

  assert.ok(
    refactoredCode.includes("reduce"),
    "Should use reduce() method"
  );
  assert.ok(
    !refactoredCode.includes("for (let i"),
    "Should remove for loop"
  );

  // Cleanup
  fs.unlinkSync(testFile);

  console.log("✓ Multi-step refactoring workflow works");
  return { passed: true };
}
```

**When to run**: Before major releases, as smoke tests

---

## GenAI Testing Framework

### Structure

```
tests/genai/
├── framework/
│   ├── genai-evaluator.js          # GenAI evaluation helpers
│   ├── lmstudio-harness.js         # Control LMStudio for testing
│   └── metrics-collector.js        # Collect performance metrics
│
├── model-compatibility/
│   ├── test_qwen3_tool_calling.js
│   ├── test_llama_streaming.js
│   └── test_codestral_context.js
│
├── user-experience/
│   ├── test_error_messages.js
│   ├── test_helpful_responses.js
│   └── test_context_warnings.js
│
├── semantic-correctness/
│   ├── test_tool_descriptions.js
│   ├── test_system_prompt.js
│   └── test_parameter_schemas.js
│
├── workflows/
│   ├── test_multi_step_coding.js
│   ├── test_file_operations.js
│   └── test_debugging_workflow.js
│
└── run_genai_tests.js              # GenAI test runner
```

### Running GenAI Tests

```bash
# Run all GenAI tests (requires LMStudio running with model loaded)
npm run test:genai

# Run specific category
npm run test:genai:model-compatibility
npm run test:genai:ux
npm run test:genai:workflows

# Run with specific model
LMSTUDIO_MODEL=qwen3-coder-30b npm run test:genai
```

---

## GenAI Test Best Practices

### ✅ DO

**1. Make tests skippable when prerequisites missing**
```javascript
const modelInfo = await checkModelLoaded();
if (!modelInfo) {
  console.log("⚠️  Skipping: No model loaded");
  return { skipped: true };
}
```

**2. Collect metrics**
```javascript
return {
  passed: true,
  metrics: {
    timeToFirstToken: 45.2,
    tokensPerSecond: 26.8,
    totalTime: 57.4,
  },
};
```

**3. Use realistic prompts**
```javascript
// Good: Real user request
"Read the README.md file and summarize it"

// Bad: Artificial test request
"Call the Read tool with parameter file_path='/README.md'"
```

**4. Test with multiple models**
```javascript
const models = ["qwen3-coder-30b", "llama-3.1-8b", "codestral-22b"];
for (const model of models) {
  await testWithModel(model);
}
```

**5. Document WHY it's a GenAI test**
```javascript
/**
 * GenAI test is needed because:
 * - We need to verify real model behavior, not mocked
 * - This tests semantic understanding, not logic
 * - Different models may behave differently
 */
```

### ❌ DON'T

**1. Don't use GenAI tests for simple logic**
```javascript
// Bad: Use unit test instead
async function test_token_counting() {
  const result = await makeRequest({ prompt: "Hello" });
  assert.strictEqual(result.tokens.total, 150);
}
```

**2. Don't make GenAI tests required for CI**
```javascript
// GenAI tests are slow and require LMStudio
// Run them manually or on nightly builds, not on every commit
```

**3. Don't test implementation details**
```javascript
// Bad: Testing internal state
assert.ok(result._internal_tool_tracker);

// Good: Testing behavior
assert.ok(result.toolCalls.length > 0);
```

**4. Don't make tests flaky**
```javascript
// Bad: Depends on exact model output
assert.strictEqual(result.response, "The file contains...");

// Good: Check semantic properties
assert.ok(result.response.toLowerCase().includes("file"));
```

---

## Example: GenAI Test vs Traditional Test

### Scenario: Testing Read tool

**Traditional Unit Test** (Fast, Deterministic):
```javascript
// tests/unit/test_tool_calling.js
function test_read_tool_parameters() {
  const tracker = new ToolCallTracker();

  tracker.handleToolInputStart(createToolInputStartChunk("call_1", "Read", 0));
  tracker.handleToolInputDelta(createToolInputDeltaChunk("call_1", '{"file'));

  assert.ok(tracker.currentStreamingTool);
  assert.strictEqual(tracker.currentStreamingTool.name, "Read");

  console.log("✓ Read tool tracked correctly");
}
```

**GenAI Test** (Slow, Real-World):
```javascript
// tests/genai/model-compatibility/test_read_tool.js
async function test_read_tool_with_qwen3() {
  const result = await makeRequest({
    prompt: "Read the README.md file",
    model: "qwen3-coder-30b",
  });

  // Verify model chose Read tool
  assert.ok(result.toolCalls?.some(tc => tc.name === "Read"));

  // Verify it completed without hanging
  assert.ok(result.completed);

  // Verify performance
  assert.ok(result.timing.promptProcessing < 120000);

  console.log("✓ qwen3 Read tool works in production");
}
```

**When to use which?**
- **Unit test**: Always (fast feedback, catches logic bugs)
- **GenAI test**: Before releases (verifies real-world behavior)

---

## Implementing GenAI Evaluation

### Simple Boolean Check
```javascript
const result = await makeRequest({ prompt });
assert.ok(result.toolCalls?.some(tc => tc.name === "Read"));
```

### Metric-Based Evaluation
```javascript
const metrics = await collectMetrics(result);
assert.ok(metrics.timeToFirstToken < 120000, "Should be fast enough");
assert.ok(metrics.tokensPerSecond > 20, "Should have good throughput");
```

### GenAI-Assisted Evaluation
```javascript
// Use a separate AI model to evaluate quality
const evaluation = await evaluateWithAI({
  type: "error_message_quality",
  errorMessage: result.error,
  criteria: [
    "Clearly states what went wrong",
    "Tells user what to do next",
    "Provides documentation link",
  ],
});

assert.ok(evaluation.scores.clarity >= 8);
assert.ok(evaluation.scores.actionability >= 8);
```

---

## When to Run GenAI Tests

### Development
- Manually, when testing model-specific changes
- When adding new model support

### Pre-Release
- Run full GenAI test suite
- Test with all supported models
- Collect and review metrics

### Continuous Integration
- **Don't** run on every commit (too slow)
- **Do** run nightly with representative models
- **Do** run before releases

### Manual Testing
- When investigating model-specific bugs
- When optimizing prompts or schemas
- When testing new LMStudio versions

---

## Next Steps

1. **Start with model compatibility tests**
   - Test qwen3-coder tool calling
   - Test llama-3.1 streaming
   - Collect baseline metrics

2. **Add UX tests for critical paths**
   - Error messages
   - Context warnings
   - Tool selection accuracy

3. **Build up workflow tests over time**
   - Multi-step coding tasks
   - File operations
   - Debugging workflows

4. **Integrate with trace analysis**
   - Use trace-analyzer to understand overhead
   - Use trace-replayer to benchmark models
   - Compare GenAI test results with trace metrics

---

## Further Reading

- **Trace Analysis**: `docs/guides/trace-analysis-guide.md`
- **Model Testing**: `docs/development/model-testing.md`
- **Traditional TDD**: `docs/development/tdd-guide.md`
