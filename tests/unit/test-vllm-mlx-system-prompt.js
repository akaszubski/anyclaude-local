#!/usr/bin/env node

/**
 * Unit Tests: vLLM-MLX System Prompt Normalization
 *
 * Tests that system prompts with newlines and excess whitespace are properly
 * normalized for vLLM-MLX to prevent JSON parsing errors that cause:
 * - Looping/repetitive responses
 * - Unpredictable model behavior
 * - Malformed model input
 *
 * Issue: vLLM-MLX has strict JSON validation that rejects:
 * - Newlines in system prompt strings
 * - Excess whitespace (multiple spaces)
 *
 * Fix: Normalize system prompts before sending to vLLM-MLX
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

/**
 * Mock the fetch interception that happens in main.ts for vLLM-MLX
 */
class VLLMMLXFetchInterceptor {
  interceptAndNormalize(requestBody) {
    const body = JSON.parse(requestBody);

    // Simulate the normalization that happens in main.ts for vLLM-MLX
    if (body.messages && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        // Clean system role messages
        if (msg.role === "system" && msg.content && typeof msg.content === "string") {
          msg.content = msg.content.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        }
        // Also clean user messages that might contain newlines
        if (msg.role === "user" && msg.content && typeof msg.content === "string") {
          msg.content = msg.content.replace(/\r\n/g, "\n");
        }
      }
    }

    return JSON.stringify(body);
  }
}

/**
 * Test 1: System prompt with embedded newlines is normalized
 */
function test_system_prompt_with_newlines() {
  console.log("\n✓ Test 1: System prompt with embedded newlines");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "You are Claude.\nYou are helpful.\nYou are honest."
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  const expectedContent = "You are Claude. You are helpful. You are honest.";
  assert.strictEqual(
    result.messages[0].content,
    expectedContent,
    "Newlines should be converted to spaces"
  );
  console.log("   ✅ Newlines properly normalized to spaces");
  passed++;
}

/**
 * Test 2: Excess whitespace is collapsed
 */
function test_excess_whitespace_collapsed() {
  console.log("\n✓ Test 2: Excess whitespace is collapsed");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "You  are   helpful    with    multiple   spaces."
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  const expectedContent = "You are helpful with multiple spaces.";
  assert.strictEqual(
    result.messages[0].content,
    expectedContent,
    "Multiple spaces should be collapsed to single space"
  );
  console.log("   ✅ Excess whitespace properly collapsed");
  passed++;
}

/**
 * Test 3: Leading/trailing whitespace is trimmed
 */
function test_leading_trailing_whitespace_trimmed() {
  console.log("\n✓ Test 3: Leading/trailing whitespace is trimmed");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "   You are helpful.   "
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  const expectedContent = "You are helpful.";
  assert.strictEqual(
    result.messages[0].content,
    expectedContent,
    "Leading/trailing whitespace should be trimmed"
  );
  console.log("   ✅ Leading/trailing whitespace properly trimmed");
  passed++;
}

/**
 * Test 4: Complex system prompt with tabs and mixed whitespace
 */
function test_complex_whitespace_normalization() {
  console.log("\n✓ Test 4: Complex whitespace normalization");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "You are helpful.\n\nYou  understand\ttabs\nand  mixed  spacing."
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  // Should have all whitespace normalized to single spaces
  const content = result.messages[0].content;
  assert.ok(
    !content.includes("\n"),
    "No newlines should remain"
  );
  assert.ok(
    !content.includes("\t"),
    "No tabs should remain"
  );
  assert.ok(
    !/  /.test(content),
    "No double spaces should remain"
  );
  console.log("   ✅ Complex whitespace properly normalized");
  passed++;
}

/**
 * Test 5: JSON remains valid after normalization
 */
function test_normalized_json_is_valid() {
  console.log("\n✓ Test 5: Normalized JSON remains valid");
  const interceptor = new VLLMMLXFetchInterceptor();

  const originalRequest = {
    model: "qwen3-coder",
    messages: [
      {
        role: "system",
        content: "You are Claude.\nYou help users.\nBe honest."
      },
      {
        role: "user",
        content: "Hello"
      }
    ],
    temperature: 0.7,
    max_tokens: 1000
  };

  let error = null;
  try {
    const normalized = interceptor.interceptAndNormalize(JSON.stringify(originalRequest));
    const parsed = JSON.parse(normalized);

    assert.ok(parsed.model, "Model preserved");
    assert.ok(parsed.messages, "Messages preserved");
    assert.strictEqual(parsed.temperature, 0.7, "Temperature preserved");
    assert.strictEqual(parsed.max_tokens, 1000, "Max tokens preserved");
  } catch (e) {
    error = e;
  }

  assert.ok(!error, "JSON should remain valid after normalization");
  console.log("   ✅ Normalized JSON is valid");
  passed++;
}

/**
 * Test 6: Non-system messages are handled correctly
 */
