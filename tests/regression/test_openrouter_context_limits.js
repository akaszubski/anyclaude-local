/**
 * Regression Tests: OpenRouter Context Limit Detection
 *
 * These tests prevent regression of the context limit detection bugs
 * found during OpenRouter integration (2025-11-17).
 *
 * Issues covered:
 * - Issue #3: Context limit using wrong model name (body.model vs config model)
 * - Issue #4: Missing OpenRouter model IDs in context limits table
 */

// Import the compiled module
const contextManager = require('../../dist/context-manager.js');
const getContextLimit = contextManager.getContextLimit;

console.log("\n" + "=".repeat(80));
console.log("OPENROUTER CONTEXT LIMIT REGRESSION TESTS");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

function test(description, expectedLimit, modelName) {
  const actualLimit = getContextLimit(modelName);
  if (actualLimit === expectedLimit) {
    console.log(`✓ ${description}: ${modelName} → ${actualLimit} tokens`);
    passed++;
  } else {
    console.log(`✗ ${description}: ${modelName}`);
    console.log(`  Expected: ${expectedLimit}, Got: ${actualLimit}`);
    failed++;
  }
}

// Test OpenRouter Model IDs
console.log("\n--- OpenRouter Model IDs ---");
test('Gemini 2.5 Flash Lite returns 1M context', 1048576, 'google/gemini-2.5-flash-lite');
test('Gemini 2.5 Flash returns 1M context', 1048576, 'google/gemini-2.5-flash');
test('Qwen3 Coder returns 262K context', 262144, 'qwen/qwen3-coder');
test('DeepSeek V3.1 returns 160K context', 163840, 'deepseek/deepseek-chat-v3.1');
test('GPT-4o returns 128K context', 128000, 'openai/gpt-4o');
test('GPT-4o Mini returns 128K context', 128000, 'openai/gpt-4o-mini');
test('Claude 3.5 Sonnet returns 200K context', 200000, 'anthropic/claude-3.5-sonnet');
test('Llama 3.3 70B returns 128K context', 131072, 'meta-llama/llama-3.3-70b-instruct');
test('GLM-4.6 returns 200K context', 204800, 'z-ai/glm-4.6');

// Test Claude Model Names (What Claude Code Sends)
console.log("\n--- Claude Model Names ---");
test('Claude Sonnet 4.5 returns 200K context', 200000, 'claude-sonnet-4-5-20250929');
test('Claude Haiku 4.5 returns 200K context', 200000, 'claude-haiku-4-5-20251001');
test('Claude 3.5 Sonnet returns 200K context', 200000, 'claude-3-5-sonnet-20241022');

// Test Fallback Behavior
console.log("\n--- Fallback Behavior ---");
test('Unknown model falls back to 32K', 32768, 'unknown-model-xyz-123');
test('Empty string falls back to 32K', 32768, '');

// Test All OpenRouter Models Are Not Falling Back to Default
console.log("\n--- OpenRouter Models Don't Use 32K Default ---");
const openrouterModels = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'qwen/qwen3-coder',
  'deepseek/deepseek-chat-v3.1',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.3-70b-instruct',
  'z-ai/glm-4.6',
];

openrouterModels.forEach(model => {
  const limit = getContextLimit(model);
  if (limit > 32768) {
    console.log(`✓ ${model} has explicit limit: ${limit} tokens`);
    passed++;
  } else {
    console.log(`✗ ${model} falling back to 32K default!`);
    failed++;
  }
});

// Test Issue #3: body.model vs config model
console.log("\n--- Regression: Issue #3 (body.model vs config model) ---");
const configModel = 'qwen/qwen3-coder'; // 262K
const bodyModel = 'claude-sonnet-4-5-20250929'; // 200K
const configLimit = getContextLimit(configModel);
const bodyLimit = getContextLimit(bodyModel);

if (configLimit === 262144 && bodyLimit === 200000 && configLimit !== bodyLimit) {
  console.log(`✓ body.model and config model recognized separately`);
  console.log(`  Config model (${configModel}): ${configLimit} tokens`);
  console.log(`  Body model (${bodyModel}): ${bodyLimit} tokens`);
  passed++;
} else {
  console.log(`✗ body.model and config model not working correctly`);
  failed++;
}

// Summary
console.log("\n" + "=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(80) + "\n");

if (failed > 0) {
  process.exit(1);
}
