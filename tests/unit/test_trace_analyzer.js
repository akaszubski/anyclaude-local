/**
 * Unit tests for trace analyzer
 *
 * Tests:
 * - Trace validation (valid, invalid, missing fields, old format)
 * - Token counting accuracy
 * - Request type detection (text, tool call)
 * - Analysis output format
 * - Error handling for missing files
 * - Error handling for invalid JSON
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Import trace analyzer functions
const traceAnalyzer = require("../../dist/trace-analyzer.js");

// Test fixtures directory
const TEST_FIXTURES_DIR = path.join(__dirname, "../fixtures/traces");

function setupTestFixtures() {
  // Create test fixtures directory
  if (!fs.existsSync(TEST_FIXTURES_DIR)) {
    fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
  }

  // Valid trace with tools
  const validTraceWithTools = {
    timestamp: "2025-10-26T10:00:00.000Z",
    mode: "lmstudio",
    request: {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: {
        model: "current-model",
        max_tokens: 4096,
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Read README.md" }],
        tools: [
          {
            name: "Read",
            description: "Reads a file",
            input_schema: {
              type: "object",
              properties: {
                file_path: { type: "string" },
              },
              required: ["file_path"],
            },
          },
        ],
      },
    },
  };

  // Valid trace without tools
  const validTraceNoTools = {
    timestamp: "2025-10-26T10:00:00.000Z",
    mode: "lmstudio",
    request: {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: {
        model: "current-model",
        max_tokens: 4096,
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Hello world" }],
      },
    },
  };

  // Old broken format
  const oldBrokenTrace = {
    timestamp: "2025-10-26T06:47:51.447Z",
    mode: "lmstudio",
    request: {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: {
        index: 0,
      },
    },
  };

  // Invalid JSON (we'll write this as string)
  const invalidJson = '{"timestamp": "2025-10-26", invalid json}';

  // Missing request body
  const missingBody = {
    timestamp: "2025-10-26T10:00:00.000Z",
    mode: "lmstudio",
    request: {
      method: "POST",
      url: "/v1/messages",
      headers: {},
    },
  };

  // Write fixtures
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, "valid-with-tools.json"),
    JSON.stringify(validTraceWithTools, null, 2)
  );
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, "valid-no-tools.json"),
    JSON.stringify(validTraceNoTools, null, 2)
  );
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, "old-broken-format.json"),
    JSON.stringify(oldBrokenTrace, null, 2)
  );
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, "invalid.json"),
    invalidJson
  );
  fs.writeFileSync(
    path.join(TEST_FIXTURES_DIR, "missing-body.json"),
    JSON.stringify(missingBody, null, 2)
  );
}

function cleanupTestFixtures() {
  if (fs.existsSync(TEST_FIXTURES_DIR)) {
    fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
  }
}

function test_validate_trace_valid() {
  console.log("Testing: Validate trace - valid trace with tools...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "valid-with-tools.json");
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));

  // Test validation function if exported
  // Since validateTrace might not be exported, we'll test through analyzeTrace
  // A valid trace should not return an error object
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(result, "Result should exist");
  assert.ok(!result.error, "Valid trace should not have error");
  assert.ok(result.trace, "Result should have trace object");
  assert.ok(result.trace.timestamp, "Trace should have timestamp");
  assert.ok(result.trace.mode, "Trace should have mode");
  assert.strictEqual(result.trace.mode, "lmstudio", "Mode should be lmstudio");

  console.log("✓ Valid trace passes validation");
}

function test_validate_trace_old_format() {
  console.log("Testing: Validate trace - old broken format...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "old-broken-format.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(result, "Result should exist");
  assert.ok(result.error, "Old format should return error");
  assert.ok(
    result.error.includes("old format"),
    "Error should mention old format"
  );

  console.log("✓ Old format detected correctly");
}

function test_validate_trace_invalid_json() {
  console.log("Testing: Validate trace - invalid JSON...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "invalid.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(result, "Result should exist");
  assert.ok(result.error, "Invalid JSON should return error");
  assert.ok(
    result.error.includes("Invalid JSON"),
    "Error should mention invalid JSON"
  );

  console.log("✓ Invalid JSON detected correctly");
}

function test_validate_trace_missing_file() {
  console.log("Testing: Validate trace - missing file...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "nonexistent.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(result, "Result should exist");
  assert.ok(result.error, "Missing file should return error");
  assert.ok(
    result.error.includes("not found"),
    "Error should mention file not found"
  );

  console.log("✓ Missing file handled gracefully");
}

function test_analyze_trace_with_tools() {
  console.log("Testing: Analyze trace with tools...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "valid-with-tools.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(!result.error, "Should not have error");
  assert.ok(result.tokens, "Should have token counts");
  assert.ok(result.tokens.systemTokens > 0, "Should count system tokens");
  assert.ok(result.tokens.toolTokens > 0, "Should count tool tokens");
  assert.ok(result.tokens.messageTokens > 0, "Should count message tokens");
  assert.ok(result.tokens.totalTokens > 0, "Should have total tokens");

  assert.strictEqual(
    result.tokens.totalTokens,
    result.tokens.systemTokens + result.tokens.toolTokens + result.tokens.messageTokens,
    "Total should equal sum of parts"
  );

  assert.strictEqual(result.requestType, "text_generation", "Request type");
  const tools = result.trace.request.body.tools || [];
  assert.strictEqual(tools.length, 1, "Should have 1 tool");

  console.log("✓ Trace with tools analyzed correctly");
}

function test_analyze_trace_without_tools() {
  console.log("Testing: Analyze trace without tools...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "valid-no-tools.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(!result.error, "Should not have error");
  assert.ok(result.tokens, "Should have token counts");
  assert.ok(result.tokens.systemTokens > 0, "Should count system tokens");
  assert.strictEqual(result.tokens.toolTokens, 0, "Should have 0 tool tokens");
  assert.ok(result.tokens.messageTokens > 0, "Should count message tokens");

  assert.strictEqual(result.requestType, "text_generation", "Request type");
  const tools = result.trace.request.body.tools || [];
  assert.strictEqual(tools.length, 0, "Should have 0 tools");

  console.log("✓ Trace without tools analyzed correctly");
}

function test_token_counting_accuracy() {
  console.log("Testing: Token counting accuracy...");

  const tracePath = path.join(TEST_FIXTURES_DIR, "valid-with-tools.json");
  const result = traceAnalyzer.analyzeTrace(tracePath);

  assert.ok(!result.error, "Should not have error");

  // Verify token counts are reasonable
  assert.ok(
    result.tokens.totalTokens > 10,
    "Total tokens should be more than 10 for realistic trace"
  );
  assert.ok(
    result.tokens.totalTokens < 100000,
    "Total tokens should be less than 100k for simple trace"
  );

  // Verify percentages
  const totalPercentage =
    result.tokens.systemPercent +
    result.tokens.toolPercent +
    result.tokens.messagePercent;
  assert.ok(
    Math.abs(totalPercentage - 100) < 0.1,
    "Percentages should sum to ~100"
  );

  console.log("✓ Token counting is accurate");
}

function test_list_traces() {
  console.log("Testing: List traces (function exists)...");

  // listTraces prints to console, so we just verify it's exported
  assert.ok(
    typeof traceAnalyzer.listTraces === "function",
    "listTraces should be a function"
  );

  console.log("✓ List traces function exists");
}

function runTests() {
  console.log("================================================================================");
  console.log("TRACE ANALYZER UNIT TESTS");
  console.log("================================================================================");
  console.log("");

  try {
    setupTestFixtures();

    test_validate_trace_valid();
    test_validate_trace_old_format();
    test_validate_trace_invalid_json();
    test_validate_trace_missing_file();
    test_analyze_trace_with_tools();
    test_analyze_trace_without_tools();
    test_token_counting_accuracy();
    test_list_traces();

    console.log("");
    console.log("================================================================================");
    console.log("✓ ALL TRACE ANALYZER TESTS PASSED");
    console.log("================================================================================");
    return 0;
  } catch (error) {
    console.error("");
    console.error("================================================================================");
    console.error("✗ TEST FAILED");
    console.error("================================================================================");
    console.error(error);
    return 1;
  } finally {
    cleanupTestFixtures();
  }
}

// Run tests if executed directly
if (require.main === module) {
  process.exit(runTests());
}

module.exports = { runTests };
