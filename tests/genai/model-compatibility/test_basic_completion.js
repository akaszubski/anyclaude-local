/**
 * GenAI Test: Basic Completion
 *
 * Tests that the loaded model can complete a simple request.
 * This is a smoke test to verify the model works at all.
 *
 * Why GenAI test:
 * - We need to test with a REAL model, not mocks
 * - We're verifying the model produces coherent output
 * - We're measuring real performance metrics
 */

const assert = require("assert");
const {
  runGenAITest,
  makeAnyclaudeRequest,
} = require("../framework/lmstudio-harness");

async function test_basic_text_completion() {
  return await runGenAITest({
    name: "Basic text completion",
    testFn: async ({ lmstudioUrl }) => {
      // Make a simple request
      const result = await makeAnyclaudeRequest({
        prompt: "Say 'Hello, World!' and nothing else.",
        lmstudioUrl,
        timeout: 30000, // 30 seconds for simple completion
      });

      // Verify success
      assert.ok(result.success, "Request should succeed");
      assert.ok(result.response, "Should have a response");

      // Verify response quality (semantic check)
      const response = result.response.toLowerCase();
      assert.ok(
        response.includes("hello") || response.includes("world"),
        "Response should contain greeting"
      );

      // Verify performance
      assert.ok(
        result.timing.total < 30000,
        "Should respond within 30 seconds"
      );

      console.log(`   Response: "${result.response.substring(0, 50)}..."`);
      console.log(`   Timing: ${result.timing.total}ms`);

      return {
        metrics: {
          responseTime: result.timing.total,
          responseLength: result.response.length,
        },
      };
    },
  });
}

async function test_multi_sentence_completion() {
  return await runGenAITest({
    name: "Multi-sentence completion",
    testFn: async ({ lmstudioUrl }) => {
      const result = await makeAnyclaudeRequest({
        prompt: "Explain what TypeScript is in exactly 2 sentences.",
        lmstudioUrl,
        timeout: 60000,
      });

      assert.ok(result.success, "Request should succeed");
      assert.ok(result.response, "Should have a response");

      // Verify response has content about TypeScript
      const response = result.response.toLowerCase();
      assert.ok(
        response.includes("typescript") || response.includes("type"),
        "Response should mention TypeScript or types"
      );

      // Verify response length is reasonable (not too short, not too long)
      assert.ok(result.response.length > 50, "Response should be substantial");
      assert.ok(
        result.response.length < 1000,
        "Response should be concise (2 sentences)"
      );

      console.log(`   Response length: ${result.response.length} chars`);
      console.log(`   Timing: ${result.timing.total}ms`);

      return {
        metrics: {
          responseTime: result.timing.total,
          responseLength: result.response.length,
        },
      };
    },
  });
}

async function test_model_follows_instructions() {
  return await runGenAITest({
    name: "Model follows instructions",
    testFn: async ({ lmstudioUrl }) => {
      const result = await makeAnyclaudeRequest({
        prompt: "List 3 programming languages, numbered 1-3, one per line.",
        lmstudioUrl,
        timeout: 30000,
      });

      assert.ok(result.success, "Request should succeed");
      assert.ok(result.response, "Should have a response");

      // Check if response follows format (has numbers)
      const hasNumbers = /[1-3]/.test(result.response);
      assert.ok(hasNumbers, "Response should contain numbered list");

      // Check if response has multiple lines
      const lines = result.response.split("\n").filter((line) => line.trim());
      assert.ok(lines.length >= 3, "Response should have at least 3 lines");

      console.log(`   Response had ${lines.length} lines`);

      return {
        metrics: {
          linesInResponse: lines.length,
        },
      };
    },
  });
}

async function runAllTests() {
  console.log(
    "================================================================================"
  );
  console.log("GENAI: BASIC COMPLETION TESTS");
  console.log(
    "================================================================================"
  );
  console.log("");
  console.log("These tests verify the loaded model can:");
  console.log("  - Complete simple text generation");
  console.log("  - Generate multi-sentence responses");
  console.log("  - Follow basic instructions");
  console.log("");

  const results = [];

  results.push(await test_basic_text_completion());
  results.push(await test_multi_sentence_completion());
  results.push(await test_model_follows_instructions());

  console.log("");
  console.log(
    "================================================================================"
  );
  console.log("GENAI TEST SUMMARY");
  console.log(
    "================================================================================"
  );

  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;

  console.log(`Passed:  ${passed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);

  if (skipped > 0) {
    console.log("");
    console.log(
      "Note: Tests were skipped because no model is loaded in LMStudio."
    );
    console.log("Load a model and run again to execute these tests.");
  }

  console.log(
    "================================================================================"
  );

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("Error running GenAI tests:", error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
