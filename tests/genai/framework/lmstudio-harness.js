/**
 * LMStudio Testing Harness
 *
 * Utilities for controlling and testing with LMStudio during GenAI tests
 */

const { LMStudioClient } = require("../../../dist/lmstudio-client.js");

/**
 * Check if LMStudio is running and has a model loaded
 */
async function checkLMStudioReady(lmstudioUrl) {
  try {
    const client = new LMStudioClient(lmstudioUrl);
    const modelInfo = await client.getModelInfo();

    if (!modelInfo) {
      return {
        ready: false,
        reason: "No model loaded in LMStudio",
        suggestion: "Load a model in LMStudio and try again",
      };
    }

    return {
      ready: true,
      model: modelInfo.name,
      context: modelInfo.context,
    };
  } catch (error) {
    return {
      ready: false,
      reason: "Cannot connect to LMStudio",
      suggestion: "Start LMStudio server and try again",
      error: error.message,
    };
  }
}

/**
 * Make a request through anyclaude proxy
 */
async function makeAnyclaudeRequest({ prompt, lmstudioUrl, timeout = 120000 }) {
  const startTime = Date.now();

  try {
    // Make request to LMStudio via OpenAI-compatible API
    const response = await fetch(`${lmstudioUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "current-model",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: false,
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    const endTime = Date.now();

    if (!response.ok) {
      throw new Error(
        `LMStudio error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    return {
      success: true,
      response: data.choices[0].message.content,
      usage: data.usage,
      timing: {
        total: endTime - startTime,
      },
    };
  } catch (error) {
    const endTime = Date.now();

    return {
      success: false,
      error: error.message,
      timing: {
        total: endTime - startTime,
      },
    };
  }
}

/**
 * Run a GenAI test with proper setup/teardown
 */
async function runGenAITest({
  name,
  testFn,
  skipIfNoModel = true,
  lmstudioUrl = "http://localhost:1234/v1",
}) {
  console.log(`\nTesting: ${name}...`);

  // Check prerequisites
  const status = await checkLMStudioReady(lmstudioUrl);

  if (!status.ready) {
    if (skipIfNoModel) {
      console.log(`⚠️  Skipped: ${status.reason}`);
      console.log(`   Suggestion: ${status.suggestion}`);
      return { skipped: true, reason: status.reason };
    } else {
      throw new Error(`Prerequisites not met: ${status.reason}`);
    }
  }

  console.log(`   Model: ${status.model}`);
  console.log(`   Context: ${status.context} tokens`);

  // Run the test
  try {
    const result = await testFn({ lmstudioUrl, modelInfo: status });

    console.log(`✓ ${name} passed`);
    return {
      passed: true,
      ...result,
    };
  } catch (error) {
    console.log(`✗ ${name} failed: ${error.message}`);
    return {
      passed: false,
      error: error.message,
    };
  }
}

module.exports = {
  checkLMStudioReady,
  makeAnyclaudeRequest,
  runGenAITest,
};
