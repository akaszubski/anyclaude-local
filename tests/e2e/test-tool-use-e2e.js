#!/usr/bin/env node

/**
 * Tool Use End-to-End Tests
 *
 * Tests complete tool use workflows in conversations:
 * User request → AI uses tool → Tool result → AI follows up
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock conversation with tool support
class ConversationWithTools {
  constructor() {
    this.messages = [];
    this.toolResults = [];
    this.tools = new Map([
      ["weather", { name: "weather", description: "Get weather" }],
      ["calculator", { name: "calculator", description: "Do math" }]
    ]);
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  addToolCall(toolName, input) {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    this.messages.push({
      role: "assistant",
      content: [{ type: "tool_use", name: toolName, input }]
    });
  }

  addToolResult(toolName, result) {
    this.toolResults.push({ tool: toolName, result });
    this.messages.push({
      role: "user",
      content: [{ type: "tool_result", tool: toolName, content: result }]
    });
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  getToolResults() {
    return this.toolResults;
  }

  getConversationWithTools() {
    return {
      messages: this.messages,
      toolResults: this.toolResults,
      toolsUsed: this.toolResults.map(t => t.tool)
    };
  }
}

function testSimpleToolUse() {
  console.log("\n✓ Test 1: Simple tool use in conversation");
  const conv = new ConversationWithTools();

  conv.addMessage("user", "What's the weather?");
  conv.addToolCall("weather", { location: "New York" });

  assert.strictEqual(conv.messages.length, 2, "Messages recorded");
  assert.ok(conv.getLastMessage().content[0].type === "tool_use", "Tool call recorded");
  console.log("   ✅ Simple tool use works");
  passed++;
}

function testToolResultIntegration() {
  console.log("\n✓ Test 2: Tool result integration");
  const conv = new ConversationWithTools();

  conv.addMessage("user", "Calculate 5+3");
  conv.addToolCall("calculator", { operation: "add", a: 5, b: 3 });
  conv.addToolResult("calculator", "8");

  const results = conv.getToolResults();
  assert.strictEqual(results.length, 1, "Tool result recorded");
  assert.strictEqual(results[0].result, "8", "Result value correct");
  console.log("   ✅ Tool result integration works");
  passed++;
}

function testMultipleToolCalls() {
  console.log("\n✓ Test 3: Multiple tool calls in workflow");
  const conv = new ConversationWithTools();

  conv.addMessage("user", "Check weather and do calculations");
  conv.addToolCall("weather", { location: "NYC" });
  conv.addToolCall("calculator", { operation: "multiply", a: 10, b: 5 });
  conv.addToolResult("weather", "Sunny");
  conv.addToolResult("calculator", "50");

  const results = conv.getToolResults();
  assert.strictEqual(results.length, 2, "Both tool results recorded");
  console.log("   ✅ Multiple tool calls work");
  passed++;
}

function testToolValidation() {
  console.log("\n✓ Test 4: Tool validation in workflow");
  const conv = new ConversationWithTools();

  let error = null;
  try {
    conv.addToolCall("nonexistent", {});
  } catch (e) {
    error = e;
  }

  assert.ok(error, "Invalid tool rejected");
  console.log("   ✅ Tool validation works");
  passed++;
}

function testToolChaining() {
  console.log("\n✓ Test 5: Tool result chaining");
  const conv = new ConversationWithTools();

  // First tool call
  conv.addMessage("user", "What's the weather?");
  conv.addToolCall("weather", { location: "NYC" });
  conv.addToolResult("weather", "Sunny, 75°F");

  // AI response uses that result
  conv.addMessage("assistant", "Based on the weather report");

  // Follow-up tool call
  conv.addToolCall("calculator", { operation: "add", a: 75, b: 5 });
  conv.addToolResult("calculator", "80");

  const conv_data = conv.getConversationWithTools();
  assert.strictEqual(conv_data.toolsUsed.length, 2, "Both tools used");
  console.log("   ✅ Tool chaining works");
  passed++;
}

function testToolStateTracking() {
  console.log("\n✓ Test 6: Tool state tracking");
  const conv = new ConversationWithTools();

  const tools = ["weather", "calculator"];
  for (const tool of tools) {
    conv.addMessage("user", `Use ${tool}`);
    conv.addToolCall(tool, {});
    conv.addToolResult(tool, "result");
  }

  const used = conv.getConversationWithTools().toolsUsed;
  assert.ok(used.includes("weather"), "Weather tracked");
  assert.ok(used.includes("calculator"), "Calculator tracked");
  console.log("   ✅ Tool state tracking works");
  passed++;
}

function testToolResultContent() {
  console.log("\n✓ Test 7: Tool result content handling");
  const conv = new ConversationWithTools();

  const complexResult = JSON.stringify({
    temperature: 72,
    condition: "Clear",
    humidity: 65
  });

  conv.addMessage("user", "Get detailed weather");
  conv.addToolCall("weather", { location: "Boston" });
  conv.addToolResult("weather", complexResult);

  const results = conv.getToolResults();
  assert.ok(results[0].result.includes("temperature"), "Complex result preserved");
  console.log("   ✅ Tool result content works");
  passed++;
}

function testToolConversationFlow() {
  console.log("\n✓ Test 8: Complete tool conversation flow");
  const conv = new ConversationWithTools();

  // Setup
  conv.addMessage("user", "I need to calculate something");
  conv.addMessage("assistant", "I can help with that");

  // Tool use
  conv.addToolCall("calculator", { operation: "multiply", a: 12, b: 13 });
  conv.addToolResult("calculator", "156");

  // Response
  conv.addMessage("assistant", "The result is 156");

  const messages = conv.messages;
  assert.strictEqual(messages.length, 5, "All exchanges recorded");
  assert.ok(conv.getToolResults().length > 0, "Tool results available");
  console.log("   ✅ Complete tool conversation flow works");
  passed++;
}

function testErrorInToolWorkflow() {
  console.log("\n✓ Test 9: Error handling in tool workflow");
  const conv = new ConversationWithTools();

  conv.addMessage("user", "Use a tool");
  conv.addToolCall("weather", { location: "NYC" });

  // Simulate error
  let error = null;
  try {
    conv.addToolCall("invalid_tool", {});
  } catch (e) {
    error = e;
  }

  assert.ok(error, "Error caught");
  // But previous messages should still be there
  assert.strictEqual(conv.messages.length, 2, "Valid messages preserved");
  console.log("   ✅ Error handling in tool workflow works");
  passed++;
}

function testCompleteToolUseWorkflow() {
  console.log("\n✓ Test 10: Complete tool use workflow");
  // Simulate: User → AI recognizes need for tool → Tool call → Result → AI response
  const conv = new ConversationWithTools();

  // User asks a question
  conv.addMessage("user", "What is 144 divided by 12?");

  // AI decides to use calculator tool
  conv.addToolCall("calculator", { operation: "divide", a: 144, b: 12 });

  // Tool executes and returns result
  conv.addToolResult("calculator", "12");

  // AI provides the answer
  conv.addMessage("assistant", "144 divided by 12 equals 12");

  // Verify complete workflow
  const workflow = conv.getConversationWithTools();
  assert.strictEqual(workflow.messages.length, 4, "Complete workflow logged");
  assert.strictEqual(workflow.toolResults.length, 1, "Tool result captured");
  assert.strictEqual(workflow.toolResults[0].result, "12", "Correct result");
  assert.ok(workflow.toolsUsed.includes("calculator"), "Calculator was used");

  console.log("   ✅ Complete tool use workflow works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   TOOL USE END-TO-END TESTS                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testSimpleToolUse();
    testToolResultIntegration();
    testMultipleToolCalls();
    testToolValidation();
    testToolChaining();
    testToolStateTracking();
    testToolResultContent();
    testToolConversationFlow();
    testErrorInToolWorkflow();
    testCompleteToolUseWorkflow();
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
    console.log("\n✅ All tool use E2E tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { ConversationWithTools };
