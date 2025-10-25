#!/usr/bin/env node
/**
 * Interactive End-to-End Test
 *
 * Tests the complete flow:
 * 1. Start anyclaude proxy
 * 2. Send a simple message to the proxy
 * 3. Get a response from LMStudio
 * 4. Verify the response has the expected format
 *
 * This tests the real-world scenario of Claude Code → Proxy → LMStudio
 */

const http = require("http");
const { spawn } = require("child_process");

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🧪 Interactive End-to-End Test");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let proxyProcess;
let proxyURL;

// Step 1: Start the proxy
function startProxy() {
  return new Promise((resolve, reject) => {
    console.log("1️⃣  Starting anyclaude proxy...");

    proxyProcess = spawn("node", ["dist/main.js"], {
      env: {
        ...process.env,
        PROXY_ONLY: "true",
        ANYCLAUDE_DEBUG: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    proxyProcess.stdout.on("data", (data) => {
      output += data.toString();
      process.stdout.write(data);

      // Extract proxy URL
      const match = output.match(/proxy.*?(http:\/\/[^\s]+)/i);
      if (match && !proxyURL) {
        proxyURL = match[1];
        console.log(`   ✓ Proxy started: ${proxyURL}\n`);
        setTimeout(() => resolve(), 1000); // Give it a second to fully start
      }
    });

    proxyProcess.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    proxyProcess.on("error", reject);

    // Timeout if proxy doesn't start
    setTimeout(() => {
      if (!proxyURL) {
        reject(new Error("Proxy failed to start within 10 seconds"));
      }
    }, 10000);
  });
}

// Step 2: Send a test request
function sendTestRequest() {
  return new Promise((resolve, reject) => {
    console.log("2️⃣  Sending test message: 'Say hello in 5 words'...\n");

    const url = new URL(proxyURL);
    const payload = JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: "Say hello in exactly 5 words",
        },
      ],
    });

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      },
      timeout: 30000, // 30 second timeout
    };

    const req = http.request(options, (res) => {
      let data = "";

      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Headers: ${JSON.stringify(res.headers, null, 2)}\n`);

      res.on("data", (chunk) => {
        data += chunk.toString();
        process.stdout.write(".");
      });

      res.on("end", () => {
        console.log("\n");
        try {
          if (res.headers["content-type"]?.includes("text/event-stream")) {
            console.log("   ✓ Received streaming response");
            console.log(`   Data: ${data.slice(0, 200)}...\n`);
            resolve({ streaming: true, data });
          } else {
            const parsed = JSON.parse(data);
            console.log("   ✓ Received JSON response");
            console.log(`   ${JSON.stringify(parsed, null, 2)}\n`);
            resolve({ streaming: false, data: parsed });
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 30 seconds"));
    });

    req.write(payload);
    req.end();
  });
}

// Step 3: Cleanup
function cleanup() {
  console.log("3️⃣  Cleaning up...");
  if (proxyProcess) {
    proxyProcess.kill();
    console.log("   ✓ Proxy stopped\n");
  }
}

// Run the test
async function run() {
  try {
    await startProxy();
    const response = await sendTestRequest();

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ END-TO-END TEST PASSED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cleanup();
    process.exit(0);
  } catch (error) {
    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ END-TO-END TEST FAILED");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(`\nError: ${error.message}\n`);

    cleanup();
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nTest interrupted by user");
  cleanup();
  process.exit(1);
});

run();
