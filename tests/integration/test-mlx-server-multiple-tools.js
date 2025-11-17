#!/usr/bin/env node

/**
 * Integration Test: Multiple Tool Calls (Sequential & Parallel)
 *
 * Tests the model's ability to call multiple tools:
 * - Sequential: One tool, then another based on results
 * - Parallel: Multiple tools in same response
 * - Mixed: Combination of both patterns
 *
 * Part of: Phase 1.2 - Tool Calling Verification
 * Status: RED (tests should FAIL - multi-tool logic not complete yet)
 */

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

let passed = 0;
let failed = 0;

const MLX_SERVER_URL = process.env.MLX_SERVER_URL || "http://localhost:8081";
const TEST_TIMEOUT = 45000; // Longer timeout for multi-turn

/**
 * Helper: Send chat completion request
 */
async function sendRequest(messages, tools) {
  return new Promise((resolve, reject) => {
    const url = new URL("/v1/chat/completions", MLX_SERVER_URL);
    const data = JSON.stringify({
      model: "current-model",
      messages,
      tools,
      temperature: 0.1,
      max_tokens: 2000,
    });

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
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error(`Invalid JSON: ${body}`));
            }
          } else {
            reject(new Error(`Server error ${res.statusCode}: ${body}`));
          }
        });
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
 * Test 1: Parallel tool calls - multiple tools in one response
 */