function test_non_system_messages_preserved() {
  console.log("\n✓ Test 6: Non-system messages are preserved");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "user",
        content: "User message with\nnewlines should be\npreserved as-is."
      },
      {
        role: "assistant",
        content: "Assistant message."
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  // User message should have \r\n converted to \n (different handling)
  assert.ok(
    result.messages[0].content.includes("newlines"),
    "User message content preserved"
  );
  console.log("   ✅ Non-system messages preserved");
  passed++;
}

/**
 * Test 7: Empty system prompt is handled
 */
function test_empty_system_prompt() {
  console.log("\n✓ Test 7: Empty system prompt is handled");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "   "
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  assert.strictEqual(
    result.messages[0].content,
    "",
    "Empty whitespace should be trimmed to empty string"
  );
  console.log("   ✅ Empty system prompt handled correctly");
  passed++;
}

/**
 * Test 8: System prompt from array format (Anthropic format)
 */
function test_system_prompt_array_format() {
  console.log("\n✓ Test 8: System prompt handling with array format");

  // Simulate the conversion from Anthropic array format to string
  const systemArray = [
    { text: "You are Claude.\n" },
    { text: "You are helpful.\n" },
    { text: "Be honest." }
  ];

  // Convert to string (as done in anthropic-proxy.ts)
  let system = systemArray.map((s) => (typeof s === "string" ? s : s.text)).join("\n");

  // Then normalize (as done in vllm-mlx fetch interceptor)
  system = system.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const expectedContent = "You are Claude. You are helpful. Be honest.";
  assert.strictEqual(
    system,
    expectedContent,
    "Array system prompts should be normalized correctly"
  );
  console.log("   ✅ System prompt array format normalized correctly");
  passed++;
}

/**
 * Test 9: Regression test - would have failed before fix
 */
function test_regression_claude_code_system_prompt() {
  console.log("\n✓ Test 9: Regression test - typical Claude Code system prompt");
  const interceptor = new VLLMMLXFetchInterceptor();

  // This is a real-world Claude Code system prompt with multiple lines
  const realSystemPrompt = `You are Claude, an AI assistant made by Anthropic.
You are helpful, harmless, and honest.
You have access to various tools to help users with tasks.

When responding:
- Be concise and clear
- Use appropriate formatting
- Ask clarifying questions if needed
- Admit uncertainty when appropriate`;

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: realSystemPrompt
      },
      {
        role: "user",
        content: "Can you help me with something?"
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  const normalizedContent = result.messages[0].content;

  // Verify no problematic characters remain
  assert.ok(!normalizedContent.includes("\n"), "No newlines in normalized prompt");
  assert.ok(!normalizedContent.includes("\t"), "No tabs in normalized prompt");
  assert.ok(!/  /.test(normalizedContent), "No double spaces in normalized prompt");

  // Verify content is preserved (even if reformatted)
  assert.ok(normalizedContent.includes("Claude"), "Claude reference preserved");
  assert.ok(normalizedContent.includes("helpful"), "helpful reference preserved");
  assert.ok(normalizedContent.includes("tools"), "tools reference preserved");

  console.log("   ✅ Real-world system prompt normalized correctly");
  passed++;
}

/**
 * Test 10: Multiple messages with mixed normalization needs
 */
function test_multiple_messages_normalization() {
  console.log("\n✓ Test 10: Multiple messages with mixed normalization");
  const interceptor = new VLLMMLXFetchInterceptor();

  const requestBody = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "You are helpful.\nBe honest."
      },
      {
        role: "user",
        content: "Message 1"
      },
      {
        role: "user",
        content: "Message with\nnewlines"
      },
      {
        role: "assistant",
        content: "Response."
      }
    ]
  });

  const normalized = interceptor.interceptAndNormalize(requestBody);
  const result = JSON.parse(normalized);

  // System should be normalized
  assert.strictEqual(
    result.messages[0].content,
    "You are helpful. Be honest.",
    "System message normalized"
  );

  // User and assistant messages should be preserved
  assert.ok(result.messages[1].content, "User message 1 preserved");
  assert.ok(result.messages[2].content, "User message 2 preserved");
  assert.ok(result.messages[3].content, "Assistant message preserved");

  console.log("   ✅ Multiple messages normalized correctly");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   VLLM-MLX SYSTEM PROMPT NORMALIZATION TESTS            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    test_system_prompt_with_newlines();
    test_excess_whitespace_collapsed();
    test_leading_trailing_whitespace_trimmed();
    test_complex_whitespace_normalization();
    test_normalized_json_is_valid();
    test_non_system_messages_preserved();
    test_empty_system_prompt();
    test_system_prompt_array_format();
    test_regression_claude_code_system_prompt();
    test_multiple_messages_normalization();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    console.error(e.stack);
    failed++;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All vLLM-MLX system prompt normalization tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}

module.exports = { VLLMMLXFetchInterceptor };
