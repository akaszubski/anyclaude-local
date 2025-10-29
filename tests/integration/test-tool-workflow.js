#!/usr/bin/env node

/**
 * Tool Calling Workflow Integration Tests
 *
 * Tests the complete tool calling workflow:
 * Request → Tool detection → Tool execution → Result integration
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock tool registry
const toolRegistry = new Map([
  [
    "calculator",
    {
      name: "calculator",
      input_schema: {
        type: "object",
        properties: {
          operation: { type: "string" },
          a: { type: "number" },
          b: { type: "number" },
        },
      },
    },
  ],
  [
    "search",
    {
      name: "search",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
      },
    },
  ],
  [
    "get_time",
    { name: "get_time", input_schema: { type: "object", properties: {} } },
  ],
]);

// Mock tool execution
function executeToolCall(toolName, input) {
  const tool = toolRegistry.get(toolName);
  if (!tool) throw new Error(`Tool not found: ${toolName}`);

  switch (toolName) {
    case "calculator":
      if (input.operation === "add") return input.a + input.b;
      if (input.operation === "subtract") return input.a - input.b;
      if (input.operation === "multiply") return input.a * input.b;
      throw new Error("Invalid operation");
    case "search":
      return { results: [{ title: "Result for " + input.query }] };
    case "get_time":
      return { time: "12:00 UTC" };
    default:
      throw new Error("Unknown tool");
  }
}

function testToolDetection() {
  console.log("\n✓ Test 1: Tool detection in response");
  const response = {
    content: [
      {
        type: "tool_use",
        id: "tool-1",
        name: "calculator",
        input: { operation: "add", a: 2, b: 3 },
      },
    ],
  };

  const tools = response.content.filter((c) => c.type === "tool_use");
  assert.strictEqual(tools.length, 1, "Tool detected");
  assert.strictEqual(tools[0].name, "calculator", "Tool name extracted");
  console.log("   ✅ Tool detection works");
  passed++;
}

function testToolValidation() {
  console.log("\n✓ Test 2: Tool validation in workflow");
  const toolCall = {
    name: "calculator",
    input: { operation: "add", a: 2, b: 3 },
  };

  const tool = toolRegistry.get(toolCall.name);
  assert.ok(tool, "Tool found in registry");
  assert.strictEqual(tool.name, "calculator", "Tool name matches");
  console.log("   ✅ Tool validation works");
  passed++;
}

function testToolExecution() {
  console.log("\n✓ Test 3: Tool execution in workflow");
  const result = executeToolCall("calculator", {
    operation: "add",
    a: 5,
    b: 3,
  });
  assert.strictEqual(result, 8, "Addition executed correctly");
  console.log("   ✅ Tool execution works");
  passed++;
}

function testMultipleToolCalls() {
  console.log("\n✓ Test 4: Multiple tool calls in sequence");
  const toolCalls = [
    { id: "t1", name: "calculator", input: { operation: "add", a: 2, b: 2 } },
    {
      id: "t2",
      name: "calculator",
      input: { operation: "multiply", a: 4, b: 5 },
    },
  ];

  const results = [];
  for (const call of toolCalls) {
    const result = executeToolCall(call.name, call.input);
    results.push({ id: call.id, result });
  }

  assert.strictEqual(results.length, 2, "Both tools executed");
  assert.strictEqual(results[0].result, 4, "First result correct");
  assert.strictEqual(results[1].result, 20, "Second result correct");
  console.log("   ✅ Multiple tool calls work");
  passed++;
}

function testToolWithoutInput() {
  console.log("\n✓ Test 5: Tool call without input");
  const result = executeToolCall("get_time", {});
  assert.ok(result.time, "Result has time field");
  console.log("   ✅ Tool without input works");
  passed++;
}

function testToolErrorHandling() {
  console.log("\n✓ Test 6: Tool error handling");
  let error = null;
  try {
    executeToolCall("invalid_tool", {});
  } catch (e) {
    error = e;
  }
  assert.ok(error, "Invalid tool throws error");
  assert.ok(
    error.message.includes("Tool not found"),
    "Error message is informative"
  );
  console.log("   ✅ Tool error handling works");
  passed++;
}

function testToolResultIntegration() {
  console.log("\n✓ Test 7: Tool result integration");
  const toolUseBlock = {
    type: "tool_use",
    id: "tool-123",
    name: "search",
    input: { query: "Claude API" },
  };

  const result = executeToolCall(toolUseBlock.name, toolUseBlock.input);
  const toolResult = {
    type: "tool_result",
    tool_use_id: toolUseBlock.id,
    content: JSON.stringify(result),
  };

  assert.strictEqual(
    toolResult.tool_use_id,
    toolUseBlock.id,
    "Result linked to call"
  );
  assert.ok(toolResult.content, "Content populated");
  console.log("   ✅ Tool result integration works");
  passed++;
}

function testToolStateIsolation() {
  console.log("\n✓ Test 8: Tool state isolation");
  const call1 = executeToolCall("calculator", { operation: "add", a: 1, b: 1 });
  const call2 = executeToolCall("calculator", { operation: "add", a: 2, b: 2 });

  assert.strictEqual(call1, 2, "First call not affected");
  assert.strictEqual(call2, 4, "Second call independent");
  console.log("   ✅ Tool state isolation works");
  passed++;
}

function testToolInputValidation() {
  console.log("\n✓ Test 9: Tool input validation");
  const toolCall = {
    name: "calculator",
    input: { operation: "add", a: 5, b: 3 },
  };

  try {
    const result = executeToolCall(toolCall.name, toolCall.input);
    assert.strictEqual(result, 8, "Valid input accepted");
  } catch (e) {
    assert.fail("Valid input should not throw");
  }

  let invalidError = null;
  try {
    executeToolCall("calculator", { operation: "invalid", a: 5, b: 3 });
  } catch (e) {
    invalidError = e;
  }
  assert.ok(invalidError, "Invalid operation rejected");
  console.log("   ✅ Tool input validation works");
  passed++;
}

function testCompleteToolWorkflow() {
  console.log("\n✓ Test 10: Complete tool workflow");
  // Simulate: Request → AI response with tool use → Execute → Result → Final response
  const aiResponse = {
    content: [
      { type: "text", text: "Let me calculate that for you" },
      {
        type: "tool_use",
        id: "calc-1",
        name: "calculator",
        input: { operation: "multiply", a: 6, b: 7 },
      },
    ],
  };

  // Extract and execute tools
  const toolCalls = aiResponse.content.filter((c) => c.type === "tool_use");
  const results = toolCalls.map((call) => ({
    type: "tool_result",
    tool_use_id: call.id,
    content: String(executeToolCall(call.name, call.input)),
  }));

  assert.strictEqual(results.length, 1, "One tool executed");
  assert.strictEqual(results[0].content, "42", "Correct result");

  const finalResponse = {
    content: [
      ...aiResponse.content,
      ...results,
      { type: "text", text: "The answer is 42" },
    ],
  };

  assert.strictEqual(
    finalResponse.content.length,
    4,
    "Final response has all components"
  );
  console.log("   ✅ Complete tool workflow works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   TOOL CALLING WORKFLOW INTEGRATION TESTS               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testToolDetection();
    testToolValidation();
    testToolExecution();
    testMultipleToolCalls();
    testToolWithoutInput();
    testToolErrorHandling();
    testToolResultIntegration();
    testToolStateIsolation();
    testToolInputValidation();
    testCompleteToolWorkflow();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    failed++;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All tool workflow tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { executeToolCall, toolRegistry };