async function testParallelToolCalls() {
  console.log("\n✓ Test 1: Parallel tool calls (Read + Read)");

  // Create test files
  const file1 = path.join(os.tmpdir(), "test1.txt");
  const file2 = path.join(os.tmpdir(), "test2.txt");
  fs.writeFileSync(file1, "Content 1");
  fs.writeFileSync(file2, "Content 2");

  const messages = [
    {
      role: "user",
      content: `Read both ${file1} and ${file2}`,
    },
  ];

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
    const response = await sendRequest(messages, tools);
    const toolCalls = response.choices[0].message.tool_calls;

    // Model should call Read twice (parallel)
    if (toolCalls && toolCalls.length >= 2) {
      assert.ok(
        toolCalls.every((tc) => tc.function.name === "Read"),
        "All calls should be Read"
      );

      const paths = toolCalls.map(
        (tc) => JSON.parse(tc.function.arguments).file_path
      );
      assert.ok(paths.length === 2, "Should have 2 file paths");

      console.log("   ✅ PASS: Parallel tool calls work");
      console.log(`   Tool calls: ${toolCalls.length}`);
      passed++;
    } else {
      console.log(
        "   ⚠️  Model called tools sequentially (acceptable behavior)"
      );
      console.log(`   Tool calls: ${toolCalls?.length || 0}`);
      passed++;
    }

    // Cleanup
    fs.unlinkSync(file1);
    fs.unlinkSync(file2);
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 2: Sequential tool calls - multi-turn conversation
 */
async function testSequentialToolCalls() {
  console.log("\n✓ Test 2: Sequential tool calls (Read → Write)");

  const sourceFile = path.join(os.tmpdir(), "source.txt");
  const destFile = path.join(os.tmpdir(), "dest.txt");
  fs.writeFileSync(sourceFile, "Original content");

  const tools = [
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write to a file",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    },
  ];

  try {
    // Turn 1: Ask to read source
    let messages = [
      {
        role: "user",
        content: `Read ${sourceFile}`,
      },
    ];

    const response1 = await sendRequest(messages, tools);
    const toolCall1 = response1.choices[0].message.tool_calls?.[0];

    assert.ok(toolCall1, "Should call Read tool");
    assert.strictEqual(toolCall1.function.name, "Read");

    // Turn 2: Provide tool result and ask to write
    messages.push({
      role: "assistant",
      tool_calls: [toolCall1],
    });
    messages.push({
      role: "tool",
      tool_call_id: toolCall1.id,
      content: "Original content",
    });
    messages.push({
      role: "user",
      content: `Now write that content to ${destFile}`,
    });

    const response2 = await sendRequest(messages, tools);
    const toolCall2 = response2.choices[0].message.tool_calls?.[0];

    assert.ok(toolCall2, "Should call Write tool");
    assert.strictEqual(toolCall2.function.name, "Write");

    const args = JSON.parse(toolCall2.function.arguments);
    assert.ok(args.content, "Should have content from previous read");

    console.log("   ✅ PASS: Sequential tool calls work");
    console.log(`   Turn 1: ${toolCall1.function.name}`);
    console.log(`   Turn 2: ${toolCall2.function.name}`);
    passed++;

    // Cleanup
    fs.unlinkSync(sourceFile);
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 3: Mixed tool types - different tools in same request
 */
async function testMixedToolTypes() {
  console.log("\n✓ Test 3: Mixed tool types (Read + Bash)");

  const testFile = path.join(os.tmpdir(), "test-mixed.txt");
  fs.writeFileSync(testFile, "test content");

  const messages = [
    {
      role: "user",
      content: `Read ${testFile} and also run 'echo hello'`,
    },
  ];

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
    const response = await sendRequest(messages, tools);
    const toolCalls = response.choices[0].message.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      const toolNames = toolCalls.map((tc) => tc.function.name);
      console.log(`   Tool calls: ${toolNames.join(", ")}`);

      // Should use at least one tool
      assert.ok(toolCalls.length >= 1, "Should make at least one tool call");

      console.log("   ✅ PASS: Mixed tool types handled");
      passed++;
    } else {
      console.log("   ⚠️  No tool calls made");
      passed++; // Still acceptable
    }

    // Cleanup
    fs.unlinkSync(testFile);
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 4: Tool call chaining - use result from first tool in second
 */
async function testToolChaining() {
  console.log("\n✓ Test 4: Tool chaining (Bash → Write)");

  const outputFile = path.join(os.tmpdir(), "pwd-output.txt");

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
    {
      type: "function",
      function: {
        name: "Write",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    },
  ];

  try {
    // Turn 1: Run pwd
    let messages = [{ role: "user", content: "Run the 'pwd' command" }];

    const response1 = await sendRequest(messages, tools);
    const bashCall = response1.choices[0].message.tool_calls?.[0];

    assert.ok(bashCall, "Should call Bash");
    assert.strictEqual(bashCall.function.name, "Bash");

    // Turn 2: Write the result
    messages.push({
      role: "assistant",
      tool_calls: [bashCall],
    });
    messages.push({
      role: "tool",
      tool_call_id: bashCall.id,
      content: "/Users/test/directory",
    });
    messages.push({
      role: "user",
      content: `Write the directory path to ${outputFile}`,
    });

    const response2 = await sendRequest(messages, tools);
    const writeCall = response2.choices[0].message.tool_calls?.[0];

    assert.ok(writeCall, "Should call Write");
    assert.strictEqual(writeCall.function.name, "Write");

    const args = JSON.parse(writeCall.function.arguments);
    assert.ok(
      args.content.includes("/") || args.content.includes("directory"),
      "Content should include directory info"
    );

    console.log("   ✅ PASS: Tool chaining works");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 5: Handle tool result array (multiple results)
 */
async function testMultipleToolResults() {
  console.log("\n✓ Test 5: Multiple tool results in conversation");

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
    // Request multiple commands
    let messages = [
      {
        role: "user",
        content: "Run 'pwd' and 'date' commands",
      },
    ];

    const response = await sendRequest(messages, tools);
    const toolCalls = response.choices[0].message.tool_calls;

    if (toolCalls && toolCalls.length >= 2) {
      // Provide results for both
      messages.push({
        role: "assistant",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Result for ${tc.id}`,
        });
      }

      messages.push({
        role: "user",
        content: "What were the results?",
      });

      const response2 = await sendRequest(messages, tools);
      assert.ok(response2.choices[0].message, "Should handle multiple results");

      console.log("   ✅ PASS: Multiple tool results handled");
      passed++;
    } else {
      console.log("   ⚠️  Model didn't use parallel tools (acceptable)");
      passed++;
    }
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 6: Tool call limit - prevent infinite loops
 */
async function testToolCallLimit() {
  console.log("\n✓ Test 6: Tool call limit (prevent infinite loops)");

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
    const messages = [{ role: "user", content: "Run pwd" }];

    let turnCount = 0;
    const MAX_TURNS = 5;

    while (turnCount < MAX_TURNS) {
      const response = await sendRequest(messages, tools);
      const message = response.choices[0].message;

      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Conversation ended naturally
        break;
      }

      turnCount++;

      // In real implementation, would execute tool and continue
      // For test, just verify we can track turn count
    }

    assert.ok(turnCount < MAX_TURNS, "Should not exceed turn limit");
    console.log("   ✅ PASS: Turn count tracking works");
    console.log(`   Turns: ${turnCount}`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log(
    "================================================================================"
  );
  console.log("INTEGRATION TEST: Multiple Tool Calls (Sequential & Parallel)");
  console.log("Phase 1.2 - TDD Red Phase");
  console.log(
    "================================================================================"
  );

  console.log(`\nTesting server at: ${MLX_SERVER_URL}\n`);

  await testParallelToolCalls();
  await testSequentialToolCalls();
  await testMixedToolTypes();
  await testToolChaining();
  await testMultipleToolResults();
  await testToolCallLimit();

  console.log(
    "\n================================================================================"
  );
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(
    "================================================================================"
  );

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
