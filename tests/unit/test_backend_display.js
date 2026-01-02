/**
 * Unit tests for backend-display.ts
 *
 * Tests the backend display name utility functions for user-friendly backend naming.
 */

const path = require("path");

// Import from built dist
const {
  getBackendDisplayName,
  getBackendLogPrefix,
} = require("../../dist/utils/backend-display");

console.log("\n=== Backend Display Utility Tests ===\n");

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${description}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected "${expected}" but got "${actual}"`);
      }
    },
    toContain(substring) {
      if (!actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
  };
}

// ============================================================================
// Tests: getBackendDisplayName()
// ============================================================================

console.log("Testing: getBackendDisplayName()...\n");

test("should return 'Claude' for claude mode", () => {
  expect(getBackendDisplayName("claude")).toBe("Claude");
});

test("should return 'Local' for local mode", () => {
  expect(getBackendDisplayName("local")).toBe("Local");
});

test("should return 'LMStudio' for lmstudio mode (deprecated)", () => {
  expect(getBackendDisplayName("lmstudio")).toBe("LMStudio");
});

test("should return 'OpenRouter' for openrouter mode", () => {
  expect(getBackendDisplayName("openrouter")).toBe("OpenRouter");
});

test("should return 'MLX Cluster' for mlx-cluster mode", () => {
  expect(getBackendDisplayName("mlx-cluster")).toBe("MLX Cluster");
});

test("should return 'Unknown Backend' for unknown mode", () => {
  expect(getBackendDisplayName("invalid")).toBe("Unknown Backend");
});

test("should return 'Unknown Backend' for empty string", () => {
  expect(getBackendDisplayName("")).toBe("Unknown Backend");
});

// ============================================================================
// Tests: getBackendLogPrefix()
// ============================================================================

console.log("\nTesting: getBackendLogPrefix()...\n");

test("should return '[Claude]' for claude mode", () => {
  expect(getBackendLogPrefix("claude")).toBe("[Claude]");
});

test("should return '[Local]' for local mode", () => {
  expect(getBackendLogPrefix("local")).toBe("[Local]");
});

test("should return '[LMStudio]' for lmstudio mode (deprecated)", () => {
  expect(getBackendLogPrefix("lmstudio")).toBe("[LMStudio]");
});

test("should return '[OpenRouter]' for openrouter mode", () => {
  expect(getBackendLogPrefix("openrouter")).toBe("[OpenRouter]");
});

test("should return '[MLX Cluster]' for mlx-cluster mode", () => {
  expect(getBackendLogPrefix("mlx-cluster")).toBe("[MLX Cluster]");
});

test("should return '[Unknown Backend]' for unknown mode", () => {
  expect(getBackendLogPrefix("invalid")).toBe("[Unknown Backend]");
});

test("prefix should start with [", () => {
  expect(getBackendLogPrefix("claude").startsWith("[")).toBe(true);
});

test("prefix should end with ]", () => {
  expect(getBackendLogPrefix("claude").endsWith("]")).toBe(true);
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50) + "\n");

if (failed > 0) {
  console.log("❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("✅ All backend display utility tests passed!");
  process.exit(0);
}
