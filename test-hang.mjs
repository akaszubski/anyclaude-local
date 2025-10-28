#!/usr/bin/env node

import { spawn } from "child_process";
import http from "http";

console.log("Starting proxy with ANYCLAUDE_DEBUG=1...");

const proxy = spawn("bun", ["run", "src/main.ts"], {
  env: {
    ...process.env,
    ANYCLAUDE_DEBUG: "1",
    PROXY_ONLY: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let proxyUrl = null;
let startTime = Date.now();

// Capture proxy URL
proxy.stdout.on("data", (data) => {
  const output = data.toString();
  console.error("[Proxy Output]", output.trim());

  if (!proxyUrl && output.includes("Proxy URL:")) {
    const match = output.match(/Proxy URL: (http:\/\/localhost:\d+)/);
    if (match) {
      proxyUrl = match[1];
      console.error(`\n✓ Proxy started at ${proxyUrl}`);
      startTest();
    }
  }
});

proxy.stderr.on("data", (data) => {
  console.error("[Proxy Debug]", data.toString().trim());
});

async function startTest() {
  // Wait a moment for proxy to be fully ready
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n" + "=".repeat(60));
  console.log("Sending test request to proxy...");
  console.log("=".repeat(60) + "\n");

  const testStartTime = Date.now();

  const req = http.request(
    `${proxyUrl}/v1/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    (res) => {
      console.log(`Response Status: ${res.statusCode}`);
      console.log("Response Headers:", res.headers);

      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
        const elapsed = Date.now() - testStartTime;
        console.log(
          `[${elapsed}ms] Received chunk (${chunk.length} bytes): ${chunk.toString().substring(0, 100)}`
        );
      });

      res.on("end", () => {
        const elapsed = Date.now() - testStartTime;
        console.log(`\n[${elapsed}ms] Response complete`);
        console.log("Response body length:", body.length);
        if (body.length < 500) {
          console.log("Response body:", body);
        }
        cleanup();
      });
    }
  );

  req.on("error", (err) => {
    console.error("Request error:", err.message);
    cleanup();
  });

  req.write(
    JSON.stringify({
      model: "current-model",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in one sentence" }],
      stream: true,
    })
  );
  req.end();

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log("\n❌ Test timed out after 30 seconds!");
    cleanup();
  }, 30000);
}

function cleanup() {
  console.log("\nCleaning up...");
  proxy.kill();
  setTimeout(() => process.exit(0), 1000);
}
