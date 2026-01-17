/**
 * Integration tests for tool-instruction-injector.ts (Issue #35)
 *
 * Tests the end-to-end flow of tool instruction injection in the proxy pipeline.
 *
 * Components tested:
 * 1. Proxy request handling with injection enabled/disabled
 * 2. Multi-turn conversation with selective injection
 * 3. Debug logging at levels 1, 2, 3
 * 4. Over-injection detection and warning
 * 5. Configuration loading from .anyclauderc.json
 * 6. Integration with convert-anthropic-messages.ts
 * 7. Injection with different backend modes (lmstudio, openrouter)
 * 8. Performance impact measurement
 * 9. Thread safety (concurrent requests)
 * 10. Error handling and graceful degradation
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

// Test environment setup
process.env.ANYCLAUDE_DEBUG = "0"; // Disable debug by default for clean test output

const http = require("http");
const { spawn } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");

const sleep = promisify(setTimeout);

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock Anthropic request body
 */
function createAnthropicRequest(
  userMessage,
  systemPrompt = "You are a helpful assistant.",
  tools = []
) {
  return {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    tools: tools,
  };
}

/**
 * Standard tool definitions
 */
const STANDARD_TOOLS = [
  {
    name: "Read",
    description: "Reads a file from the local filesystem.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description: "Writes a file to the local filesystem.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute path to the file to write",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Edit",
    description: "Performs exact string replacements in files.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Bash",
    description: "Executes a bash command.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        description: { type: "string" },
      },
      required: ["command"],
    },
  },
];

/**
 * Start proxy server for testing
 */
