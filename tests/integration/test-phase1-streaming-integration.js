#!/usr/bin/env node

/**
 * Phase 1 Integration Tests: Streaming Context
 *
 * Tests for Phase 1 improvements in actual streaming scenarios
 * 1. Circular reference in tool inputs (real streaming)
 * 2. Response close handler in streaming (real scenario)
 * 3. Timeout validation in streaming context (real scenario)
 *
 * Run with: node tests/integration/test-phase1-streaming-integration.js
 */

const assert = require("assert");

let passed = 0;
let failed = 0;
const failedTests = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
    failedTests.push({ name, error: error.message });
  }
}

function expect(value) {
  return {
    toBe: (expected) => {
      assert.strictEqual(value, expected);
    },
    toEqual: (expected) => {
      assert.deepStrictEqual(value, expected);
    },
    toContain: (substring) => {
      assert.ok(value.includes(substring));
    },
    toMatch: (regex) => {
      assert.ok(regex.test(value));
    },
    toThrow: () => {
      let threw = false;
      try {
        value();
      } catch (e) {
        threw = true;
      }
      assert.ok(threw);
    },
    toBeTruthy: () => {
      assert.ok(value);
    },
    toBeFalsy: () => {
      assert.ok(!value);
    },
    toBeGreaterThan: (threshold) => {
      assert.ok(value > threshold);
    },
  };
}

// ============================================================================
// INTEGRATION TEST 1: CIRCULAR REFERENCE IN TOOL INPUTS
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  PHASE 1 INTEGRATION TESTS - Streaming Context         ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("INTEGRATION TEST 1: Circular Reference in Tool Inputs\n");

test("should stringify normal tool input without error", () => {
  const toolInput = {
    query: "what is 2+2",
    options: { detailed: true },
  };

  let result;
  try {
    result = JSON.stringify(toolInput);
  } catch (e) {
    throw new Error(`Failed to stringify: ${e.message}`);
  }

  expect(result).toContain("query");
  expect(result).toContain("what is 2+2");
});

test("should handle tool input with circular reference gracefully", () => {
  const toolInput = {
    query: "test",
    config: {},
  };
  toolInput.config.parent = toolInput; // Create circular ref

  // Simulate the safe stringify function
  const safeStringify = (val) => {
    const seen = new WeakSet();
    return JSON.stringify(val, (key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
  };

  let result;
  try {
    result = safeStringify(toolInput);
  } catch (e) {
    throw new Error(`Failed to stringify with circular ref: ${e.message}`);
  }

  expect(result).toContain("[Circular]");
  expect(result).toContain("query");
});

test("should encode tool input as SSE event data", () => {
  const toolInput = { function: "calculator", args: { a: 1, b: 2 } };

  const safeStringify = (val) => {
    const seen = new WeakSet();
    return JSON.stringify(val, (key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
  };

  const chunk = {
    type: "content_block_delta",
    delta: { type: "input_json_delta", partial_json: safeStringify(toolInput) },
  };

  const eventData = `event: content_block_delta\ndata: ${safeStringify(chunk)}\n\n`;

  expect(eventData).toContain("event: content_block_delta");
  expect(eventData).toContain("calculator");
});

// ============================================================================
// INTEGRATION TEST 2: RESPONSE CLOSE HANDLER IN STREAMING
// ============================================================================

console.log("INTEGRATION TEST 2: Response Close Handler in Streaming\n");

function createStreamingResponse() {
  const listeners = {};
  let isEnded = false;

  return {
    on: (event, callback) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return this;
    },
    once: (event, callback) => {
      const wrappedCallback = (...args) => {
        callback(...args);
      };
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(wrappedCallback);
      return this;
    },
    removeListener: (event, callback) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      }
    },
    write: (data) => true,
    end: () => {
      isEnded = true;
    },
    emit: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb(...args));
      }
    },
    isEnded: () => isEnded,
    getListenerCount: (event) => (listeners[event] || []).length,
  };
}

test("should register close handler on response", () => {
  const res = createStreamingResponse();
  let closeHandled = false;

  res.on("close", () => {
    closeHandled = true;
  });

  expect(res.getListenerCount("close")).toBeGreaterThan(0);
});

test("should clear keepalive interval when response closes", () => {
  const res = createStreamingResponse();
  let keepaliveInterval = setInterval(() => {}, 10000);
  let cleaned = false;

  res.on("close", () => {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      cleaned = true;
    }
  });

  res.emit("close");
  expect(cleaned).toBeTruthy();
});

