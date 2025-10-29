#!/usr/bin/env node
/**
 * Stream Truncation Regression Test Script
 * Tests whether SSE responses are truncated mid-stream
 *
 * Usage: node scripts/test/stream-truncation.mjs <proxy_port>
 * Example: node scripts/test/stream-truncation.mjs 58589
 */

import http from "http";
import * as fs from "fs";

const PROXY_PORT = parseInt(process.argv[2] || "8000", 10);
const TEMP_DIR = "/tmp/stream-tests";

// Create temp directory
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log(`🧪 Stream Truncation Regression Tests`);
console.log(`${"━".repeat(50)}`);
console.log(`Testing proxy at: localhost:${PROXY_PORT}\n`);

// Test colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

// Test counter
let passed = 0;
let failed = 0;
let total = 0;

/**
 * Makes an HTTP request to the proxy and validates the streaming response
 */
function testStream(testName, prompt, minSize = 0) {
  return new Promise((resolve) => {
    total++;
    console.log(`\n📝 Test ${total}: ${testName}`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);

    const requestBody = JSON.stringify({
      model: "current-model",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    const options = {
      hostname: "localhost",
      port: PROXY_PORT,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    let responseData = "";
    let eventCount = 0;
    let chunkCount = 0;
    let lastEvent = "";
    let hasMessageStop = false;

    const req = http.request(options, (res) => {
      // Check response headers
      const contentType = res.headers["content-type"];
      const accelBuffering = res.headers["x-accel-buffering"];

      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Content-Type: ${contentType}`);
      if (accelBuffering) {
        console.log(`   X-Accel-Buffering: ${accelBuffering}`);
      }

      res.on("data", (chunk) => {
        chunkCount++;
        responseData += chunk.toString("utf-8");

        // Count events
        const eventMatches = chunk.toString().match(/^event: /gm);
        if (eventMatches) {
          eventCount += eventMatches.length;
        }

        // Track last event
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            lastEvent = line.replace("event: ", "").trim();
            if (lastEvent === "message_stop") {
              hasMessageStop = true;
            }
          }
        }
      });

      res.on("end", () => {
        const responseSize = responseData.length;
        const success = hasMessageStop && eventCount > 0;

        if (success) {
          console.log(`${colors.green}✅ PASS${colors.reset}`);
          console.log(`   Events: ${eventCount}`);
          console.log(`   Chunks: ${chunkCount}`);
          console.log(`   Size: ${responseSize} bytes`);
          console.log(`   Last event: ${lastEvent}`);
          passed++;
        } else {
          console.log(`${colors.red}❌ FAIL${colors.reset}`);
          console.log(`   Events: ${eventCount}`);
          console.log(`   Chunks: ${chunkCount}`);
          console.log(`   Size: ${responseSize} bytes`);
          console.log(`   Last event: ${lastEvent}`);
          if (!hasMessageStop) {
            console.log(`   Missing: message_stop event`);
          }
          failed++;
        }

        if (minSize > 0 && responseSize < minSize) {
          console.log(
            `   ${colors.yellow}⚠️  WARNING: Response smaller than expected (expected >${minSize} bytes)${colors.reset}`
          );
          failed++;
        }

        resolve({ success, responseSize, eventCount });
      });

      res.on("error", (err) => {
        console.log(`${colors.red}❌ ERROR: ${err.message}${colors.reset}`);
        failed++;
        resolve({ success: false, responseSize: 0, eventCount: 0 });
      });
    });

    req.on("error", (err) => {
      console.log(
        `${colors.red}❌ CONNECTION ERROR: ${err.message}${colors.reset}`
      );
      failed++;
      resolve({ success: false, responseSize: 0, eventCount: 0 });
    });

    req.write(requestBody);
    req.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!hasMessageStop) {
        console.log(
          `${colors.red}❌ TIMEOUT (30s) - Response never completed${colors.reset}`
        );
        failed++;
      }
    }, 30000);
  });
}

/**
 * Run all tests
 */
async function runTests() {
  console.log(`🔍 Running regression tests...\n`);

  await testStream("Short response", "Say 'hello' in one word.", 10);
  await new Promise((r) => setTimeout(r, 2000));

  await testStream("Medium response", "List 5 programming languages.", 100);
  await new Promise((r) => setTimeout(r, 2000));

  await testStream(
    "Long response",
    "Write a detailed explanation of what machine learning is, including supervised learning, unsupervised learning, and reinforcement learning.",
    500
  );

  // Summary
  console.log(`\n${"━".repeat(50)}`);
  console.log(`📊 Test Summary`);
  console.log(`${"━".repeat(50)}`);
  console.log(`Total: ${total}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

  if (failed === 0) {
    console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}❌ Some tests failed!${colors.reset}`);
    console.log(`\n💡 Debugging tips:`);
    console.log(
      `  - Check vLLM-MLX server logs: tail -f ~/.anyclaude/logs/vllm-mlx-server.log`
    );
    console.log(
      `  - Run with debug logging: ANYCLAUDE_DEBUG=2 bun run src/main.ts`
    );
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
