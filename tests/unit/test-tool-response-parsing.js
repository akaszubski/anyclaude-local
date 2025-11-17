#!/usr/bin/env node

/**
 * Unit Tests: Tool Response Parsing (OpenAI → Anthropic)
 *
 * Tests the conversion of OpenAI tool_calls back to Anthropic tool_use format.
 * Covers both streaming (deltas) and complete responses.
 *
 * Part of: Phase 1.2 - Tool Calling Verification
 * Status: RED (tests should FAIL - no implementation exists yet)
 */

const assert = require("assert");

// Import the parsing functions from built dist directory
let parseOpenAIToolCall, assembleStreamingToolCall;
try {
  const parser = require("../../dist/tool-response-parser.js");
  parseOpenAIToolCall = parser.parseOpenAIToolCall;
  assembleStreamingToolCall = parser.assembleStreamingToolCall;
} catch (err) {
  console.log("⚠️  tool-response-parser.js not found (expected in TDD red phase)");
  console.log(`   Error: ${err.message}`);
  parseOpenAIToolCall = null;
  assembleStreamingToolCall = null;
}

let passed = 0;
let failed = 0;

/**
 * Test 1: Parse complete OpenAI tool call (non-streaming)
 */
function testParseCompleteToolCall() {
  console.log("\n✓ Test 1: Parse complete OpenAI tool call");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiResponse = {
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: {
                name: "Read",
                arguments: '{"file_path":"/Users/test/file.txt"}'
              }
            }
          ]
        }
      }
    ]
  };

  const anthropicFormat = parseOpenAIToolCall(openaiResponse.choices[0].message.tool_calls[0]);

  // Anthropic format: { type: "tool_use", id, name, input }
  assert.strictEqual(anthropicFormat.type, "tool_use");
  assert.strictEqual(anthropicFormat.id, "call_abc123");
  assert.strictEqual(anthropicFormat.name, "Read");
  assert.deepStrictEqual(anthropicFormat.input, {
    file_path: "/Users/test/file.txt"
  });

  console.log("   ✅ PASS: Complete tool call parsed correctly");
  passed++;
}

/**
 * Test 2: Parse OpenAI tool call with complex arguments
 */
function testParseComplexArguments() {
  console.log("\n✓ Test 2: Parse complex tool arguments");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCall = {
    id: "call_xyz789",
    type: "function",
    function: {
      name: "Write",
      arguments: JSON.stringify({
        file_path: "/test.js",
        content: "console.log('hello');\n",
        mode: "overwrite",
        metadata: {
          timestamp: "2024-01-15T10:30:00Z",
          author: "test"
        }
      })
    }
  };

  const anthropicFormat = parseOpenAIToolCall(openaiToolCall);

  assert.strictEqual(anthropicFormat.name, "Write");
  assert.ok(anthropicFormat.input.metadata, "Nested objects should be preserved");
  assert.strictEqual(anthropicFormat.input.metadata.author, "test");

  console.log("   ✅ PASS: Complex arguments parsed correctly");
  passed++;
}

/**
 * Test 3: Parse multiple tool calls in sequence
 */
function testParseMultipleToolCalls() {
  console.log("\n✓ Test 3: Parse multiple tool calls");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCalls = [
    {
      id: "call_1",
      type: "function",
      function: { name: "Read", arguments: '{"file_path":"a.txt"}' }
    },
    {
      id: "call_2",
      type: "function",
      function: { name: "Read", arguments: '{"file_path":"b.txt"}' }
    }
  ];

  const anthropicFormats = openaiToolCalls.map(parseOpenAIToolCall);

  assert.strictEqual(anthropicFormats.length, 2);
  assert.strictEqual(anthropicFormats[0].id, "call_1");
  assert.strictEqual(anthropicFormats[1].id, "call_2");
  assert.notStrictEqual(anthropicFormats[0].id, anthropicFormats[1].id);

  console.log("   ✅ PASS: Multiple tool calls parsed correctly");
  passed++;
}

/**
 * Test 4: Handle malformed JSON in arguments
 */
function testHandleMalformedJSON() {
  console.log("\n✓ Test 4: Handle malformed JSON in arguments");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCall = {
    id: "call_bad",
    type: "function",
    function: {
      name: "Bash",
      arguments: '{"command":"ls","invalid json'  // Truncated/malformed
    }
  };

  try {
    parseOpenAIToolCall(openaiToolCall);
    console.log("   ❌ FAIL: Should throw error for malformed JSON");
    failed++;
  } catch (err) {
    assert.ok(
      err.message.includes("JSON") || err.message.includes("parse"),
      "Error should mention JSON parsing"
    );
    console.log("   ✅ PASS: Malformed JSON rejected correctly");
    passed++;
  }
}

/**
 * Test 5: Assemble streaming tool call from deltas
 */
function testAssembleStreamingToolCall() {
  console.log("\n✓ Test 5: Assemble streaming tool call from deltas");

  if (!assembleStreamingToolCall) {
    console.log("   ❌ FAIL: assembleStreamingToolCall not implemented");
    failed++;
    return;
  }

  // Simulate streaming chunks (OpenAI format)
  const deltas = [
    { type: "tool_call_start", id: "call_stream", name: "Read" },
    { type: "tool_call_delta", id: "call_stream", delta: '{"file' },
    { type: "tool_call_delta", id: "call_stream", delta: '_path":' },
    { type: "tool_call_delta", id: "call_stream", delta: '"/test.txt"}' },
    { type: "tool_call_end", id: "call_stream" }
  ];

  const assembledToolCall = assembleStreamingToolCall(deltas);

  assert.strictEqual(assembledToolCall.type, "tool_use");
  assert.strictEqual(assembledToolCall.id, "call_stream");
  assert.strictEqual(assembledToolCall.name, "Read");
  assert.deepStrictEqual(assembledToolCall.input, { file_path: "/test.txt" });

  console.log("   ✅ PASS: Streaming tool call assembled correctly");
  passed++;
}