async function startProxyServer(config = {}) {
  const configPath = path.join(__dirname, "../../.anyclauderc.test.json");

  // Write test config
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        backend: "lmstudio",
        backends: {
          lmstudio: {
            enabled: true,
            baseUrl: "http://localhost:8082/v1",
            apiKey: "test-key",
            model: "test-model",
            injectToolInstructions: config.injectToolInstructions !== false,
            toolInstructionStyle: config.toolInstructionStyle || "explicit",
            injectionThreshold: config.injectionThreshold || 0.7,
          },
        },
      },
      null,
      2
    )
  );

  // Start proxy in PROXY_ONLY mode
  const proxy = spawn("node", ["dist/main.js"], {
    env: {
      ...process.env,
      PROXY_ONLY: "true",
      ANYCLAUDE_MODE: "lmstudio",
      ANYCLAUDE_DEBUG: config.debug || "0",
    },
    cwd: path.join(__dirname, "../.."),
  });

  // Wait for proxy to start
  await sleep(2000);

  return {
    process: proxy,
    cleanup: async () => {
      proxy.kill();
      try {
        await fs.unlink(configPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Make request to proxy
 */
async function makeProxyRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "localhost",
      port: 8080,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData,
        });
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ============================================================================
// Test Suite: Basic Integration
// ============================================================================

describe("Tool Instruction Injection Integration", () => {
  let proxy;

  afterEach(async () => {
    if (proxy) {
      await proxy.cleanup();
      proxy = null;
    }
  });

  describe("Injection enabled", () => {
    test("should inject instruction for Read intent", async () => {
      proxy = await startProxyServer({ injectToolInstructions: true });

      const request = createAnthropicRequest(
        "Read the file src/main.ts",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);

      expect(response.statusCode).toBe(200);

      // Response should indicate injection occurred
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty("injection_metadata");
      expect(responseBody.injection_metadata.modified).toBe(true);
      expect(responseBody.injection_metadata.injectedTool).toBe("Read");
    }, 10000);

    test("should inject instruction for Write intent", async () => {
      proxy = await startProxyServer({ injectToolInstructions: true });

      const request = createAnthropicRequest(
        "Create a new file test.txt with 'Hello World'",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      expect(responseBody.injection_metadata.modified).toBe(true);
      expect(responseBody.injection_metadata.injectedTool).toBe("Write");
    }, 10000);

    test("should inject instruction for Bash intent", async () => {
      proxy = await startProxyServer({ injectToolInstructions: true });

      const request = createAnthropicRequest(
        "Run npm install",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      expect(responseBody.injection_metadata.modified).toBe(true);
      expect(responseBody.injection_metadata.injectedTool).toBe("Bash");
    }, 10000);

    test("should NOT inject for non-tool messages", async () => {
      proxy = await startProxyServer({ injectToolInstructions: true });

      const request = createAnthropicRequest(
        "Explain quantum physics",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      expect(responseBody.injection_metadata.modified).toBe(false);
      expect(responseBody.injection_metadata.injectedTool).toBeUndefined();
    }, 10000);
  });

  describe("Injection disabled", () => {
    test("should NOT modify messages when disabled", async () => {
      proxy = await startProxyServer({ injectToolInstructions: false });

      const request = createAnthropicRequest(
        "Read the file src/main.ts",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      // Should not have injection metadata when disabled
      expect(responseBody.injection_metadata).toBeUndefined();
    }, 10000);
  });

  describe("Instruction styles", () => {
    test("should use explicit style when configured", async () => {
      proxy = await startProxyServer({
        injectToolInstructions: true,
        toolInstructionStyle: "explicit",
      });

      const request = createAnthropicRequest(
        "Read the config file",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      expect(responseBody.injection_metadata.style).toBe("explicit");
    }, 10000);

    test("should use subtle style when configured", async () => {
      proxy = await startProxyServer({
        injectToolInstructions: true,
        toolInstructionStyle: "subtle",
      });

      const request = createAnthropicRequest(
        "Read the config file",
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );

      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      expect(responseBody.injection_metadata.style).toBe("subtle");
    }, 10000);
  });
});

// ============================================================================
// Test Suite: Multi-Turn Conversations
// ============================================================================

describe("Multi-Turn Conversation Injection", () => {
  let proxy;

  beforeEach(async () => {
    proxy = await startProxyServer({
      injectToolInstructions: true,
      maxInjectionsPerConversation: 5,
    });
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.cleanup();
    }
  });

  test("should inject selectively across multiple turns", async () => {
    const conversation = [
      { message: "Read src/main.ts", expectInjection: true, tool: "Read" },
      { message: "What does this code do?", expectInjection: false },
      {
        message: "Write tests to test.ts",
        expectInjection: true,
        tool: "Write",
      },
      { message: "Thanks!", expectInjection: false },
      { message: "Run the tests", expectInjection: true, tool: "Bash" },
    ];

    for (const turn of conversation) {
      const request = createAnthropicRequest(
        turn.message,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      if (turn.expectInjection) {
        expect(responseBody.injection_metadata.modified).toBe(true);
        expect(responseBody.injection_metadata.injectedTool).toBe(turn.tool);
      } else {
        expect(responseBody.injection_metadata.modified).toBe(false);
      }
    }
  }, 30000);

  test("should track injection count across conversation", async () => {
    const messages = [
      "Read file1.txt",
      "Write file2.txt",
      "Edit file3.txt",
      "Run tests",
      "Search for TODO",
    ];

    let lastCount = 0;
    for (const msg of messages) {
      const request = createAnthropicRequest(
        msg,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      if (responseBody.injection_metadata.modified) {
        expect(responseBody.injection_metadata.injectionCount).toBeGreaterThan(
          lastCount
        );
        lastCount = responseBody.injection_metadata.injectionCount;
      }
    }

    expect(lastCount).toBeGreaterThan(0);
  }, 30000);
});

// ============================================================================
// Test Suite: Over-Injection Detection
// ============================================================================

describe("Over-Injection Detection", () => {
  let proxy;

  beforeEach(async () => {
    proxy = await startProxyServer({
      injectToolInstructions: true,
      maxInjectionsPerConversation: 3, // Low limit for testing
    });
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.cleanup();
    }
  });

  test("should stop injecting after max reached", async () => {
    const toolMessages = [
      "Read file1.txt",
      "Write file2.txt",
      "Edit file3.txt",
      "Run tests", // Should not inject (max reached)
      "Search files", // Should not inject (max reached)
    ];

    let injectCount = 0;
    for (const msg of toolMessages) {
      const request = createAnthropicRequest(
        msg,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      if (responseBody.injection_metadata.modified) {
        injectCount++;
      }
    }

    expect(injectCount).toBeLessThanOrEqual(3);
  }, 30000);

  test("should warn when approaching max injections", async () => {
    const toolMessages = [
      "Read file1.txt",
      "Write file2.txt",
      "Edit file3.txt", // 3rd injection - should warn
    ];

    for (const msg of toolMessages) {
      const request = createAnthropicRequest(
        msg,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      const response = await makeProxyRequest(request);
      const responseBody = JSON.parse(response.body);

      if (responseBody.injection_metadata.injectionCount === 3) {
        expect(responseBody.injection_metadata.warning).toBeDefined();
        expect(responseBody.injection_metadata.warning).toMatch(
          /max.*reached/i
        );
      }
    }
  }, 30000);
});

// ============================================================================
// Test Suite: Debug Logging
// ============================================================================

describe("Debug Logging Integration", () => {
  test("should log injection at debug level 1", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
      debug: "1",
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    // Capture proxy output
    let logOutput = "";
    proxy.process.stdout.on("data", (data) => {
      logOutput += data.toString();
    });
    proxy.process.stderr.on("data", (data) => {
      logOutput += data.toString();
    });

    await makeProxyRequest(request);
    await sleep(1000);

    // Should log injection
    expect(logOutput).toMatch(/Tool Instruction Injection/i);
    expect(logOutput).toMatch(/Read/);

    await proxy.cleanup();
  }, 10000);

  test("should log detailed stats at debug level 2", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
      debug: "2",
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    let logOutput = "";
    proxy.process.stdout.on("data", (data) => {
      logOutput += data.toString();
    });
    proxy.process.stderr.on("data", (data) => {
      logOutput += data.toString();
    });

    await makeProxyRequest(request);
    await sleep(1000);

    // Should log confidence, keywords, etc.
    expect(logOutput).toMatch(/confidence/i);
    expect(logOutput).toMatch(/keyword/i);

    await proxy.cleanup();
  }, 10000);

  test("should log full prompt at debug level 3", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
      debug: "3",
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    let logOutput = "";
    proxy.process.stdout.on("data", (data) => {
      logOutput += data.toString();
    });
    proxy.process.stderr.on("data", (data) => {
      logOutput += data.toString();
    });

    await makeProxyRequest(request);
    await sleep(1000);

    // Should log full modified message
    expect(logOutput).toMatch(/modified.*message/i);
    expect(logOutput).toContain("Read src/main.ts");

    await proxy.cleanup();
  }, 10000);
});

// ============================================================================
// Test Suite: Performance Impact
// ============================================================================

describe("Performance Impact", () => {
  test("should have minimal latency impact (<10ms)", async () => {
    const proxyWithInjection = await startProxyServer({
      injectToolInstructions: true,
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const start = Date.now();
    await makeProxyRequest(request);
    const withInjection = Date.now() - start;

    await proxyWithInjection.cleanup();

    // Compare with disabled injection
    const proxyWithoutInjection = await startProxyServer({
      injectToolInstructions: false,
    });

    const start2 = Date.now();
    await makeProxyRequest(request);
    const withoutInjection = Date.now() - start2;

    await proxyWithoutInjection.cleanup();

    // Injection should add less than 10ms
    const overhead = withInjection - withoutInjection;
    expect(overhead).toBeLessThan(10);
  }, 20000);
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe("Error Handling and Graceful Degradation", () => {
  test("should handle malformed tools array gracefully", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      [{ invalid: "tool" }] // Malformed tool
    );

    const response = await makeProxyRequest(request);

    // Should not crash
    expect(response.statusCode).toBe(200);

    await proxy.cleanup();
  }, 10000);

  test("should handle missing tool schema gracefully", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
    });

    const request = createAnthropicRequest(
      "Read src/main.ts",
      "You are a helpful assistant.",
      [
        {
          name: "InvalidTool",
          // Missing description and input_schema
        },
      ]
    );

    const response = await makeProxyRequest(request);

    // Should not crash
    expect(response.statusCode).toBe(200);

    await proxy.cleanup();
  }, 10000);

  test("should continue on injection error", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
    });

    // Null/undefined message should be handled
    const request = createAnthropicRequest(
      null,
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const response = await makeProxyRequest(request);

    // Should not crash (may return error, but server stays up)
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(600);

    await proxy.cleanup();
  }, 10000);
});

// ============================================================================
// Test Suite: Concurrent Requests (Thread Safety)
// ============================================================================

describe("Concurrent Request Handling", () => {
  test("should handle concurrent injections correctly", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
    });

    const messages = [
      "Read file1.txt",
      "Write file2.txt",
      "Edit file3.txt",
      "Run tests",
      "Search codebase",
    ];

    // Send all requests concurrently
    const promises = messages.map((msg) => {
      const request = createAnthropicRequest(
        msg,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      return makeProxyRequest(request);
    });

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.statusCode).toBe(200);
    });

    // Count successful injections
    const injections = responses
      .map((r) => JSON.parse(r.body))
      .filter((body) => body.injection_metadata?.modified);

    expect(injections.length).toBeGreaterThan(0);

    await proxy.cleanup();
  }, 15000);

  test("should maintain correct injection counts under concurrency", async () => {
    const proxy = await startProxyServer({
      injectToolInstructions: true,
      maxInjectionsPerConversation: 10,
    });

    const toolMessages = Array(5).fill("Read file.txt");

    const promises = toolMessages.map((msg) => {
      const request = createAnthropicRequest(
        msg,
        "You are a helpful assistant.",
        STANDARD_TOOLS
      );
      return makeProxyRequest(request);
    });

    const responses = await Promise.all(promises);

    // Each response should have valid injection metadata
    responses.forEach((response) => {
      const body = JSON.parse(response.body);
      if (body.injection_metadata?.modified) {
        expect(body.injection_metadata.injectionCount).toBeGreaterThan(0);
        expect(body.injection_metadata.injectionCount).toBeLessThanOrEqual(10);
      }
    });

    await proxy.cleanup();
  }, 15000);
});

