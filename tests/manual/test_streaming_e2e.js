#!/usr/bin/env node
/**
 * Streaming End-to-End Test
 *
 * Tests streaming responses (what Claude Code actually uses):
 * 1. Start anyclaude proxy
 * 2. Send a message with stream=true
 * 3. Receive Server-Sent Events (SSE) stream
 * 4. Verify stream completes without hanging
 *
 * This is the REAL test - Claude Code uses streaming, not JSON responses!
 */

const http = require("http");
const { spawn } = require("child_process");

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🌊 Streaming End-to-End Test");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let proxyProcess;
let proxyURL;

function startProxy() {
  return new Promise((resolve, reject) => {
    console.log("1️⃣  Starting anyclaude proxy...");

    proxyProcess = spawn("node", ["dist/main.js"], {
      env: {
        ...process.env,
        PROXY_ONLY: "true",
        ANYCLAUDE_DEBUG: "2", // Verbose debug
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    proxyProcess.stdout.on("data", (data) => {
      output += data.toString();
      process.stdout.write(data);

      const match = output.match(/proxy.*?(http:\/\/[^\s]+)/i);
      if (match && !proxyURL) {
        proxyURL = match[1];
        console.log(`   ✓ Proxy started: ${proxyURL}\n`);
        setTimeout(() => resolve(), 1000);
      }
    });

    proxyProcess.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    proxyProcess.on("error", reject);

    setTimeout(() => {
      if (!proxyURL) {
        reject(new Error("Proxy failed to start within 10 seconds"));
      }
    }, 10000);
  });
}

function sendStreamingRequest() {
  return new Promise((resolve, reject) => {
    console.log("2️⃣  Sending STREAMING request: 'Count to 5'...\n");

    const url = new URL(proxyURL);
    const payload = JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 100,
      stream: true, // THIS IS THE KEY DIFFERENCE
      messages: [
        {
          role: "user",
          content: "Count from 1 to 5, one number per line",
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
      let eventCount = 0;
      let buffer = "";
      let receivedText = "";
      let lastEventTime = Date.now();
      let streamEnded = false;

      console.log(`   Status: ${res.statusCode}`);
      console.log(
        `   Content-Type: ${res.headers["content-type"]}\n`
      );

      if (!res.headers["content-type"]?.includes("text/event-stream")) {
        reject(
          new Error(
            `Expected text/event-stream, got: ${res.headers["content-type"]}`
          )
        );
        return;
      }

      console.log("   📡 Receiving stream...\n");

      // Check for stream stalling (no data for 5 seconds)
      const stallCheck = setInterval(() => {
        const timeSinceLastEvent = Date.now() - lastEventTime;
        if (timeSinceLastEvent > 5000 && !streamEnded) {
          clearInterval(stallCheck);
          req.destroy();
          reject(
            new Error(
              `Stream stalled! No events for ${timeSinceLastEvent}ms`
            )
          );
        }
      }, 1000);

      res.on("data", (chunk) => {
        lastEventTime = Date.now();
        buffer += chunk.toString();

        // Process complete events (separated by \n\n)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        events.forEach((eventData) => {
          if (!eventData.trim()) return;

          eventCount++;
          const lines = eventData.split("\n");
          let eventType = "unknown";
          let data = null;

          lines.forEach((line) => {
            if (line.startsWith("event:")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data:")) {
              try {
                data = JSON.parse(line.slice(6).trim());
              } catch (e) {
                // Ignore parse errors
              }
            }
          });

          console.log(`   [${eventCount}] ${eventType}`);

          // Extract text from content_block_delta events
          if (
            eventType === "content_block_delta" &&
            data?.delta?.type === "text_delta"
          ) {
            const text = data.delta.text;
            receivedText += text;
            process.stdout.write(`      "${text}"`);
          }

          // Check for stream end
          if (eventType === "message_stop") {
            streamEnded = true;
            clearInterval(stallCheck);
          }
        });
      });

      res.on("end", () => {
        clearInterval(stallCheck);
        console.log("\n");

        if (!streamEnded) {
          reject(
            new Error(
              "Stream ended without message_stop event (incomplete)"
            )
          );
          return;
        }

        console.log(`   ✓ Stream completed successfully`);
        console.log(`   ✓ Received ${eventCount} events`);
        console.log(
          `   ✓ Text: "${receivedText.trim()}"\n`
        );

        resolve({
          eventCount,
          receivedText: receivedText.trim(),
          streamEnded,
        });
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

function cleanup() {
  console.log("3️⃣  Cleaning up...");
  if (proxyProcess) {
    proxyProcess.kill();
    console.log("   ✓ Proxy stopped\n");
  }
}

async function run() {
  try {
    await startProxy();
    const result = await sendStreamingRequest();

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ STREAMING TEST PASSED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `Events received: ${result.eventCount}`
    );
    console.log(`Stream ended cleanly: ${result.streamEnded}`);
    console.log(`Full response: "${result.receivedText}"`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cleanup();
    process.exit(0);
  } catch (error) {
    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ STREAMING TEST FAILED");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(`\nError: ${error.message}\n`);
    console.error("This is likely the freeze issue you're experiencing!");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    cleanup();
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n\nTest interrupted by user");
  cleanup();
  process.exit(1);
});

run();
