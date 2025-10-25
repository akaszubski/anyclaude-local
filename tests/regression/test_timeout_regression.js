#!/usr/bin/env node
/**
 * Regression Test: Timeout Issues
 *
 * Bug: Fetch calls to LMStudio hang indefinitely without timeouts
 * Fix: Added AbortController with setTimeout to all network calls
 * Date fixed: 2025-10-25
 *
 * Ensures timeouts are present in all network operations.
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
    toBeGreaterThanOrEqual: (min) => {
      if (value < min) {
        throw new Error(`Expected >= ${min}, got ${value}`);
      }
    },
  };
}

// Tests
const mainTs = fs.readFileSync(
  path.join(__dirname, "../../src/main.ts"),
  "utf-8"
);

console.log("\nTimeout Regression Tests\n");

test("main.ts should have timeout on detectLoadedModel", () => {
  // Extract just the detectLoadedModel function
  const funcMatch = mainTs.match(
    /async function detectLoadedModel[\s\S]*?^}/m
  );
  if (!funcMatch) {
    throw new Error("detectLoadedModel function not found");
  }

  const funcBody = funcMatch[0];

  // Check this specific function has timeout protection
  const hasAbortController = funcBody.includes("new AbortController()");
  const hasSetTimeout = funcBody.includes("setTimeout");
  const hasClearTimeout = funcBody.includes("clearTimeout");

  expect(hasAbortController).toBe(true);
  expect(hasSetTimeout).toBe(true);
  expect(hasClearTimeout).toBe(true);
});

test("main.ts should have timeout on getModelName fallback", () => {
  // Extract just the getModelName function
  const funcMatch = mainTs.match(/async function getModelName[\s\S]*?^}/m);
  if (!funcMatch) {
    throw new Error("getModelName function not found");
  }

  const funcBody = funcMatch[0];

  // Check for fallback fetch with timeout (not just the detectLoadedModel call)
  const hasFallbackAbortController =
    (funcBody.match(/new AbortController\(\)/g) || []).length >= 1;
  const hasFallbackSetTimeout =
    (funcBody.match(/setTimeout/g) || []).length >= 1;

  expect(hasFallbackAbortController).toBe(true);
  expect(hasFallbackSetTimeout).toBe(true);
});

test("main.ts LMStudio fetch wrapper should have timeout", () => {
  const hasFetchWrapper = mainTs.includes("fetch: (async (url, init)");
  const wrapperHasAbortController =
    mainTs.match(/fetch:[\s\S]{0,1000}AbortController/) !== null;

  expect(hasFetchWrapper).toBe(true);
  expect(wrapperHasAbortController).toBe(true);
});

test("all AbortControllers should have clearTimeout cleanup", () => {
  const abortControllerCount = (
    mainTs.match(/new AbortController\(\)/g) || []
  ).length;
  const clearTimeoutCount = (mainTs.match(/clearTimeout\(/g) || []).length;

  // Every AbortController should have at least 2 clearTimeout calls
  expect(clearTimeoutCount).toBeGreaterThanOrEqual(abortControllerCount * 2);
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
