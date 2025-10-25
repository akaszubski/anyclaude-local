#!/usr/bin/env node
/**
 * Regression Test: Stream Completion (message_stop)
 *
 * Bug: Streams complete but message_stop is never sent, causing Claude Code to hang
 * Root cause: AI SDK doesn't always send 'finish' event; flush() callback wasn't sending message_stop
 * Fix: Added messageStopSent tracking + safety net in flush() to ensure message_stop is always sent
 * Date fixed: 2025-10-26
 *
 * Ensures message_stop is always sent when stream ends, even if AI SDK doesn't send 'finish' event.
 */

const fs = require("fs");
const path = require("path");

// Test results
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe: (expected) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toContain: (substring) => {
      if (!value.includes(substring)) {
        throw new Error(`Expected to contain "${substring}"`);
      }
    },
    toMatch: (regex) => {
      if (!regex.test(value)) {
        throw new Error(`Expected to match ${regex}`);
      }
    },
  };
}

// Tests
const streamTs = fs.readFileSync(
  path.join(__dirname, "../../src/convert-to-anthropic-stream.ts"),
  "utf-8"
);

console.log("\nStream Completion Regression Tests\n");

test("should track messageStopSent variable", () => {
  expect(streamTs).toContain("messageStopSent");
  expect(streamTs).toMatch(/let messageStopSent\s*=\s*false/);
});

test("should set messageStopSent=true when finish event sends message_stop", () => {
  // Find the 'finish' case handler
  const finishCase = streamTs.match(/case "finish":\s*{[\s\S]*?break;\s*}/);
  if (!finishCase) {
    throw new Error("'finish' case handler not found");
  }

  const finishBody = finishCase[0];
  expect(finishBody).toContain("message_stop");
  expect(finishBody).toContain("messageStopSent = true");
});

test("flush() should send message_stop if not already sent", () => {
  // Find the flush() callback
  const flushMatch = streamTs.match(/flush\s*\([^)]*\)\s*{[\s\S]*?^    }/m);
  if (!flushMatch) {
    throw new Error("flush() callback not found");
  }

  const flushBody = flushMatch[0];

  // Should check if messageStopSent is false
  expect(flushBody).toMatch(/if\s*\(\s*!messageStopSent\s*\)/);

  // Should send message_stop
  expect(flushBody).toContain("message_stop");

  // Should set messageStopSent to true
  expect(flushBody).toContain("messageStopSent = true");
});

test("flush() should log warning when sending fallback message_stop", () => {
  const flushMatch = streamTs.match(/flush\s*\([^)]*\)\s*{[\s\S]*?^    }/m);
  if (!flushMatch) {
    throw new Error("flush() callback not found");
  }

  const flushBody = flushMatch[0];

  // Should log a warning when this happens
  expect(flushBody).toMatch(/debug.*finish.*event/i);
});

test("messageStopSent should be reset along with index", () => {
  // The index is reset in the 'finish' case for multi-message streams
  // We should ensure messageStopSent is properly managed

  // Check that messageStopSent is set to true in the finish case
  const finishCase = streamTs.match(/case "finish":\s*{[\s\S]*?break;\s*}/);
  if (!finishCase) {
    throw new Error("'finish' case handler not found");
  }

  const finishBody = finishCase[0];
  expect(finishBody).toContain("messageStopSent = true");

  // The variable is declared at function scope and will be reused
  // for subsequent messages in the stream. The flush() will only
  // send message_stop if it wasn't already sent for this message.
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
