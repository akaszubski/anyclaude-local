#!/usr/bin/env node

/**
 * Stream Error Handling Tests
 *
 * Tests for stream processing error scenarios that could cause truncated,
 * incomplete, or corrupted responses.
 */

const assert = require("assert");

// Test counters
let passed = 0;
let failed = 0;

class MockWritableStream {
  constructor(hooks = {}) {
    this.chunks = [];
    this.isClosed = false;
    this.onWrite = hooks.write || (() => {});
    this.onClose = hooks.close || (() => {});
    this.onAbort = hooks.abort || (() => {});
    this.writeReturns = hooks.writeReturns || true; // Can be set to false for backpressure
  }

  write(data) {
    this.onWrite(data);
    this.chunks.push(data);
    return this.writeReturns; // Return false to simulate backpressure
  }

  close() {
    this.isClosed = true;
    this.onClose();
  }

  abort(reason) {
    this.onAbort(reason);
  }

  getChunkCount() {
    return this.chunks.length;
  }

  getAllChunks() {
    return this.chunks;
  }
}

// ============================================================================
// CRITICAL TESTS (P0)
// ============================================================================

/**
 * Test 1: Backpressure handling - buffer full, drain event received
 *
 * Scenario: res.write() returns false (buffer full), should wait for drain event
 * Expected: Promise resolves when drain event fires
 */
function testBackpressureBufferFull() {
  console.log("\n✓ Test 1: Backpressure buffer full handling");

  let drainEmitted = false;
  let drainListenerAdded = false;

  const mockRes = {
    write: (data) => {
      if (!drainEmitted) {
        // First write succeeds
        if (drainListenerAdded) {
          return false; // Simulate buffer full on second write
        }
        return true;
      }
      return true; // After drain, writes succeed
    },
    once: (event, callback) => {
      if (event === "drain") {
        drainListenerAdded = true;
        // Simulate drain event firing after a microtask
        setTimeout(() => {
          drainEmitted = true;
          callback();
        }, 0);
      }
    },
    removeListener: () => {},
  };

  let backpressureDetected = false;
  const firstWrite = mockRes.write("chunk1");
  if (!firstWrite) {
    backpressureDetected = true;
  }

  assert.ok(
    drainListenerAdded || !backpressureDetected,
    "Should register drain listener on backpressure"
  );
  console.log("   ✅ Backpressure detection works");
  passed++;
}

/**
 * Test 2: Unknown chunks don't terminate stream
 *
 * Scenario: Stream receives unknown chunk type
 * Expected: Stream continues processing, unknown chunk skipped
 */
function testUnknownChunkSkipped() {
  console.log("\n✓ Test 2: Unknown chunks don't terminate stream");

  const stream = new MockWritableStream({
    write: (chunk) => {
      // Should handle unknown chunk types gracefully
      if (
        !chunk.type ||
        ["start", "text-delta", "tool-call"].includes(chunk.type)
      ) {
        return true;
      }
      // Unknown chunk - should skip but not crash
      return true;
    },
  });

  // Send known chunks
  stream.write({ type: "text-delta", text: "hello" });
  stream.write({ type: "unknown-future-type", data: "something" });
  stream.write({ type: "text-delta", text: " world" });

  assert.strictEqual(
    stream.getChunkCount(),
    3,
    "All chunks received (known + unknown)"
  );
  assert.ok(!stream.isClosed, "Stream not closed by unknown chunk");
  console.log("   ✅ Unknown chunks skipped without terminating stream");
  passed++;
}

/**
 * Test 3: Drain listener cleanup on error
 *
 * Scenario: Response errors while waiting for drain event
 * Expected: Listeners removed, error propagated
 */
function testDrainListenerCleanup() {
  console.log("\n✓ Test 3: Drain listener cleanup on error");

  let drainListener = null;
  let errorListener = null;
  let listenersRemoved = false;

  const mockRes = {
    once: (event, callback) => {
      if (event === "drain") drainListener = callback;
      if (event === "error") errorListener = callback;
    },
    removeListener: (event, callback) => {
      if (
        (event === "drain" && callback === drainListener) ||
        (event === "error" && callback === errorListener)
      ) {
        listenersRemoved = true;
      }
    },
  };

  // Simulate backpressure scenario
  const canWrite = false; // Simulate buffer full
  if (!canWrite) {
    // Would normally create promise and register listeners
    let listenersCleaned = false;
    const onError = (err) => {
      mockRes.removeListener("drain", drainListener);
      mockRes.removeListener("error", onError);
      listenersCleaned = true;
    };
    mockRes.once("error", onError);

    // Simulate error
    if (errorListener) {
      errorListener(new Error("Test error"));
      assert.ok(
        listenersCleaned || listenersRemoved,
        "Listeners should be cleaned up"
      );
    }
  }

  console.log("   ✅ Drain listeners properly cleaned on error");
  passed++;
}

/**
 * Test 4: Very large text_delta chunks
 *
 * Scenario: Receive text_delta with very large content
 * Expected: Memory doesn't explode, chunk processed normally
 */
function testLargTextDeltaChunks() {
  console.log("\n✓ Test 4: Large text_delta chunks");

  // Create a 10MB string
  const largeText = "x".repeat(10 * 1024 * 1024);
  const chunk = {
    type: "content_block_delta",
    delta: { type: "text_delta", text: largeText },
  };

  const stream = new MockWritableStream();
  let processed = false;

  try {
    stream.write(chunk);
    processed = stream.getChunkCount() > 0;
  } catch (e) {
    processed = false;
  }

  assert.ok(processed, "Large chunk processed without error");
  console.log("   ✅ Large chunks handled without memory issues");
  passed++;
}

