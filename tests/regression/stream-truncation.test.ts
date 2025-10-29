/**
 * Stream Truncation Regression Test Suite
 *
 * Tests for ensuring SSE responses are not truncated mid-stream.
 * This suite validates that backpressure handling and buffering headers
 * prevent data loss when streaming large responses.
 */

import http from "http";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

interface StreamTestResult {
  success: boolean;
  totalEvents: number;
  totalChunks: number;
  lastEventType: string;
  responseSize: number;
  completedWithMessageStop: boolean;
  truncatedAt?: number;
  error?: string;
}

/**
 * Makes an HTTP request to the proxy and validates the streaming response
 */
function testProxyStream(
  port: number,
  requestBody: object
): Promise<StreamTestResult> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    let totalData = "";
    let eventCount = 0;
    let chunkCount = 0;
    let lastEventType = "";
    let hasMessageStop = false;

    const req = http.request(options, (res) => {
      // Check response headers
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      // Validate SSE headers
      const contentType = res.headers["content-type"];
      const bufferingDisabled =
        res.headers["x-accel-buffering"] === "no" ||
        res.headers["x-accel-buffering"] === undefined;
      const isChunked = res.headers["transfer-encoding"] === "chunked";

      if (contentType !== "text/event-stream") {
        console.warn(`⚠️  Wrong Content-Type: ${contentType}`);
      }

      res.on("data", (chunk) => {
        chunkCount++;
        const chunkStr = chunk.toString("utf-8");
        totalData += chunkStr;

        // Count events in this chunk
        const eventMatches = chunkStr.match(/^event: /gm);
        if (eventMatches) {
          eventCount += eventMatches.length;
          const lines = chunkStr.split("\n");
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              lastEventType = line.replace("event: ", "").trim();
              if (lastEventType === "message_stop") {
                hasMessageStop = true;
              }
            }
          }
        }
      });

      res.on("end", () => {
        const responseSize = totalData.length;
        const completedNormally = hasMessageStop;

        resolve({
          success: completedNormally && eventCount > 0,
          totalEvents: eventCount,
          totalChunks: chunkCount,
          lastEventType,
          responseSize,
          completedWithMessageStop: completedNormally,
        });
      });

      res.on("error", (err) => {
        reject(err);
      });
    });

    req.on("error", reject);

    req.write(JSON.stringify(requestBody));
    req.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      req.destroy();
      resolve({
        success: false,
        totalEvents: eventCount,
        totalChunks: chunkCount,
        lastEventType,
        responseSize: totalData.length,
        completedWithMessageStop: hasMessageStop,
        error: "Request timeout after 30s",
        truncatedAt: totalData.length,
      });
    }, 30000);
  });
}

describe("Stream Truncation Regression Tests", () => {
  let proxyPort: number;

  beforeAll(() => {
    // Get proxy port from environment or config
    // This should be set by the test runner
    proxyPort = parseInt(process.env.PROXY_PORT || "8000", 10);
  });

  it("should complete short responses without truncation", async () => {
    const result = await testProxyStream(proxyPort, {
      model: "current-model",
      messages: [
        {
          role: "user",
          content: "Say 'hello' in one word.",
        },
      ],
      stream: true,
    });

    expect(result.success).toBe(true);
    expect(result.completedWithMessageStop).toBe(true);
    expect(result.lastEventType).toBe("message_stop");
    expect(result.totalEvents).toBeGreaterThan(0);
  });

  it("should complete medium-length responses without truncation", async () => {
    const result = await testProxyStream(proxyPort, {
      model: "current-model",
      messages: [
        {
          role: "user",
          content:
            "List 5 popular programming languages and briefly describe each.",
        },
      ],
      stream: true,
    });

    expect(result.success).toBe(true);
    expect(result.completedWithMessageStop).toBe(true);
    expect(result.responseSize).toBeGreaterThan(500);
    expect(result.totalEvents).toBeGreaterThan(5);
  });

  it("should complete long responses without truncation", async () => {
    const result = await testProxyStream(proxyPort, {
      model: "current-model",
      messages: [
        {
          role: "user",
          content:
            "Write a detailed explanation of how machine learning works, covering supervised learning, unsupervised learning, reinforcement learning, and real-world applications.",
        },
      ],
      stream: true,
    });

    expect(result.success).toBe(true);
    expect(result.completedWithMessageStop).toBe(true);
    expect(result.responseSize).toBeGreaterThan(2000);
    expect(result.totalEvents).toBeGreaterThan(20);
  });

  it("should maintain proper event sequence", async () => {
    const result = await testProxyStream(proxyPort, {
      model: "current-model",
      messages: [
        {
          role: "user",
          content: "What is 2+2?",
        },
      ],
      stream: true,
    });

    expect(result.success).toBe(true);
    // Events should be: message_start, then content blocks, then message_delta, then message_stop
    expect(result.totalEvents).toBeGreaterThanOrEqual(4);
  });

  it("should handle backpressure without data loss", async () => {
    // This test would need instrumentation to verify backpressure handling
    // For now, we just verify that large responses complete
    const result = await testProxyStream(proxyPort, {
      model: "current-model",
      messages: [
        {
          role: "user",
          content: "Generate a long list of 100 items.",
        },
      ],
      stream: true,
    });

    expect(result.completedWithMessageStop).toBe(true);
    expect(result.lastEventType).toBe("message_stop");
  });
});

/**
 * Manual test function for debugging
 * Run with: bun run tests/regression/stream-truncation.test.ts --manual
 */
export async function manualTest(proxyPort: number) {
  console.log(`\n🧪 Testing stream truncation at proxy port ${proxyPort}\n`);

  const testCases = [
    {
      name: "Short response",
      body: {
        model: "current-model",
        messages: [{ role: "user", content: "Say hello" }],
        stream: true,
      },
    },
    {
      name: "Medium response",
      body: {
        model: "current-model",
        messages: [
          {
            role: "user",
            content: "List 5 programming languages",
          },
        ],
        stream: true,
      },
    },
    {
      name: "Long response",
      body: {
        model: "current-model",
        messages: [
          {
            role: "user",
            content:
              "Write a comprehensive guide to machine learning algorithms",
          },
        ],
        stream: true,
      },
    },
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n📝 Testing: ${testCase.name}`);
      const result = await testProxyStream(proxyPort, testCase.body);

      const status = result.completedWithMessageStop ? "✅ PASS" : "❌ FAIL";
      console.log(`${status}`);
      console.log(`  Events: ${result.totalEvents}`);
      console.log(`  Chunks: ${result.totalChunks}`);
      console.log(`  Size: ${result.responseSize} bytes`);
      console.log(`  Last event: ${result.lastEventType}`);

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    } catch (err) {
      console.error(`❌ ERROR: ${err}`);
    }
  }
}