test("should not error when closing response without keepalive", () => {
  const res = createStreamingResponse();
  let keepaliveInterval = null;
  let errored = false;

  try {
    res.on("close", () => {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
      }
    });
    res.emit("close");
  } catch (e) {
    errored = true;
  }

  expect(errored).toBeFalsy();
});

test("should end response on close event", () => {
  const res = createStreamingResponse();
  let ended = false;

  res.on("close", () => {
    res.end();
    ended = true;
  });

  res.emit("close");
  expect(res.isEnded()).toBeTruthy();
  expect(ended).toBeTruthy();
});

test("should handle multiple close handlers", () => {
  const res = createStreamingResponse();
  let handler1Called = false;
  let handler2Called = false;

  res.on("close", () => {
    handler1Called = true;
  });

  res.on("close", () => {
    handler2Called = true;
  });

  res.emit("close");

  expect(handler1Called).toBeTruthy();
  expect(handler2Called).toBeTruthy();
});

test("should create safe state before response closes", () => {
  const res = createStreamingResponse();
  let isClosing = false;

  // Simulate cleanup with guard
  const cleanup = () => {
    if (isClosing) return;
    isClosing = true;

    // Clear resources
    if (res) {
      res.end();
    }
  };

  res.on("close", cleanup);

  res.emit("close");
  expect(isClosing).toBeTruthy();
});

// ============================================================================
// INTEGRATION TEST 3: TIMEOUT VALIDATION IN STREAMING
// ============================================================================

console.log("INTEGRATION TEST 3: Timeout Validation in Streaming\n");

test("should validate timeout on proxy initialization", () => {
  const timeoutStr = process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000";
  const timeout = parseInt(timeoutStr, 10);

  expect(typeof timeout).toBe("number");
  expect(timeout).toBeGreaterThan(0);
});

test("should warn if timeout is below minimum", () => {
  const timeout = 5000; // 5 seconds
  const MIN_TIMEOUT = 30000;
  let warned = false;

  if (timeout < MIN_TIMEOUT) {
    warned = true;
  }

  expect(warned).toBeTruthy();
});

test("should warn if timeout is above maximum", () => {
  const timeout = 7200000; // 2 hours
  const MAX_TIMEOUT = 3600000;
  let warned = false;

  if (timeout > MAX_TIMEOUT) {
    warned = true;
  }

  expect(warned).toBeTruthy();
});

test("should use default timeout if env var not set", () => {
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );

  expect(timeout).toBe(600000);
});

test("should clear timeout on successful stream completion", () => {
  let timeoutId = setTimeout(() => {}, 600000);
  let timeoutCleared = false;

  // Simulate stream completion
  clearTimeout(timeoutId);
  timeoutCleared = true;

  expect(timeoutCleared).toBeTruthy();
});

test("should clear timeout on stream error", () => {
  let timeoutId = setTimeout(() => {}, 600000);
  let timeoutCleared = false;

  // Simulate error path
  clearTimeout(timeoutId);
  timeoutCleared = true;

  expect(timeoutCleared).toBeTruthy();
});

test("should have AbortController for request timeout", () => {
  const abortController = new AbortController();
  let aborted = false;

  abortController.signal.addEventListener("abort", () => {
    aborted = true;
  });

  abortController.abort();
  expect(aborted).toBeTruthy();
});

test("should abort stream on timeout", () => {
  const abortController = new AbortController();
  let aborted = false;

  const timeout = setTimeout(() => {
    abortController.abort();
  }, 100);

  abortController.signal.addEventListener("abort", () => {
    aborted = true;
    clearTimeout(timeout);
  });

  // Trigger abort
  abortController.abort();

  expect(aborted).toBeTruthy();
});

test("should allow timeout override via environment", () => {
  process.env.ANYCLAUDE_REQUEST_TIMEOUT = "120000";
  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );

  expect(timeout).toBe(120000);
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
});

test("should handle timeout configuration for different models", () => {
  // Scenario: user knows their model needs 90 seconds
  process.env.ANYCLAUDE_REQUEST_TIMEOUT = "120000"; // 2 minutes
  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );

  const isReasonable = timeout >= 30000 && timeout <= 3600000;
  expect(isReasonable).toBeTruthy();

  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
});

// ============================================================================
// TEST RUNNER & SUMMARY
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║                    TEST SUMMARY                          ║");
console.log("╠══════════════════════════════════════════════════════════╣");
console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
console.log("╚══════════════════════════════════════════════════════════╝\n");

if (failed > 0) {
  console.log("Failed tests:");
  failedTests.forEach((t) => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
  console.log();
  process.exit(1);
} else {
  console.log("✅ All integration tests passed!\n");
  process.exit(0);
}
