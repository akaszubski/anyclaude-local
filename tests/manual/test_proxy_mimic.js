#!/usr/bin/env node
/**
 * Test that mimics exactly what the proxy does with the stream
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

async function testProxyMimic() {
  console.log("Testing stream consumption like the proxy...\n");

  const lmstudio = createOpenAI({
    apiKey: "lm-studio",
    baseURL: "http://localhost:1234/v1",
    compatibility: "legacy",
  });

  try {
    console.log("Calling streamText...");
    const stream = await streamText({
      model: lmstudio("gpt-oss-20b-mlx"),
      messages: [{ role: "user", content: "1+1=" }],
      maxOutputTokens: 50,
    });

    console.log("stream.fullStream obtained, creating pipe...\n");

    let chunkCount = 0;
    let gotFinish = false;

    // Mimic what the proxy does: pipe to a WritableStream
    await stream.fullStream.pipeTo(
      new WritableStream({
        write(chunk) {
          chunkCount++;
          console.log(`Chunk ${chunkCount}:`, chunk.type);

          if (chunk.type === "finish") {
            gotFinish = true;
          }
        },
        close() {
          console.log("\n✓ Stream close() called");
        },
        abort(reason) {
          console.log("\n✗ Stream abort() called:", reason);
        },
      })
    );

    console.log(`\n✓ pipeTo() completed`);
    console.log(`Total chunks: ${chunkCount}`);
    console.log(`Got 'finish' chunk: ${gotFinish}`);

    if (!gotFinish) {
      console.log("\n⚠️  WARNING: No finish chunk received!");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n✗ Error:", error.message);
    throw error;
  }
}

testProxyMimic().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