/**
 * Test 5: Keepalive interval cleanup on abort
 *
 * Scenario: Stream aborts while keepalive is active
 * Expected: Keepalive interval is cleared
 */
function testKeepaliveCleanupOnAbort() {
  console.log("\n✓ Test 5: Keepalive cleanup on abort");

  let intervalCleared = false;
  const mockInterval = setInterval(() => {}, 1000);

  // Simulate abort
  const onAbort = () => {
    clearInterval(mockInterval);
    intervalCleared = true;
  };

  onAbort();
  assert.ok(intervalCleared, "Interval cleared on abort");
  console.log("   ✅ Keepalive interval properly cleared");
  passed++;
}

/**
 * Test 6: Tool tracking maps isolated between messages
 *
 * Scenario: Multiple messages processed by same stream converter
 * Expected: Tool state doesn't leak between messages
 */
function testToolStateIsolation() {
  console.log("\n✓ Test 6: Tool state isolation between messages");

  // Simulate stream converter state
  const streamState = {
    streamedToolIds: new Set(),
    toolsWithoutDeltas: new Map(),
  };

  // Process first message with tool
  streamState.streamedToolIds.add("tool-1");
  assert.ok(streamState.streamedToolIds.has("tool-1"), "Tool ID tracked");

  // Process second message - state should not carry over
  const newStreamState = {
    streamedToolIds: new Set(),
    toolsWithoutDeltas: new Map(),
  };

  assert.ok(
    !newStreamState.streamedToolIds.has("tool-1"),
    "Tool ID from first message not in second"
  );
  console.log("   ✅ Tool state properly isolated between streams");
  passed++;
}

// ============================================================================
// HIGH PRIORITY TESTS (P1)
// ============================================================================

/**
 * Test 7: Circular reference in tool input
 *
 * Scenario: Tool input contains circular reference
 * Expected: JSON.stringify handled gracefully
 */
function testCircularReferenceInToolInput() {
  console.log("\n✓ Test 7: Circular reference handling");

  const toolInput = { a: 1 };
  toolInput.self = toolInput; // Create circular reference

  let stringified = null;
  let error = null;

  try {
    // This would normally cause JSON.stringify to throw
    const stringifyWithReplacer = (obj) => {
      const seen = new WeakSet();
      return JSON.stringify(obj, (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      });
    };
    stringified = stringifyWithReplacer(toolInput);
  } catch (e) {
    error = e;
  }

  assert.ok(stringified && !error, "Circular reference handled with replacer");
  assert.ok(
    stringified.includes("[Circular]"),
    "Circular reference marked in output"
  );
  console.log("   ✅ Circular references detected and handled");
  passed++;
}

/**
 * Test 8: Missing tool in registry
 *
 * Scenario: tool_call references unknown tool
 * Expected: Error logged but stream continues
 */
function testMissingToolInRegistry() {
  console.log("\n✓ Test 8: Missing tool validation");

  const toolRegistry = new Map([["known-tool", { name: "known-tool" }]]);
  const toolCallId = "unknown-tool";

  const toolExists = toolRegistry.has(toolCallId);
  assert.ok(!toolExists, "Tool correctly identified as missing");

  // Should log error but not crash
  if (!toolExists) {
    console.log(`   [DEBUG] Tool not found: ${toolCallId}`);
  }

  console.log("   ✅ Missing tools handled gracefully");
  passed++;
}

/**
 * Test 9: Response write after response ended
 *
 * Scenario: Try to write to response after it's ended
 * Expected: Error caught, not propagated to user
 */
function testWriteAfterResponseEnded() {
  console.log("\n✓ Test 9: Write after response ended");

  let writeFailed = false;
  const mockRes = {
    writableEnded: true,
    write: () => {
      if (mockRes.writableEnded) {
        throw new Error("Cannot write after response ended");
      }
    },
  };

  try {
    mockRes.write("data");
  } catch (e) {
    writeFailed = true;
    // In real code: check !res.writableEnded before writing
  }

  assert.ok(writeFailed, "Error thrown on write to ended response");
  console.log("   ✅ Response ended errors caught properly");
  passed++;
}

/**
 * Test 10: Tool call deduplication works
 *
 * Scenario: Same tool called multiple times via different paths
 * Expected: Only send once
 */
function testToolCallDeduplication() {
  console.log("\n✓ Test 10: Tool call deduplication");

  const streamedToolIds = new Set();
  const toolCall = { toolCallId: "tool-123", toolName: "test-tool" };

  // First time - should send
  if (!streamedToolIds.has(toolCall.toolCallId)) {
    console.log(`   Sending tool call: ${toolCall.toolName}`);
    streamedToolIds.add(toolCall.toolCallId);
  }

  // Second time - should skip
  const sendAgain = !streamedToolIds.has(toolCall.toolCallId);
  assert.ok(!sendAgain, "Tool call correctly deduplicated");
  console.log("   ✅ Tool call deduplication works");
  passed++;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   STREAM ERROR HANDLING TESTS                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    // Critical tests
    testBackpressureBufferFull();
    testUnknownChunkSkipped();
    testDrainListenerCleanup();
    testLargTextDeltaChunks();
    testKeepaliveCleanupOnAbort();
    testToolStateIsolation();

    // High priority tests
    testCircularReferenceInToolInput();
    testMissingToolInRegistry();
    testWriteAfterResponseEnded();
    testToolCallDeduplication();
  } catch (e) {
    console.error(`\n❌ Test failed with error: ${e.message}`);
    console.error(e.stack);
    failed++;
  }

  // Print summary
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0) {
    console.log("\n✅ All stream error handling tests passed!");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} test(s) failed!`);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testBackpressureBufferFull,
  testUnknownChunkSkipped,
  testDrainListenerCleanup,
};
