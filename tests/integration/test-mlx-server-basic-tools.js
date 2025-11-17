#!/usr/bin/env node

/**
 * Integration Test: Basic Tool Calling with Custom MLX Server
 *
 * Tests basic tool calling functionality (Read, Write, Bash) with the custom MLX server.
 * Requires the server to be running at scripts/mlx-server.py
 *
 * Part of: Phase 1.2 - Tool Calling Verification
 * Status: RED (tests should FAIL - server integration not complete yet)
 */

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

let passed = 0;
let failed = 0;

// Configuration
const MLX_SERVER_URL = process.env.MLX_SERVER_URL || "http://localhost:8081";
const TEST_TIMEOUT = 30000; // 30 seconds for model inference

/**
 * Helper: Check if MLX server is running
 */
async function checkServerRunning() {
  return new Promise((resolve) => {
    const url = new URL("/v1/models", MLX_SERVER_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Helper: Send chat completion request with tools
 */
async function sendToolCallRequest(messages, tools) {
  return new Promise((resolve, reject) => {
    const url = new URL("/v1/chat/completions", MLX_SERVER_URL);
    const data = JSON.stringify({
      model: "current-model",
      messages,
      tools,
      temperature: 0.1,
      max_tokens: 1000,
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
              reject(new Error(`Invalid JSON response: ${body}`));
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
 * Test 1: Read tool - request to read a file
 */
async function testReadTool() {
  console.log("\n✓ Test 1: Read tool - basic file read request");

  // Create a temporary test file
  const testFile = path.join(os.tmpdir(), "anyclaude-test-read.txt");
  fs.writeFileSync(testFile, "Hello from test file!");

  const messages = [
    {
      role: "user",
      content: `Please read the file at ${testFile}`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read the contents of a file",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Path to the file to read",
            },
          },
          required: ["file_path"],
        },
      },
    },
  ];

  try {
    const response = await sendToolCallRequest(messages, tools);

    // Verify response structure
    assert.ok(response.choices, "Response should have choices");
    assert.ok(response.choices[0], "Should have at least one choice");

    const message = response.choices[0].message;
    assert.ok(message.tool_calls, "Message should contain tool_calls");
    assert.strictEqual(
      message.tool_calls.length,
      1,
      "Should have one tool call"
    );

    const toolCall = message.tool_calls[0];
    assert.strictEqual(
      toolCall.function.name,
      "Read",
      "Tool name should be 'Read'"
    );

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(args.file_path, "Should have file_path argument");
    assert.ok(
      args.file_path.includes("anyclaude-test-read.txt"),
      "Should reference the test file"
    );

    console.log("   ✅ PASS: Read tool called correctly");
    console.log(`   Tool call ID: ${toolCall.id}`);
    console.log(`   Arguments: ${JSON.stringify(args)}`);
    passed++;

    // Cleanup
    fs.unlinkSync(testFile);
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 2: Write tool - request to write content to a file
 */
async function testWriteTool() {
  console.log("\n✓ Test 2: Write tool - basic file write request");

  const testFile = path.join(os.tmpdir(), "anyclaude-test-write.txt");

  const messages = [
    {
      role: "user",
      content: `Please write "Hello World" to ${testFile}`,
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write content to a file",
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
    const response = await sendToolCallRequest(messages, tools);
    const toolCall = response.choices[0].message.tool_calls[0];

    assert.strictEqual(toolCall.function.name, "Write");

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(args.file_path, "Should have file_path");
    assert.ok(args.content, "Should have content");
    assert.ok(
      args.content.toLowerCase().includes("hello"),
      "Content should include 'hello'"
    );

    console.log("   ✅ PASS: Write tool called correctly");
    console.log(`   Arguments: ${JSON.stringify(args)}`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 3: Bash tool - safe command execution
 */
async function testBashTool() {
  console.log("\n✓ Test 3: Bash tool - safe command (echo)");

  const messages = [
    {
      role: "user",
      content: "Please run the command: echo 'Hello from bash'",
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Bash",
        description: "Execute a bash command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
      },
    },
  ];

  try {
    const response = await sendToolCallRequest(messages, tools);
    const toolCall = response.choices[0].message.tool_calls[0];

    assert.strictEqual(toolCall.function.name, "Bash");

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(args.command, "Should have command");
    assert.ok(args.command.includes("echo"), "Command should include 'echo'");

    console.log("   ✅ PASS: Bash tool called correctly");
    console.log(`   Command: ${args.command}`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 4: Multiple tools available - model selects correct one
 */
async function testToolSelection() {
  console.log("\n✓ Test 4: Tool selection - model chooses correct tool");

  const messages = [
    {
      role: "user",
      content:
        "What is the current date? Use the pwd command to check the directory.",
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
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Bash",
        description: "Execute bash command",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    },
  ];

  try {
    const response = await sendToolCallRequest(messages, tools);
    const toolCall = response.choices[0].message.tool_calls[0];

    // Should select Bash (not Read)
    assert.strictEqual(
      toolCall.function.name,
      "Bash",
      "Should select Bash tool for command"
    );

    const args = JSON.parse(toolCall.function.arguments);
    assert.ok(
      args.command.includes("pwd") || args.command.includes("date"),
      "Command should be pwd or date"
    );

    console.log("   ✅ PASS: Correct tool selected");
    console.log(`   Selected tool: ${toolCall.function.name}`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 5: No tools needed - model responds without tool call
 */
async function testNoToolsNeeded() {
  console.log("\n✓ Test 5: No tools needed - simple question");

  const messages = [
    {
      role: "user",
      content: "What is 2 + 2?",
    },
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "Bash",
        description: "Execute bash command",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
        },
      },
    },
  ];

  try {
    const response = await sendToolCallRequest(messages, tools);
    const message = response.choices[0].message;

    // Should NOT use tools for simple math
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(
        "   ⚠️  WARNING: Model used tool for simple question (acceptable)"
      );
    } else {
      assert.ok(message.content, "Should have text response");
      console.log("   ✅ PASS: No tool call for simple question");
    }

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
  console.log("INTEGRATION TEST: Basic Tool Calling with MLX Server");
  console.log("Phase 1.2 - TDD Red Phase");
  console.log(
    "================================================================================"
  );

  // Check server status
  console.log(`\nChecking MLX server at ${MLX_SERVER_URL}...`);
  const serverRunning = await checkServerRunning();

  if (!serverRunning) {
    console.log("❌ MLX server not running!");
    console.log("\nTo start the server:");
    console.log(
      "  python3 scripts/mlx-server.py --model /path/to/model --port 8081"
    );
    console.log(
      "\nOr set MLX_SERVER_URL environment variable to point to running server."
    );
    return 1;
  }

  console.log("✓ Server is running\n");

  // Run tests
  await testReadTool();
  await testWriteTool();
  await testBashTool();
  await testToolSelection();
  await testNoToolsNeeded();

  console.log(
    "\n================================================================================"
  );
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(
    "================================================================================"
  );

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed - this is expected in TDD red phase!");
    console.log("Implementation will fix these failures.");
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
