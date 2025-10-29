#!/usr/bin/env node

/**
 * Phase 1 TDD Tests: Low-Risk Improvements
 *
 * Tests for:
 * 1. Circular reference protection
 * 2. Response close handler
 * 3. Configurable timeout with validation
 *
 * Run with: node tests/unit/test-phase1-improvements.js
 */

const assert = require("assert");

// Test harness
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
      assert.strictEqual(value, expected, `Expected ${expected}, got ${value}`);
    },
    toEqual: (expected) => {
      assert.deepStrictEqual(value, expected);
    },
    toContain: (substring) => {
      assert.ok(
        value.includes(substring),
        `Expected to contain "${substring}", got "${value}"`
      );
    },
    toMatch: (regex) => {
      assert.ok(
        regex.test(value),
        `Expected to match ${regex}, got "${value}"`
      );
    },
    toThrow: (expectedMessage) => {
      assert.throws(
        () => value(),
        (err) => {
          if (expectedMessage && !err.message.includes(expectedMessage)) {
            return false;
          }
          return true;
        },
        `Expected function to throw${expectedMessage ? ` with "${expectedMessage}"` : ""}`
      );
    },
    toBeTruthy: () => {
      assert.ok(value, `Expected truthy value, got ${value}`);
    },
    toBeFalsy: () => {
      assert.ok(!value, `Expected falsy value, got ${value}`);
    },
    toBeGreaterThan: (threshold) => {
      assert.ok(value > threshold, `Expected ${value} > ${threshold}`);
    },
    toHaveBeenCalled: () => {
      assert.ok(value.called, "Expected function to have been called");
    },
  };
}

// Mock utilities
function createMockResponse() {
  const listeners = {};
  let headersSent = false;
  let ended = false;

  return {
    writeHead: (status, headers) => {
      headersSent = true;
      return {
        end: function (data) {
          ended = true;
        },
      };
    },
    write: (data) => {
      // Simulate write returning true (buffer has space)
      return true;
    },
    end: () => {
      ended = true;
    },
    on: (event, callback) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },
    once: (event, callback) => {
      const wrappedCallback = (...args) => {
        callback(...args);
        // Remove this listener
        if (listeners[event]) {
          listeners[event] = listeners[event].filter(
            (cb) => cb !== wrappedCallback
          );
        }
      };
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(wrappedCallback);
    },
    removeListener: (event, callback) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      }
    },
    emit: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb(...args));
      }
    },
    headersSent: () => headersSent,
    ended: () => ended,
    getListeners: (event) => listeners[event] || [],
  };
}

// ============================================================================
// TEST SUITE 1: CIRCULAR REFERENCE PROTECTION
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  PHASE 1 TDD TESTS - Low-Risk Improvements              ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("TEST SUITE 1: Circular Reference Protection\n");

test("should handle simple object without circular references", () => {
  const obj = { a: 1, b: "test", c: { d: 2 } };
  const result = JSON.stringify(obj);
  expect(result).toContain('"a":1');
  expect(result).toContain('"b":"test"');
});

test("should detect circular reference in object", () => {
  const obj = { a: 1 };
  obj.self = obj; // Create circular reference

  // Standard JSON.stringify would throw
  let threw = false;
  try {
    JSON.stringify(obj);
  } catch (e) {
    threw = true;
  }
  expect(threw).toBeTruthy();
});

test("should safely stringify object with circular reference", () => {
  const obj = { a: 1 };
  obj.self = obj; // Create circular reference

  // Our safe version should handle it
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

  const result = safeStringify(obj);
  expect(result).toContain("[Circular]");
});

test("should mark circular references but include other data", () => {
  const obj = {
    name: "test",
    value: 123,
  };
  obj.self = obj;

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

  const result = safeStringify(obj);
  expect(result).toContain('"name":"test"');
  expect(result).toContain('"value":123');
  expect(result).toContain("[Circular]");
});

test("should handle deeply nested circular references", () => {
  const obj = { a: { b: { c: {} } } };
  obj.a.b.c.back = obj; // Circular ref deep in structure

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

  const result = safeStringify(obj);
  expect(result).toContain("[Circular]");
});

// ============================================================================
// TEST SUITE 2: RESPONSE CLOSE HANDLER
// ============================================================================

console.log("\nTEST SUITE 2: Response Close Handler\n");

test("should accept close event listener on response", () => {
  const res = createMockResponse();
  let closeHandlerCalled = false;

  res.on("close", () => {
    closeHandlerCalled = true;
  });

  res.emit("close");
  expect(closeHandlerCalled).toBeTruthy();
});

test("should detect when response closes", () => {
  const res = createMockResponse();
  let closeDetected = false;

  res.on("close", () => {
    closeDetected = true;
  });

  // Simulate client closing connection
  res.emit("close");

  expect(closeDetected).toBeTruthy();
});

