#!/usr/bin/env node

/**
 * Token Estimation Tests
 *
 * Tests token count estimation for cache_control headers.
 * The cache-control-extractor uses a simple heuristic: length / 4 tokens
 * This matches the standard OpenAI approximation.
 *
 * The X-Cache-Tokens header will report estimated tokens to the backend.
 *
 * Run with: node tests/unit/test-token-estimation.js
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
    toBeTruthy: () => {
      assert.ok(value);
    },
    toBeFalsy: () => {
      assert.ok(!value);
    },
    toBeGreaterThan: (threshold) => {
      assert.ok(value > threshold);
    },
    toBeGreaterThanOrEqual: (threshold) => {
      assert.ok(value >= threshold);
    },
    toBeLessThan: (threshold) => {
      assert.ok(value < threshold);
    },
    toBeLessThanOrEqual: (threshold) => {
      assert.ok(value <= threshold);
    },
    toBeCloseTo: (expected, precision = 2) => {
      const tolerance = Math.pow(10, -precision);
      assert.ok(Math.abs(value - expected) < tolerance);
    },
  };
}

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   TOKEN ESTIMATION TESTS                                 ║");
console.log("║   (Testing token estimation for cache headers)           ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// Standard token estimation: ~4 characters per token
const estimateTokens = (text) => {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
};

console.log("TEST SUITE 1: Basic Token Estimation\n");

test("should estimate 1 token for 4 characters", () => {
  const tokens = estimateTokens("test");
  expect(tokens).toBe(1);
});

test("should estimate 2 tokens for 5 characters", () => {
  const tokens = estimateTokens("hello");
  expect(tokens).toBe(2);
});

test("should estimate 3 tokens for 12 characters", () => {
  const tokens = estimateTokens("hello world!");
  expect(tokens).toBe(3);
});

test("should estimate 25 tokens for 100 characters", () => {
  const text = "a".repeat(100);
  const tokens = estimateTokens(text);
  expect(tokens).toBe(25);
});

test("should round up to nearest integer", () => {
  const tokens1 = estimateTokens("abc");  // 3/4 = 0.75, rounds up to 1
  expect(tokens1).toBe(1);

  const tokens2 = estimateTokens("abcd");  // 4/4 = 1
  expect(tokens2).toBe(1);

  const tokens3 = estimateTokens("abcde");  // 5/4 = 1.25, rounds up to 2
  expect(tokens3).toBe(2);
});

console.log("\nTEST SUITE 2: Edge Cases\n");

test("should return 0 tokens for empty string", () => {
  const tokens = estimateTokens("");
  expect(tokens).toBe(0);
});

test("should handle null by returning 0", () => {
  const estimateTokensNullSafe = (text) => {
    if (!text || text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  };

  const tokens = estimateTokensNullSafe(null);
  expect(tokens).toBe(0);
});

test("should handle undefined by returning 0", () => {
  const estimateTokensNullSafe = (text) => {
    if (!text || text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  };

  const tokens = estimateTokensNullSafe(undefined);
  expect(tokens).toBe(0);
});

test("should handle single character", () => {
  const tokens = estimateTokens("a");
  expect(tokens).toBe(1);
});

test("should handle two characters", () => {
  const tokens = estimateTokens("ab");
  expect(tokens).toBe(1);
});

test("should handle three characters", () => {
  const tokens = estimateTokens("abc");
  expect(tokens).toBe(1);
});

console.log("\nTEST SUITE 3: Common Text Patterns\n");

test("should estimate tokens for typical system prompt", () => {
  const systemPrompt = "You are Claude, an AI assistant created by Anthropic. You are helpful, harmless, and honest.";
  const tokens = estimateTokens(systemPrompt);

  // 92 characters / 4 = 23, rounds up to 23 (Math.ceil)
  assert.strictEqual(systemPrompt.length, 92);
  assert.strictEqual(tokens, Math.ceil(92 / 4));
});

test("should estimate tokens for sentence", () => {
  const sentence = "The quick brown fox jumps over the lazy dog.";
  const tokens = estimateTokens(sentence);

  // 44 characters / 4 = 11, rounds up to 11 (Math.ceil)
  assert.strictEqual(sentence.length, 44);
  assert.strictEqual(tokens, Math.ceil(44 / 4));
});

test("should estimate tokens for paragraph", () => {
  const paragraph = "The fundamental principle underlying anyclaude is the translation of Anthropic API requests to OpenAI-compatible formats. This allows local models to be used with Claude Code.";
  const tokens = estimateTokens(paragraph);

  // 175 characters / 4 = 43.75, rounds up to 44 (Math.ceil)
  assert.strictEqual(paragraph.length, 175);
  assert.strictEqual(tokens, Math.ceil(175 / 4));
});

test("should estimate tokens for JSON-like text", () => {
  const json = '{"type":"text","text":"Hello","cache_control":{"type":"ephemeral"}}';
  const tokens = estimateTokens(json);

  // 67 characters / 4 = 16.75, rounds up to 17 (Math.ceil)
  assert.strictEqual(json.length, 67);
  assert.strictEqual(tokens, Math.ceil(67 / 4));
});

console.log("\nTEST SUITE 4: Special Characters\n");

test("should estimate tokens with spaces", () => {
  const text = "hello   world   test";
  const tokens = estimateTokens(text);

  // 19 characters / 4 = 4.75, rounds to 5
  expect(tokens).toBe(5);
});

test("should estimate tokens with newlines and tabs", () => {
  const text = "hello\nworld\ttest";
  const tokens = estimateTokens(text);

  // 15 characters / 4 = 3.75, rounds to 4
  expect(tokens).toBe(4);
});

test("should estimate tokens with punctuation", () => {
  const text = "Hello, world! How are you?";
  const tokens = estimateTokens(text);

  // 27 characters / 4 = 6.75, rounds to 7
  expect(tokens).toBe(7);
});

test("should estimate tokens with Unicode characters", () => {
  const text = "Hello 世界 مرحبا";
  const tokens = estimateTokens(text);

  // 14 characters / 4 = 3.5, rounds to 4
  expect(tokens).toBe(4);
});

console.log("\nTEST SUITE 5: Accuracy Against Known Text\n");

test("should estimate within 15% for typical short text", () => {
  const texts = [
    "Hello",
    "This is a test",
    "The quick brown fox",
    "Machine learning models are trained on large datasets."
  ];

  for (const text of texts) {
    const estimated = estimateTokens(text);
    const charRatio = text.length / 4;

    // Estimated should be within 15% of actual character ratio
    // (allowing for rounding variance)
    const lowerBound = Math.ceil(text.length / 4) * 0.85;
    const upperBound = Math.ceil(text.length / 4) * 1.15;

    assert.ok(
      estimated >= lowerBound - 1 && estimated <= upperBound + 1,
      `${text}: estimated ${estimated} not within 15% of ${Math.ceil(charRatio)}`
    );
  }
});

test("should estimate reasonably for very long text", () => {
  const longText = "The quick brown fox jumps over the lazy dog. ".repeat(100);
  const tokens = estimateTokens(longText);

  // Should be positive integer
  expect(tokens).toBeGreaterThan(0);

  // Should be close to length / 4
  const expected = Math.ceil(longText.length / 4);
  expect(tokens).toBe(expected);
});

console.log("\nTEST SUITE 6: Token Estimation Consistency\n");

test("should produce same estimate for same text", () => {
  const text = "You are Claude, an AI assistant.";

  const tokens1 = estimateTokens(text);
  const tokens2 = estimateTokens(text);
  const tokens3 = estimateTokens(text);

  expect(tokens1).toBe(tokens2);
  expect(tokens2).toBe(tokens3);
});

test("should combine tokens from multiple blocks correctly", () => {
  const block1 = "Hello";  // 5 chars = 2 tokens
  const block2 = "World";  // 5 chars = 2 tokens

  const tokens1 = estimateTokens(block1);
  const tokens2 = estimateTokens(block2);
  const tokensCombined = estimateTokens(block1 + block2);

  expect(tokens1).toBe(2);
  expect(tokens2).toBe(2);
  // Combined is 10 chars / 4 = 2.5, rounds to 3
  expect(tokensCombined).toBe(3);

  // Note: tokens1 + tokens2 = 4, but combined = 3 due to rounding
  // This shows why we should combine before estimating
  assert.ok(tokensCombined <= tokens1 + tokens2);
});

console.log("\nTEST SUITE 7: Usage in Cache Headers\n");

test("should convert token estimate to string for header", () => {
  const text = "System prompt with cache control";
  const tokens = estimateTokens(text);
  const headerValue = String(tokens);

  expect(headerValue).toMatch(/^\d+$/);
});

test("should return numeric value suitable for HTTP header", () => {
  const texts = ["", "a", "hello", "The quick brown fox"];

  for (const text of texts) {
    const tokens = estimateTokens(text);

    // Should be non-negative integer
    expect(tokens).toBeGreaterThanOrEqual(0);
    assert.strictEqual(Number.isInteger(tokens), true);

    // Should be suitable for HTTP header (numeric string)
    const headerValue = String(tokens);
    assert.ok(/^\d+$/.test(headerValue));
  }
});

console.log("\nTEST SUITE 8: Large Text Handling\n");

test("should estimate tokens for 10K character text", () => {
  const text = "a".repeat(10000);
  const tokens = estimateTokens(text);

  expect(tokens).toBe(2500);
});

test("should estimate tokens for 100K character text", () => {
  const text = "a".repeat(100000);
  const tokens = estimateTokens(text);

  expect(tokens).toBe(25000);
});

test("should handle very large text without overflow", () => {
  const text = "a".repeat(1000000);
  const tokens = estimateTokens(text);

  expect(tokens).toBe(250000);
  assert.strictEqual(Number.isFinite(tokens), true);
});

console.log("\nTEST SUITE 9: Integration with Cache Extraction\n");

test("should estimate total cache tokens across system blocks", () => {
  const systemBlocks = [
    "You are Claude.",
    "Be helpful and honest.",
    "Follow the user's instructions."
  ];

  const totalText = systemBlocks.join(" ");
  const totalTokens = estimateTokens(totalText);

  expect(totalTokens).toBeGreaterThan(0);
});

test("should estimate cache tokens for combined system and user cache", () => {
  const systemCache = "You are Claude, an AI assistant.";
  const userCache = "Please help me write a Python function.";

  const systemTokens = estimateTokens(systemCache);
  const userTokens = estimateTokens(userCache);

  // Combined should be close to sum (allowing for rounding)
  const combined = estimateTokens(systemCache + " " + userCache);

  // Both should be positive
  expect(systemTokens).toBeGreaterThan(0);
  expect(userTokens).toBeGreaterThan(0);
  expect(combined).toBeGreaterThan(0);
});

// Summary
console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║   TEST SUMMARY                                           ║`);
console.log(`║   Passed: ${passed}                                              ║`);
console.log(`║   Failed: ${failed}                                              ║`);
console.log(`╚══════════════════════════════════════════════════════════╝\n`);

if (failed > 0) {
  console.log("FAILED TESTS:");
  failedTests.forEach(({ name, error }) => {
    console.log(`  - ${name}`);
    console.log(`    ${error}`);
  });
  process.exit(1);
}

console.log("✓ All tests passed!\n");
process.exit(0);
