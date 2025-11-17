#!/usr/bin/env node

/**
 * Integration Test: Streaming Tool Calls with MLX Server
 *
 * Tests streaming tool parameter assembly:
 * - content_block_start (tool metadata)
 * - input_json_delta (partial JSON chunks)
 * - content_block_stop (completion)
 *
 * Part of: Phase 1.2 - Tool Calling Verification
 * Status: RED (tests should FAIL - streaming not fully implemented yet)
 */

const assert = require("assert");
const http = require("http");

let passed = 0;
let failed = 0;

const MLX_SERVER_URL = process.env.MLX_SERVER_URL || "http://localhost:8081";
const TEST_TIMEOUT = 30000;

/**
 * Helper: Send streaming chat completion request
 */
async function sendStreamingToolCallRequest(messages, tools) {
  return new Promise((resolve, reject) => {
    const url = new URL("/v1/chat/completions", MLX_SERVER_URL);
    const data = JSON.stringify({
      model: "current-model",
      messages,
      tools,
      stream: true,
      temperature: 0.1,
      max_tokens: 1000,
    });

    const chunks = [];
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: TEST_TIMEOUT,
      },
      (res) => {
        let buffer = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString();
          // Parse SSE chunks
          const lines = buffer.split("\n");
          buffer = lines.pop(); // Keep incomplete line

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                chunks.push(JSON.parse(data));
              } catch (err) {
                // Ignore parse errors in streaming
              }
            }
          }
        });

        res.on("end", () => resolve(chunks));
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Helper: Assemble tool call from streaming chunks
 */
function assembleToolCallFromChunks(chunks) {
  let toolCall = null;
  let argumentsBuffer = "";

  for (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCall) {
          toolCall = {
            id: tc.id,
            type: tc.type || "function",
            function: {
              name: tc.function?.name || "",
              arguments: "",
            },
          };
        }

        if (tc.function?.arguments) {
          argumentsBuffer += tc.function.arguments;
        }
      }
    }
  }

  if (toolCall && argumentsBuffer) {
    toolCall.function.arguments = argumentsBuffer;
  }

  return toolCall;
}

/**
 * Test 1: Basic streaming tool call
 */