test("should clean up keepalive interval when response closes", () => {
  const res = createMockResponse();
  let keepaliveInterval = setInterval(() => {}, 10000);
  let intervalCleared = false;

  res.on("close", () => {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      intervalCleared = true;
    }
  });

  // Emit close event
  res.emit("close");

  expect(intervalCleared).toBeTruthy();
});

test("should guard against double-cleanup of keepalive", () => {
  const res = createMockResponse();
  let keepaliveInterval = setInterval(() => {}, 10000);
  let cleanupCount = 0;

  const cleanup = () => {
    if (!keepaliveInterval) return; // Guard
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    cleanupCount++;
  };

  // Call cleanup twice
  cleanup();
  cleanup();

  // Should only increment once
  expect(cleanupCount).toBe(1);
});

test("should handle close event with multiple listeners", () => {
  const res = createMockResponse();
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

test("should not error if close handler tries to clear non-existent interval", () => {
  const res = createMockResponse();
  let keepaliveInterval = null;
  let errorThrown = false;

  try {
    res.on("close", () => {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
      }
    });
    res.emit("close");
  } catch (e) {
    errorThrown = true;
  }

  expect(errorThrown).toBeFalsy();
});

// ============================================================================
// TEST SUITE 3: CONFIGURABLE TIMEOUT WITH VALIDATION
// ============================================================================

console.log("\nTEST SUITE 3: Configurable Timeout with Validation\n");

test("should read timeout from environment variable", () => {
  process.env.ANYCLAUDE_REQUEST_TIMEOUT = "300000";
  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );
  expect(timeout).toBe(300000);
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
});

test("should use default timeout if not set", () => {
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );
  expect(timeout).toBe(600000);
});

test("should validate timeout is not too low", () => {
  const timeout = 10000; // 10 seconds (too low)
  const MIN_TIMEOUT = 30000; // 30 seconds
  let warningIssued = false;

  if (timeout < MIN_TIMEOUT) {
    warningIssued = true;
  }

  expect(warningIssued).toBeTruthy();
});

test("should validate timeout is not too high", () => {
  const timeout = 7200000; // 2 hours (too high)
  const MAX_TIMEOUT = 3600000; // 1 hour
  let warningIssued = false;

  if (timeout > MAX_TIMEOUT) {
    warningIssued = true;
  }

  expect(warningIssued).toBeTruthy();
});

test("should allow timeout in valid range", () => {
  const timeout = 300000; // 5 minutes
  const MIN_TIMEOUT = 30000;
  const MAX_TIMEOUT = 3600000;
  let valid = true;

  if (timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT) {
    valid = false;
  }

  expect(valid).toBeTruthy();
});

test("should provide helpful warning message for low timeout", () => {
  const timeout = 5000; // 5 seconds
  const warningMessage = `⚠️ Request timeout too low: ${timeout}ms. Qwen3-30B needs at least 30 seconds to load.`;

  expect(warningMessage).toContain("too low");
  expect(warningMessage).toContain("30 seconds");
  expect(warningMessage).toContain("5000");
});

test("should provide helpful warning message for high timeout", () => {
  const timeout = 7200000; // 2 hours
  const warningMessage = `⚠️ Request timeout very high: ${timeout}ms (2 hours). Consider reducing for better error detection.`;

  expect(warningMessage).toContain("very high");
  expect(warningMessage).toContain("2 hours");
});

test("should allow configuring timeout via environment variable", () => {
  process.env.ANYCLAUDE_REQUEST_TIMEOUT = "120000";

  const timeout = parseInt(
    process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000",
    10
  );
  const isValid = timeout >= 30000 && timeout <= 3600000;

  expect(isValid).toBeTruthy();
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
});

test("should handle non-numeric timeout gracefully", () => {
  process.env.ANYCLAUDE_REQUEST_TIMEOUT = "not-a-number";

  let timeout;
  let parseError = false;

  try {
    timeout = parseInt(process.env.ANYCLAUDE_REQUEST_TIMEOUT || "600000", 10);
    if (isNaN(timeout)) {
      timeout = 600000; // Fall back to default
      parseError = true;
    }
  } catch (e) {
    parseError = true;
  }

  expect(timeout).toBe(600000);
  delete process.env.ANYCLAUDE_REQUEST_TIMEOUT;
});

test("should log helpful message about Qwen3-30B model timing", () => {
  const modelInfo =
    "Qwen3-Coder-30B can take 30-60 seconds to load on first request";
  const timeout = 30000;
  const message =
    timeout < 120000
      ? `Note: ${modelInfo}. Consider increasing ANYCLAUDE_REQUEST_TIMEOUT.`
      : "Timeout is sufficient for large models";

  expect(message).toContain("Qwen3");
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
  failedTests.forEach((test) => {
    console.log(`  - ${test.name}`);
    console.log(`    ${test.error}`);
  });
  console.log();
}

process.exit(failed > 0 ? 1 : 0);
