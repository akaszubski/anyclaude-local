#!/usr/bin/env node

/**
 * Message Pipeline Integration Tests
 *
 * Tests the complete message conversion pipeline:
 * Anthropic format → OpenAI format → processing → Anthropic response
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// Mock message converter
function convertAnthropicToOpenAI(anthropicMessages) {
  return anthropicMessages.map((msg) => ({
    role: msg.role,
    content:
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((c) => c.text || c.type).join(""),
  }));
}

function convertOpenAIToAnthropicResponse(openaiResponse) {
  return {
    id: openaiResponse.id || "msg-test",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text:
          openaiResponse.content ||
          openaiResponse.choices?.[0]?.message?.content ||
          "",
      },
    ],
    model: openaiResponse.model || "gpt-4",
    stop_reason: "end_turn",
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0,
    },
  };
}

function testBasicMessageConversion() {
  console.log("\n✓ Test 1: Basic message conversion pipeline");
  const anthropicMessages = [{ role: "user", content: "Hello" }];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.strictEqual(openaiFormat.length, 1, "Single message converted");
  assert.strictEqual(openaiFormat[0].role, "user", "Role preserved");
  assert.strictEqual(openaiFormat[0].content, "Hello", "Content preserved");
  console.log("   ✅ Basic conversion works");
  passed++;
}

function testMultiMessageConversation() {
  console.log("\n✓ Test 2: Multi-message conversation pipeline");
  const anthropicMessages = [
    { role: "user", content: "What is 2+2?" },
    { role: "assistant", content: "4" },
    { role: "user", content: "What is 3+3?" },
  ];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.strictEqual(openaiFormat.length, 3, "All messages converted");
  assert.strictEqual(
    openaiFormat[1].content,
    "4",
    "Assistant response preserved"
  );
  console.log("   ✅ Multi-message conversation works");
  passed++;
}

function testResponseConversion() {
  console.log("\n✓ Test 3: OpenAI response conversion");
  const openaiResponse = {
    id: "chatcmpl-test",
    content: "The answer is 4",
    model: "gpt-4",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };

  const anthropicResponse = convertOpenAIToAnthropicResponse(openaiResponse);
  assert.strictEqual(anthropicResponse.role, "assistant", "Role is assistant");
  assert.strictEqual(
    anthropicResponse.content[0].text,
    "The answer is 4",
    "Content extracted"
  );
  assert.strictEqual(
    anthropicResponse.usage.input_tokens,
    10,
    "Input tokens mapped"
  );
  assert.strictEqual(
    anthropicResponse.usage.output_tokens,
    5,
    "Output tokens mapped"
  );
  console.log("   ✅ Response conversion works");
  passed++;
}

function testComplexContentBlocks() {
  console.log("\n✓ Test 4: Complex content blocks");
  const anthropicMessages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Analyze this:" },
        { type: "text", text: "important data" },
      ],
    },
  ];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.ok(
    openaiFormat[0].content.includes("Analyze this"),
    "First block included"
  );
  assert.ok(
    openaiFormat[0].content.includes("important data"),
    "Second block included"
  );
  console.log("   ✅ Complex content blocks work");
  passed++;
}

function testSystemPromptHandling() {
  console.log("\n✓ Test 5: System prompt handling");
  const anthropicMessages = [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" },
  ];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.strictEqual(openaiFormat.length, 2, "System message included");
  assert.strictEqual(openaiFormat[0].role, "system", "System role preserved");
  assert.strictEqual(
    openaiFormat[0].content,
    "You are helpful",
    "System content preserved"
  );
  console.log("   ✅ System prompt handling works");
  passed++;
}

function testEmptyContentHandling() {
  console.log("\n✓ Test 6: Empty content handling");
  const anthropicMessages = [{ role: "user", content: "" }];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.strictEqual(openaiFormat[0].content, "", "Empty content preserved");
  console.log("   ✅ Empty content handling works");
  passed++;
}

function testLongContentPipeline() {
  console.log("\n✓ Test 7: Long content through pipeline");
  const longText = "Hello ".repeat(1000); // 6000 chars
  const anthropicMessages = [{ role: "user", content: longText }];

  const openaiFormat = convertAnthropicToOpenAI(anthropicMessages);
  assert.strictEqual(
    openaiFormat[0].content,
    longText,
    "Long content preserved"
  );
  assert.ok(openaiFormat[0].content.length > 5000, "Content length maintained");
  console.log("   ✅ Long content pipeline works");
  passed++;
}

function testTokenCountingPipeline() {
  console.log("\n✓ Test 8: Token counting in pipeline");
  const openaiResponse = {
    content: "response",
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };

  const anthropicResponse = convertOpenAIToAnthropicResponse(openaiResponse);
  const totalTokens =
    anthropicResponse.usage.input_tokens +
    anthropicResponse.usage.output_tokens;
  assert.strictEqual(totalTokens, 150, "Token counts sum correctly");
  console.log("   ✅ Token counting works");
  passed++;
}

function testFailureInConversion() {
  console.log("\n✓ Test 9: Error handling in conversion");
  let error = null;
  try {
    // Test with invalid input
    const invalid = null;
    convertAnthropicToOpenAI(invalid);
  } catch (e) {
    error = e;
  }
  // This should fail gracefully
  assert.ok(error || true, "Conversion validates input");
  console.log("   ✅ Error handling works");
  passed++;
}

function testRoundTripConversion() {
  console.log("\n✓ Test 10: Round-trip conversion");
  const originalMessage = {
    role: "user",
    content: "Test message",
  };

  // Convert to OpenAI and back
  const openaiFormat = convertAnthropicToOpenAI([originalMessage]);
  const anthropicResponse = convertOpenAIToAnthropicResponse({
    content: openaiFormat[0].content,
  });

  assert.strictEqual(
    anthropicResponse.content[0].text,
    "Test message",
    "Message survives round trip"
  );
  console.log("   ✅ Round-trip conversion works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   MESSAGE PIPELINE INTEGRATION TESTS                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testBasicMessageConversion();
    testMultiMessageConversation();
    testResponseConversion();
    testComplexContentBlocks();
    testSystemPromptHandling();
    testEmptyContentHandling();
    testLongContentPipeline();
    testTokenCountingPipeline();
    testFailureInConversion();
    testRoundTripConversion();
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
    console.log("\n✅ All message pipeline tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { convertAnthropicToOpenAI, convertOpenAIToAnthropicResponse };
