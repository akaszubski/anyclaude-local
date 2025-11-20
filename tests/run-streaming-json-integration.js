#!/usr/bin/env node
/**
 * Test runner for streaming JSON parser integration tests
 * Provides Jest-compatible API for running the tests
 */

let passed = 0;
let failed = 0;

// Jest-compatible test framework
global.describe = (name, fn) => {
  console.log("\n" + name);
  fn();
};

global.test = (name, fn) => {
  try {
    fn();
    console.log("  ✓ " + name);
    passed++;
  } catch (err) {
    console.log("  ✗ " + name);
    console.log("    Error: " + err.message);
    failed++;
  }
};

// Jest-compatible expect API
global.expect = (actual) => {
  const matchers = {
    toBe: (expected) => {
      if (actual !== expected)
        throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toEqual: (expected) => {
      const a = JSON.stringify(actual),
        e = JSON.stringify(expected);
      if (a !== e) throw new Error(`Expected ${e}, got ${a}`);
    },
    toContain: (expected) => {
      if (!actual.includes(expected))
        throw new Error(`Expected to contain ${expected}`);
    },
    toBeDefined: () => {
      if (actual === undefined) throw new Error("Expected value to be defined");
    },
    toBeGreaterThan: (expected) => {
      if (actual <= expected)
        throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeGreaterThanOrEqual: (expected) => {
      if (actual < expected)
        throw new Error(`Expected ${actual} >= ${expected}`);
    },
    toBeLessThan: (expected) => {
      if (actual >= expected)
        throw new Error(`Expected ${actual} < ${expected}`);
    },
    toThrow: () => {
      try {
        actual();
        throw new Error("Expected function to throw");
      } catch (err) {
        // Success - function threw
      }
    },
    not: {
      toThrow: () => {
        try {
          actual();
          // Success - function didn't throw
        } catch (err) {
          throw new Error(
            `Expected function not to throw, but it threw: ${err.message}`
          );
        }
      },
      toContain: (expected) => {
        if (actual.includes(expected))
          throw new Error(`Expected not to contain ${expected}`);
      },
    },
  };
  return matchers;
};

console.log("\n============================================================");
console.log("Running: Streaming JSON Parser Integration Tests");
console.log("============================================================");

// Run the integration tests
require("./integration/streaming-json-performance.test.js");

console.log("\n============================================================");
console.log(
  `Results: ${passed} passed, ${failed} failed (${passed + failed} total)`
);
console.log("============================================================\n");

process.exit(failed > 0 ? 1 : 0);
