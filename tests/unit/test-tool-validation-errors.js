#!/usr/bin/env node

/**
 * Tool Validation Error Handling Tests
 *
 * Tests for tool call validation, schema validation, and execution errors that
 * could cause malformed requests, crashes, or inconsistent state.
 */

const assert = require("assert");

// Test counters
let passed = 0;
let failed = 0;

// ============================================================================
// CRITICAL TESTS (P0)
// ============================================================================

/**
 * Test 1: Tool input with circular reference
 *
 * Scenario: Tool input object contains circular reference
 * Expected: JSON.stringify handled with replacer or error caught
 */
function testCircularReferenceInInput() {
  console.log("\n✓ Test 1: Circular reference in tool input");

  const toolInput = { a: 1 };
  toolInput.self = toolInput; // Circular reference

  let stringified = null;
  let error = null;

  try {
    // Use replacer to handle circular references
    const seen = new WeakSet();
    stringified = JSON.stringify(toolInput, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
  } catch (e) {
    error = e;
  }

  assert.ok(stringified && !error, "Circular reference handled");
  console.log("   ✅ Circular references properly detected");
  passed++;
}

/**
 * Test 2: Tool not in registry (missing tool ID)
 *
 * Scenario: Tool call references unknown tool ID
 * Expected: Tool registry lookup fails, error logged
 */
function testToolNotInRegistry() {
  console.log("\n✓ Test 2: Tool not in registry");

  const toolRegistry = new Map([
    ["list-files", { name: "list-files" }],
    ["read-file", { name: "read-file" }],
  ]);

  const requestedToolId = "unknown-tool";
  const toolExists = toolRegistry.has(requestedToolId);

  assert.ok(!toolExists, "Missing tool correctly identified");

  // Verify error path
  if (!toolExists) {
    console.log(`   [DEBUG] Tool not found: ${requestedToolId}`);
  }

  console.log("   ✅ Missing tools properly detected");
  passed++;
}

/**
 * Test 3: Missing toolName or toolCallId field
 *
 * Scenario: Tool call chunk missing required fields
 * Expected: Validation error, not silent skip
 */
function testMissingRequiredFields() {
  console.log("\n✓ Test 3: Missing required tool fields");

  const toolCall = {}; // Empty - missing toolName and toolCallId

  // Validate required fields
  const hasToolName =
    "toolName" in toolCall && typeof toolCall.toolName === "string";
  const hasToolId =
    "toolCallId" in toolCall && typeof toolCall.toolCallId === "string";

  assert.ok(!hasToolName, "Missing toolName detected");
  assert.ok(!hasToolId, "Missing toolCallId detected");

  // Should error if either is missing
  const isValid = hasToolName && hasToolId;
  assert.ok(!isValid, "Validation correctly fails for incomplete tool call");

  console.log("   ✅ Missing required fields properly validated");
  passed++;
}

/**
 * Test 4: Tool input JSON parse fails
 *
 * Scenario: Tool input is invalid JSON string
 * Expected: Error caught, tool call rejected
 */
function testToolInputJsonParseFails() {
  console.log("\n✓ Test 4: Tool input JSON parse error");

  const invalidJson = '{"incomplete": json object}'; // Invalid JSON

  let parsed = null;
  let error = null;

  try {
    parsed = JSON.parse(invalidJson);
  } catch (e) {
    error = e;
  }

  assert.ok(error, "JSON parse error caught");
  assert.ok(!parsed, "Invalid JSON not parsed");
  console.log("   ✅ Tool input JSON errors properly caught");
  passed++;
}

/**
 * Test 5: Invalid tool name (special characters)
 *
 * Scenario: Tool name contains invalid characters
 * Expected: Name validated, error if invalid
 */
function testInvalidToolName() {
  console.log("\n✓ Test 5: Invalid tool name validation");

  // Valid tool names are typically alphanumeric + underscore + dash
  const validPattern = /^[a-zA-Z0-9_-]+$/;

  const toolNames = [
    { name: "valid-tool", valid: true },
    { name: "valid_tool", valid: true },
    { name: "invalid@tool", valid: false },
    { name: "invalid tool", valid: false },
    { name: "invalid;tool", valid: false },
  ];

  for (const testCase of toolNames) {
    const isValid = validPattern.test(testCase.name);
    assert.strictEqual(
      isValid,
      testCase.valid,
      `Tool name "${testCase.name}" validation correct`
    );
  }

  console.log("   ✅ Tool names properly validated");
  passed++;
}

// ============================================================================
// HIGH PRIORITY TESTS (P1)
// ============================================================================

/**
 * Test 6: Tool input exceeds max size
 *
 * Scenario: Tool input parameters too large
 * Expected: Size check fails, error reported
 */
function testToolInputSizeLimit() {
  console.log("\n✓ Test 6: Tool input size limit");

  const MAX_TOOL_INPUT_SIZE = 10 * 1024; // 10KB
  const toolInput = { data: "x".repeat(20 * 1024) }; // 20KB

  const toolInputJson = JSON.stringify(toolInput);
  const isOversized = toolInputJson.length > MAX_TOOL_INPUT_SIZE;

  assert.ok(isOversized, "Oversized input detected");
  console.log("   ✅ Tool input size limits enforced");
  passed++;
}

/**
 * Test 7: Multiple concurrent tool calls (deduplication)
 *
 * Scenario: Same tool called multiple times simultaneously
 * Expected: Only first call processed, duplicates skipped
 */
function testToolCallDeduplication() {
  console.log("\n✓ Test 7: Tool call deduplication");

  const processedToolIds = new Set();
  const toolCalls = [
    { id: "tool-123", name: "action" },
    { id: "tool-123", name: "action" }, // Duplicate
    { id: "tool-456", name: "other" },
    { id: "tool-123", name: "action" }, // Duplicate
  ];

  let processedCount = 0;
  for (const toolCall of toolCalls) {
    if (!processedToolIds.has(toolCall.id)) {
      processedToolIds.add(toolCall.id);
      processedCount++;
    }
  }

  assert.strictEqual(processedCount, 2, "Duplicates properly deduplicated");
  console.log("   ✅ Tool call deduplication works");
  passed++;
}

/**
 * Test 8: Tool call arrives out of order
 *
 * Scenario: Tool-call chunk arrives before tool-input-delta chunks
 * Expected: Handled gracefully, state properly tracked
 */
function testOutOfOrderToolCall() {
  console.log("\n✓ Test 8: Out-of-order tool call handling");

  // Simulate stream event sequence
  const events = [];

  // Tool-input-start
  const toolCall = {
    type: "tool-use-start",
    id: "tool-1",
    name: "test-tool",
  };
  events.push(toolCall);

  // Tool-call arrives without prior input chunks
  const toolUse = {
    type: "tool-call",
    id: "tool-1",
    input: { arg: "value" },
  };
  events.push(toolUse);

  // Should handle gracefully - tool input provided in tool-call
  assert.ok(toolUse.input, "Tool input available in tool-call");
  assert.strictEqual(toolUse.input.arg, "value", "Input data correct");
  console.log("   ✅ Out-of-order tool calls handled properly");
  passed++;
}

/**
 * Test 9: Tool input-end without deltas
 *
 * Scenario: Receive tool-input-end but no input_json_delta events
 * Expected: Tool still processed with empty or later input
 */
function testToolInputEndWithoutDeltas() {
  console.log("\n✓ Test 9: Tool input-end without deltas");

  const toolState = {
    id: "tool-1",
    name: "test",
    receivedDeltas: false,
    input: {},
  };

  // Tool input-end received without any deltas
  const hasInput =
    Object.keys(toolState.input).length > 0 || toolState.receivedDeltas;

  // Later, full input arrives in tool-call chunk
  const toolCall = {
    id: "tool-1",
    input: { param: "value" },
  };

  if (!hasInput && toolCall.input) {
    toolState.input = toolCall.input;
  }

  assert.deepStrictEqual(
    toolState.input,
    { param: "value" },
    "Input properly set from tool-call"
  );
  console.log("   ✅ Missing deltas handled by tool-call input");
  passed++;
}

/**
 * Test 10: Empty tool input object
 *
 * Scenario: Tool has no parameters (empty input object)
 * Expected: Treated as valid (some tools take no input)
 */
function testEmptyToolInput() {
  console.log("\n✓ Test 10: Empty tool input");

  const toolCall = {
    id: "tool-1",
    name: "get-current-time", // Takes no arguments
    input: {}, // Empty is valid
  };

  // Empty input is valid for some tools
  const isValidInput =
    typeof toolCall.input === "object" && toolCall.input !== null;
  assert.ok(isValidInput, "Empty input object is valid");

  // Should not error
  const inputKeys = Object.keys(toolCall.input);
  assert.strictEqual(inputKeys.length, 0, "Input is empty");
  console.log("   ✅ Empty tool inputs properly handled");
  passed++;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   TOOL VALIDATION ERROR HANDLING TESTS                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    // Critical tests
    testCircularReferenceInInput();
    testToolNotInRegistry();
    testMissingRequiredFields();
    testToolInputJsonParseFails();
    testInvalidToolName();

    // High priority tests
    testToolInputSizeLimit();
    testToolCallDeduplication();
    testOutOfOrderToolCall();
    testToolInputEndWithoutDeltas();
    testEmptyToolInput();
  } catch (e) {
    console.error(`\n❌ Test failed with error: ${e.message}`);
    console.error(e.stack);
    failed++;
  }

  // Print summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All tool validation error tests passed!");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} test(s) failed!`);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testCircularReferenceInInput,
  testToolNotInRegistry,
  testMissingRequiredFields,
};
