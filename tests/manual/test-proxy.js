#!/usr/bin/env node
/**
 * Test script for anyclaude proxy debugging
 */

const https = require("https");
const http = require("http");

async function testProxy(proxyUrl) {
  console.log("[Test] Testing proxy at:", proxyUrl);

  const url = new URL(proxyUrl + "/v1/messages");
  const requestBody = JSON.stringify({
    model: "claude-sonnet-4", // Will be routed to LMStudio via failover
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Say hello in exactly 3 words" }],
      },
    ],
    stream: true,
  });

  console.log("[Test] Request body:", requestBody.substring(0, 200));

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          "anthropic-version": "2023-06-01",
          "x-api-key": "test-key",
        },
      },
      (res) => {
        console.log("[Test] Response status:", res.statusCode);
        console.log("[Test] Response headers:", res.headers);

        let chunkCount = 0;
        res.on("data", (chunk) => {
          chunkCount++;
          const data = chunk.toString();
          console.log(`[Test] Chunk ${chunkCount}:`, data.substring(0, 200));
        });

        res.on("end", () => {
          console.log(`[Test] Response complete. Total chunks: ${chunkCount}`);
          resolve();
        });
      }
    );

    req.on("error", (error) => {
      console.error("[Test] Request error:", error);
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
}

// Get proxy URL from command line or use default
const proxyUrl = process.argv[2] || "http://localhost:61485";

console.log("[Test] Starting proxy test...\n");
testProxy(proxyUrl)
  .then(() => {
    console.log("\n[Test] ✓ Test complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n[Test] ✗ Test failed:", error);
    process.exit(1);
  });