// ============================================================================
// Test Suite: False Positive Prevention
// ============================================================================

describe("False Positive Prevention Integration", () => {
  let proxy;

  beforeEach(async () => {
    proxy = await startProxyServer({
      injectToolInstructions: true,
    });
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.cleanup();
    }
  });

  test("should NOT inject for 'read this carefully'", async () => {
    const request = createAnthropicRequest(
      "Please read this carefully before proceeding",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const response = await makeProxyRequest(request);
    const body = JSON.parse(response.body);

    expect(body.injection_metadata.modified).toBe(false);
  }, 10000);

  test("should NOT inject for 'I will write'", async () => {
    const request = createAnthropicRequest(
      "I will write a detailed explanation",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const response = await makeProxyRequest(request);
    const body = JSON.parse(response.body);

    expect(body.injection_metadata.modified).toBe(false);
  }, 10000);

  test("should NOT inject for 'edit my statement'", async () => {
    const request = createAnthropicRequest(
      "Let me edit my previous statement",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const response = await makeProxyRequest(request);
    const body = JSON.parse(response.body);

    expect(body.injection_metadata.modified).toBe(false);
  }, 10000);

  test("should NOT inject for general search queries", async () => {
    const request = createAnthropicRequest(
      "I'll search for a solution online",
      "You are a helpful assistant.",
      STANDARD_TOOLS
    );

    const response = await makeProxyRequest(request);
    const body = JSON.parse(response.body);

    expect(body.injection_metadata.modified).toBe(false);
  }, 10000);
});