/**
 * Test 6: Handle incomplete streaming (qwen3-coder issue)
 */
function testIncompleteStreaming() {
  console.log("\n✓ Test 6: Handle incomplete streaming (no deltas)");

  if (!assembleStreamingToolCall) {
    console.log("   ❌ FAIL: assembleStreamingToolCall not implemented");
    failed++;
    return;
  }

  // qwen3-coder-30b pattern: start → end (no deltas) → complete tool call
  const deltas = [
    { type: "tool_call_start", id: "call_incomplete", name: "Write" },
    { type: "tool_call_end", id: "call_incomplete" },
    // Then a complete tool call chunk arrives
    {
      type: "tool_call_complete",
      id: "call_incomplete",
      name: "Write",
      arguments: '{"file_path":"test.txt","content":"hello"}'
    }
  ];

  const assembledToolCall = assembleStreamingToolCall(deltas);

  assert.strictEqual(assembledToolCall.name, "Write");
  assert.deepStrictEqual(assembledToolCall.input, {
    file_path: "test.txt",
    content: "hello"
  });

  console.log("   ✅ PASS: Incomplete streaming handled correctly");
  passed++;
}

/**
 * Test 7: Handle out-of-order chunks (defensive programming)
 */
function testOutOfOrderChunks() {
  console.log("\n✓ Test 7: Handle out-of-order chunks");

  if (!assembleStreamingToolCall) {
    console.log("   ❌ FAIL: assembleStreamingToolCall not implemented");
    failed++;
    return;
  }

  // Unusual but possible: delta arrives before start
  const deltas = [
    { type: "tool_call_delta", id: "call_ooo", delta: '{"command":' },
    { type: "tool_call_start", id: "call_ooo", name: "Bash" },
    { type: "tool_call_delta", id: "call_ooo", delta: '"ls"}' },
    { type: "tool_call_end", id: "call_ooo" }
  ];

  try {
    const assembledToolCall = assembleStreamingToolCall(deltas);
    assert.ok(assembledToolCall, "Should handle out-of-order chunks gracefully");
    console.log("   ✅ PASS: Out-of-order chunks handled");
    passed++;
  } catch (err) {
    // Also acceptable to throw error for invalid sequence
    console.log("   ✅ PASS: Out-of-order chunks rejected (also valid)");
    passed++;
  }
}

/**
 * Test 8: Parse tool call with empty arguments
 */
function testEmptyArguments() {
  console.log("\n✓ Test 8: Parse tool call with empty arguments");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCall = {
    id: "call_empty",
    type: "function",
    function: {
      name: "GetCurrentTime",
      arguments: "{}"
    }
  };

  const anthropicFormat = parseOpenAIToolCall(openaiToolCall);

  assert.strictEqual(anthropicFormat.name, "GetCurrentTime");
  assert.deepStrictEqual(anthropicFormat.input, {});

  console.log("   ✅ PASS: Empty arguments handled correctly");
  passed++;
}

/**
 * Test 9: Validate tool call ID format
 */
function testToolCallIDValidation() {
  console.log("\n✓ Test 9: Validate tool call ID format");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCall = {
    id: "",  // Empty ID
    type: "function",
    function: {
      name: "Read",
      arguments: '{"file_path":"test.txt"}'
    }
  };

  try {
    parseOpenAIToolCall(openaiToolCall);
    console.log("   ❌ FAIL: Should reject empty tool call ID");
    failed++;
  } catch (err) {
    assert.ok(err.message.includes("id"), "Error should mention ID");
    console.log("   ✅ PASS: Empty ID rejected");
    passed++;
  }
}

/**
 * Test 10: Parameter validation (required fields)
 */
function testParameterValidation() {
  console.log("\n✓ Test 10: Parameter validation (required fields)");

  if (!parseOpenAIToolCall) {
    console.log("   ❌ FAIL: parseOpenAIToolCall not implemented");
    failed++;
    return;
  }

  const openaiToolCall = {
    id: "call_validate",
    type: "function",
    function: {
      name: "Read",
      // Missing 'file_path' (should be validated against schema elsewhere)
      arguments: '{}'
    }
  };

  // Parser should not validate schema (that's schema validator's job)
  // But should parse successfully
  const anthropicFormat = parseOpenAIToolCall(openaiToolCall);
  assert.deepStrictEqual(anthropicFormat.input, {});

  console.log("   ✅ PASS: Parser doesn't enforce schema (correct separation of concerns)");
  passed++;
}

function runTests() {
  console.log("================================================================================");
  console.log("UNIT TESTS: Tool Response Parsing (OpenAI → Anthropic)");
  console.log("Phase 1.2 - TDD Red Phase");
  console.log("================================================================================");

  testParseCompleteToolCall();
  testParseComplexArguments();
  testParseMultipleToolCalls();
  testHandleMalformedJSON();
  testAssembleStreamingToolCall();
  testIncompleteStreaming();
  testOutOfOrderChunks();
  testEmptyArguments();
  testToolCallIDValidation();
  testParameterValidation();

  console.log("\n================================================================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (!parseOpenAIToolCall || !assembleStreamingToolCall) {
    console.log("\n⚠️  EXPECTED FAILURE: tool-response-parser.ts not implemented yet");
    console.log("This is the TDD RED phase - implementation comes next!");
  }

  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(runTests());
}

module.exports = { runTests };