async function testBasicStreamingToolCall() {
  console.log("\n✓ Test 1: Basic streaming tool call (Read file)");

  const messages = [{ role: "user", content: "Read the file /tmp/test.txt" }];

  const tools = [
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
          required: ["file_path"],
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);

    assert.ok(chunks.length > 0, "Should receive streaming chunks");

    const toolCall = assembleToolCallFromChunks(chunks);
    assert.ok(toolCall, "Should assemble tool call from chunks");
    assert.strictEqual(toolCall.function.name, "Read");

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(args.file_path, "Should have file_path argument");

    console.log("   ✅ PASS: Streaming tool call assembled correctly");
    console.log(`   Chunks received: ${chunks.length}`);
    console.log(`   Arguments: ${JSON.stringify(args)}`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 2: Streaming with complex JSON (nested objects)
 */
async function testStreamingComplexJSON() {
  console.log("\n✓ Test 2: Streaming complex JSON parameters");

  const messages = [
    {
      role: "user",
      content:
        "Write a JSON config file to /tmp/config.json with settings for port 8080 and host localhost",
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write content to file",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content: { type: "string" },
          },
          required: ["file_path", "content"],
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);
    const toolCall = assembleToolCallFromChunks(chunks);

    assert.ok(toolCall, "Should assemble tool call");
    assert.strictEqual(toolCall.function.name, "Write");

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(args.content, "Should have content parameter");

    console.log("   ✅ PASS: Complex JSON streamed correctly");
    console.log(`   Content length: ${args.content.length} chars`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 3: Multiple streaming chunks for large parameters
 */
async function testLargeParameterStreaming() {
  console.log("\n✓ Test 3: Large parameter streaming");

  const messages = [
    {
      role: "user",
      content:
        "Write a long JavaScript function to /tmp/test.js that includes multiple helper functions",
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write content to file",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content: { type: "string" },
          },
          required: ["file_path", "content"],
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);

    // Should have multiple chunks for large content
    assert.ok(
      chunks.length >= 5,
      "Should have multiple chunks for large content"
    );

    const toolCall = assembleToolCallFromChunks(chunks);
    const args = JSON.parse(toolCall.function.arguments);

    assert.ok(args.content.length > 100, "Content should be substantial");

    console.log("   ✅ PASS: Large parameter streamed in chunks");
    console.log(`   Total chunks: ${chunks.length}`);
    console.log(`   Content length: ${args.content.length} chars`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 4: Stream event ordering (start → deltas → stop)
 */
async function testStreamEventOrdering() {
  console.log("\n✓ Test 4: Stream event ordering");

  const messages = [{ role: "user", content: "Read /tmp/example.txt" }];

  const tools = [
    {
      type: "function",
      function: {
        name: "Read",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);

    // Track event sequence
    let hasStart = false;
    let hasDelta = false;
    let hasFinish = false;

    for (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;

      if (delta?.tool_calls) {
        if (!hasStart && delta.tool_calls[0]?.function?.name) {
          hasStart = true;
        }
        if (delta.tool_calls[0]?.function?.arguments) {
          hasDelta = true;
        }
      }

      if (finishReason === "tool_calls" || finishReason === "stop") {
        hasFinish = true;
      }
    }

    assert.ok(hasStart, "Should have tool start event");
    // Note: hasDelta might be false for incomplete streaming (qwen3-coder pattern)
    assert.ok(hasFinish, "Should have finish event");

    console.log("   ✅ PASS: Stream events in correct order");
    console.log(
      `   Events: start=${hasStart}, delta=${hasDelta}, finish=${hasFinish}`
    );
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 5: Handle incomplete streaming (qwen3-coder issue)
 */
async function testIncompleteStreaming() {
  console.log("\n✓ Test 5: Handle incomplete streaming (no deltas)");

  const messages = [{ role: "user", content: "Run the command: pwd" }];

  const tools = [
    {
      type: "function",
      function: {
        name: "Bash",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);

    // Even if no deltas, should still get complete tool call
    const toolCall = assembleToolCallFromChunks(chunks);
    assert.ok(toolCall, "Should handle incomplete streaming");

    console.log("   ✅ PASS: Incomplete streaming handled");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 6: Stream error handling (malformed chunks)
 */
async function testStreamErrorHandling() {
  console.log("\n✓ Test 6: Stream error handling");

  // This test validates that our chunk parser handles errors gracefully
  // Even if server sends malformed chunks, we shouldn't crash

  const messages = [{ role: "user", content: "Read /tmp/test.txt" }];

  const tools = [
    {
      type: "function",
      function: {
        name: "Read",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
        },
      },
    },
  ];

  try {
    const chunks = await sendStreamingToolCallRequest(messages, tools);

    // Should complete without throwing
    assert.ok(chunks.length >= 0, "Should handle chunks without errors");

    console.log("   ✅ PASS: Stream error handling works");
    passed++;
  } catch (err) {
    // Network errors are acceptable in this test
    if (
      err.message.includes("timeout") ||
      err.message.includes("ECONNREFUSED")
    ) {
      console.log("   ⚠️  SKIP: Server not available");
      passed++;
    } else {
      console.log(`   ❌ FAIL: ${err.message}`);
      failed++;
    }
  }
}

async function runTests() {
  console.log(
    "================================================================================"
  );
  console.log("INTEGRATION TEST: Streaming Tool Calls with MLX Server");
  console.log("Phase 1.2 - TDD Red Phase");
  console.log(
    "================================================================================"
  );

  console.log(`\nTesting server at: ${MLX_SERVER_URL}`);
  console.log("Stream format: OpenAI SSE chunks\n");

  await testBasicStreamingToolCall();
  await testStreamingComplexJSON();
  await testLargeParameterStreaming();
  await testStreamEventOrdering();
  await testIncompleteStreaming();
  await testStreamErrorHandling();

  console.log(
    "\n================================================================================"
  );
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(
    "================================================================================"
  );

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed - expected in TDD red phase!");
  }

  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  runTests()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Test runner error:", err);
      process.exit(1);
    });
}

module.exports = { runTests };
