#!/usr/bin/env node
/**
 * Regression Test: Code Structure Validation
 *
 * Validates that main.ts maintains expected structure after refactoring.
 *
 * History:
 * - 2025-10-25: Original timeout tests (for detectLoadedModel/getModelName)
 * - 2025-10-26: Updated for refactored architecture (simpler provider-based design)
 *
 * Current tests validate:
 * - LMStudio provider configuration exists
 * - Fetch wrapper exists for parameter transformation
 * - Proxy creation and Claude Code spawning logic present
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
  };
}

// Tests
const mainTs = fs.readFileSync(
  path.join(__dirname, "../../src/main.ts"),
  "utf-8"
);

console.log("\nCode Structure Regression Tests\n");

test("main.ts should configure LMStudio provider", () => {
  expect(mainTs).toContain("createOpenAI");
  expect(mainTs).toContain("lmstudio");
  expect(mainTs).toContain("LMSTUDIO_URL");
});

test("main.ts should have fetch wrapper for parameter mapping", () => {
  expect(mainTs).toContain("fetch: (async (url, init)");
  expect(mainTs).toContain("max_tokens");
  expect(mainTs).toContain("max_completion_tokens");
});

test("main.ts should create Anthropic proxy", () => {
  expect(mainTs).toContain("createAnthropicProxy");
  expect(mainTs).toContain("defaultProvider");
  expect(mainTs).toContain("defaultModel");
});

test("main.ts should spawn Claude Code with proxy URL", () => {
  expect(mainTs).toContain("spawn");
  expect(mainTs).toContain("claude");
  expect(mainTs).toContain("ANTHROPIC_BASE_URL");
});

test("main.ts should support PROXY_ONLY mode", () => {
  expect(mainTs).toContain("PROXY_ONLY");
  expect(mainTs).toContain("Proxy only mode");
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
