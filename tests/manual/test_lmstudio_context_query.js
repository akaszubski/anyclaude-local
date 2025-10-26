#!/usr/bin/env node
/**
 * Test that anyclaude correctly queries LMStudio for context length
 */

const http = require("http");
const { spawn } = require("child_process");

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🧪 Testing LMStudio Context Length Query");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");

// Step 1: Query LMStudio directly to get expected value
console.log("1️⃣  Querying LMStudio API directly...");
http
  .get("http://localhost:1234/api/v0/models", (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const models = JSON.parse(data);
        const loadedModel = models.data.find((m) => m.state === "loaded");

        if (!loadedModel) {
          console.log("   ❌ No model loaded in LMStudio");
          process.exit(1);
        }

        const expectedContext =
          loadedModel.loaded_context_length || loadedModel.max_context_length;
        console.log(`   ✅ LMStudio loaded model: ${loadedModel.id}`);
        console.log(
          `   ✅ Context length: ${expectedContext.toLocaleString()} tokens`
        );
        console.log("");

        // Step 2: Start anyclaude with debug mode
        console.log("2️⃣  Starting anyclaude with debug mode...");
        const anyclaude = spawn("node", ["dist/main.js"], {
          env: { ...process.env, PROXY_ONLY: "true", ANYCLAUDE_DEBUG: "1" },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let proxyUrl = "";
        let contextDetected = false;
        let detectedContext = 0;

        anyclaude.stdout.on("data", (data) => {
          const output = data.toString();
          const match = output.match(/http:\/\/localhost:\d+/);
          if (match) proxyUrl = match[0];
        });

        anyclaude.stderr.on("data", (data) => {
          const output = data.toString();
          console.log("   ", output.trim());

          // Check for context length detection
          const contextMatch = output.match(/\[Context\].*?(\d+)\s+tokens/);
          if (contextMatch) {
            contextDetected = true;
            detectedContext = parseInt(contextMatch[1], 10);
          }
        });

        // Wait for proxy to start
        setTimeout(() => {
          if (!proxyUrl) {
            console.log("   ❌ Failed to start proxy");
            anyclaude.kill();
            process.exit(1);
          }

          console.log(`   ✅ Proxy started: ${proxyUrl}`);
          console.log("");

          // Step 3: Send test request to trigger context detection
          console.log("3️⃣  Sending test request to trigger context query...");
          const postData = JSON.stringify({
            model: "test",
            max_tokens: 10,
            messages: [{ role: "user", content: "test" }],
          });

          const req = http.request(
            `${proxyUrl}/v1/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": "test",
              },
            },
            (res) => {
              // Don't care about response, just that request was processed
              res.on("data", () => {});
              res.on("end", () => {
                // Give debug logs time to appear
                setTimeout(() => {
                  anyclaude.kill();

                  console.log("");
                  console.log(
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                  );
                  console.log("RESULTS");
                  console.log(
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                  );
                  console.log("");

                  if (!contextDetected) {
                    console.log("❌ Context length query not detected in logs");
                    console.log(
                      "   Expected to see: [Context] Using LMStudio reported context"
                    );
                    process.exit(1);
                  }

                  console.log(
                    `✅ Context length detected: ${detectedContext.toLocaleString()} tokens`
                  );
                  console.log(
                    `✅ LMStudio reported:      ${expectedContext.toLocaleString()} tokens`
                  );
                  console.log("");

                  if (detectedContext === expectedContext) {
                    console.log(
                      "✅ PERFECT MATCH! Context length correctly queried from LMStudio"
                    );
                    console.log("");
                    process.exit(0);
                  } else {
                    console.log(
                      `⚠️  MISMATCH! Expected ${expectedContext} but got ${detectedContext}`
                    );
                    console.log("");
                    process.exit(1);
                  }
                }, 1000);
              });
            }
          );

          req.on("error", (err) => {
            console.log(`   ❌ Request failed: ${err.message}`);
            anyclaude.kill();
            process.exit(1);
          });

          req.write(postData);
          req.end();
        }, 2000);
      } catch (error) {
        console.log(
          `   ❌ Failed to parse LMStudio response: ${error.message}`
        );
        process.exit(1);
      }
    });
  })
  .on("error", (err) => {
    console.log(`   ❌ Failed to query LMStudio: ${err.message}`);
    console.log("   Make sure LMStudio is running with a model loaded");
    process.exit(1);
  });
