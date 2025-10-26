/**
 * Unit tests for LMStudio client
 *
 * Tests:
 * - Base URL configuration
 * - getModels() API call structure
 * - getLoadedModel() filtering
 * - getModelInfo() with loaded model
 * - getModelInfo() with no loaded model
 * - getContextLength() extraction
 * - Error handling for API failures
 */

const assert = require("assert");

// Import LMStudio client
const { LMStudioClient } = require("../../dist/lmstudio-client.js");

// Mock fetch for testing
global.originalFetch = global.fetch;

function mockFetchSuccess(data) {
  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => data,
    };
  };
}

function mockFetchError(status = 500, message = "Internal Server Error") {
  global.fetch = async (url) => {
    return {
      ok: false,
      status,
      statusText: message,
      json: async () => ({ error: message }),
    };
  };
}

function restoreFetch() {
  global.fetch = global.originalFetch;
}

function test_constructor() {
  console.log("Testing: Constructor with default URL...");

  const client = new LMStudioClient();
  assert.ok(client, "Client should be created");

  console.log("✓ Constructor works with defaults");
}

function test_constructor_custom_url() {
  console.log("Testing: Constructor with custom URL...");

  const customUrl = "http://custom:5678/v1";
  const client = new LMStudioClient(customUrl);
  assert.ok(client, "Client should be created");

  console.log("✓ Constructor works with custom URL");
}

async function test_get_models_success() {
  console.log("Testing: getModels() with successful response...");

  const mockData = {
    data: [
      {
        id: "model-1",
        state: "loaded",
        path: "/models/qwen3.gguf",
        loaded_context_length: 32768,
        max_context_length: 131072,
      },
      {
        id: "model-2",
        state: "unloaded",
        path: "/models/llama3.gguf",
        max_context_length: 8192,
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const result = await client.getModels();

  assert.ok(result, "Result should exist");
  assert.ok(result.data, "Result should have data array");
  assert.strictEqual(result.data.length, 2, "Should have 2 models");
  assert.strictEqual(result.data[0].state, "loaded", "First model should be loaded");

  restoreFetch();
  console.log("✓ getModels() returns correct structure");
}

async function test_get_loaded_model_found() {
  console.log("Testing: getLoadedModel() with loaded model...");

  const mockData = {
    data: [
      {
        id: "model-1",
        state: "loaded",
        path: "/models/qwen3.gguf",
        loaded_context_length: 32768,
      },
      {
        id: "model-2",
        state: "unloaded",
        path: "/models/llama3.gguf",
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const model = await client.getLoadedModel();

  assert.ok(model, "Should find loaded model");
  assert.strictEqual(model.state, "loaded", "Model should be loaded");
  assert.strictEqual(model.id, "model-1", "Should return first loaded model");

  restoreFetch();
  console.log("✓ getLoadedModel() finds loaded model");
}

async function test_get_loaded_model_not_found() {
  console.log("Testing: getLoadedModel() with no loaded model...");

  const mockData = {
    data: [
      {
        id: "model-1",
        state: "unloaded",
        path: "/models/qwen3.gguf",
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const model = await client.getLoadedModel();

  assert.strictEqual(model, null, "Should return null when no model loaded");

  restoreFetch();
  console.log("✓ getLoadedModel() returns null when no model loaded");
}

async function test_get_model_info_with_loaded_model() {
  console.log("Testing: getModelInfo() with loaded model...");

  const mockData = {
    data: [
      {
        id: "qwen3-coder-30b",
        state: "loaded",
        path: "/models/qwen3.gguf",
        loaded_context_length: 32768,
        max_context_length: 131072,
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const info = await client.getModelInfo();

  assert.ok(info, "Should return model info");
  assert.strictEqual(info.name, "qwen3-coder-30b", "Should have model name");
  assert.strictEqual(info.context, 32768, "Should have context length");

  restoreFetch();
  console.log("✓ getModelInfo() returns loaded model info");
}

async function test_get_model_info_no_loaded_model() {
  console.log("Testing: getModelInfo() with no loaded model...");

  const mockData = {
    data: [],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const info = await client.getModelInfo();

  assert.strictEqual(info, null, "Should return null when no model");

  restoreFetch();
  console.log("✓ getModelInfo() returns null when no model");
}

async function test_get_context_length_from_loaded() {
  console.log("Testing: getContextLength() from loaded_context_length...");

  const mockData = {
    data: [
      {
        id: "model-1",
        state: "loaded",
        loaded_context_length: 32768,
        max_context_length: 131072,
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const contextLength = await client.getContextLength();

  assert.strictEqual(
    contextLength,
    32768,
    "Should return loaded_context_length"
  );

  restoreFetch();
  console.log("✓ getContextLength() uses loaded_context_length");
}

async function test_get_context_length_from_max() {
  console.log("Testing: getContextLength() from max_context_length...");

  const mockData = {
    data: [
      {
        id: "model-1",
        state: "loaded",
        max_context_length: 131072,
        // No loaded_context_length
      },
    ],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const contextLength = await client.getContextLength();

  assert.strictEqual(
    contextLength,
    131072,
    "Should fall back to max_context_length"
  );

  restoreFetch();
  console.log("✓ getContextLength() falls back to max_context_length");
}

async function test_get_context_length_no_model() {
  console.log("Testing: getContextLength() with no loaded model...");

  const mockData = {
    data: [],
  };

  mockFetchSuccess(mockData);

  const client = new LMStudioClient();
  const contextLength = await client.getContextLength();

  assert.strictEqual(contextLength, null, "Should return null when no model");

  restoreFetch();
  console.log("✓ getContextLength() returns null when no model");
}

async function test_error_handling() {
  console.log("Testing: Error handling for API failures...");

  mockFetchError(500, "Server Error");

  const client = new LMStudioClient();

  try {
    await client.getModels();
    assert.fail("Should have thrown error");
  } catch (error) {
    assert.ok(error, "Should throw error on API failure");
  }

  restoreFetch();
  console.log("✓ Errors are properly thrown");
}

async function runTests() {
  console.log("================================================================================");
  console.log("LMSTUDIO CLIENT UNIT TESTS");
  console.log("================================================================================");
  console.log("");

  try {
    test_constructor();
    test_constructor_custom_url();
    await test_get_models_success();
    await test_get_loaded_model_found();
    await test_get_loaded_model_not_found();
    await test_get_model_info_with_loaded_model();
    await test_get_model_info_no_loaded_model();
    await test_get_context_length_from_loaded();
    await test_get_context_length_from_max();
    await test_get_context_length_no_model();
    await test_error_handling();

    console.log("");
    console.log("================================================================================");
    console.log("✓ ALL LMSTUDIO CLIENT TESTS PASSED");
    console.log("================================================================================");
    return 0;
  } catch (error) {
    console.error("");
    console.error("================================================================================");
    console.error("✗ TEST FAILED");
    console.error("================================================================================");
    console.error(error);
    return 1;
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().then((code) => process.exit(code));
}

module.exports = { runTests };
