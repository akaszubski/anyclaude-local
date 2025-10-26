#!/usr/bin/env node
/**
 * Test Bash tool calling with Qwen3-Coder-30B
 * Simulates Claude Code's Bash tool schema and call
 */

const http = require("http");

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🧪 Testing Bash Tool Calling");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");

const proxyUrl = "http://localhost:55583";

// Simulate Claude Code's Bash tool schema (simplified)
const bashToolSchema = {
  name: "Bash",
  description: "Executes a bash command",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute",
      },
      description: {
        type: "string",
        description: "Description of what this command does",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

const requestBody = {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1000,
  tools: [bashToolSchema],
  messages: [
    {
      role: "user",
      content:
        "What is the current git status? Use the Bash tool to run git status.",
    },
  ],
};

console.log("1️⃣  Sending request with Bash tool schema...");
console.log("");
console.log("Tool Schema:");
console.log(JSON.stringify(bashToolSchema, null, 2));
console.log("");

const postData = JSON.stringify(requestBody);

const req = http.request(
  `${proxyUrl}/v1/messages`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test",
      "anthropic-version": "2023-06-01",
    },
  },
  (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log("");

    let responseData = "";

    res.on("data", (chunk) => {
      responseData += chunk.toString();
      process.stdout.write(".");
    });

    res.on("end", () => {
      console.log("");
      console.log("");

      try {
        const response = JSON.parse(responseData);

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("RESPONSE");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("");
        console.log(JSON.stringify(response, null, 2));
        console.log("");

        // Check for tool use
        const toolUse = response.content?.find((c) => c.type === "tool_use");
        if (toolUse) {
          console.log("✅ Model successfully called tool:");
          console.log(`   Tool: ${toolUse.name}`);
          console.log(`   Input:`, JSON.stringify(toolUse.input, null, 2));
        } else {
          console.log("⚠️  No tool use found in response");
          console.log(
            "   Model may not support tool calling or schema conversion failed"
          );
        }
      } catch (error) {
        console.log("Response (raw):");
        console.log(responseData);
        console.log("");
        console.log(`❌ Failed to parse response: ${error.message}`);
      }
    });
  }
);

req.on("error", (error) => {
  console.log(`❌ Request failed: ${error.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
