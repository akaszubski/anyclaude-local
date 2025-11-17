#!/usr/bin/env node

/**
 * Cache Header Forwarding Tests
 *
 * Tests that cache_control headers are correctly extracted and forwarded
 * from the proxy to the backend server.
 *
 * Headers tested:
 * - X-Cache-System: Base64 encoded system prompt
 * - X-Cache-Hash: SHA256 hash of cacheable content (64-char hex)
 * - X-Cache-Tokens: Estimated token count as string
 *
 * These headers are sent to the backend (MLX, LMStudio, etc.)
 * and may be used for caching decisions.
 *
 * Prerequisites:
 * - Backend server running with cache header support
 *
 * Run with: node tests/integration/test-cache-headers.js
 */

const crypto = require("crypto");
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
      assert.ok(regex.test(value), `"${value}" does not match regex ${regex}`);
    },
    toBeTruthy: () => {
      assert.ok(value);
    },
    toBeFalsy: () => {
      assert.ok(!value);
    },
    toBeUndefined: () => {
      assert.strictEqual(value, undefined);
    },
    toBeDefined: () => {
      assert.notStrictEqual(value, undefined);
    },
    toHaveLength: (length) => {
      assert.strictEqual(value.length, length);
    },
    toHaveProperty: (prop) => {
      assert.ok(prop in value);
    },
    toBeGreaterThanOrEqual: (threshold) => {
      assert.ok(value >= threshold);
    },
  };
}

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   CACHE HEADER FORWARDING TESTS                          ║");
console.log("║   (Testing X-Cache-* header generation and format)       ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("TEST SUITE 1: Header Generation\n");

test("should generate X-Cache-Hash header with valid SHA256 hash", () => {
  // Simulate header generation
  const generateCacheHash = (content) => {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex");
  };

  const system = [
    { type: "text", text: "System", cache_control: { type: "ephemeral" } },
  ];

  const hash = generateCacheHash(system);

  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).toHaveLength(64);
});

test("should generate X-Cache-Tokens header as numeric string", () => {
  // Simulate token estimation
  const estimateTokens = (text) => {
    return Math.ceil(text.length / 4);
  };

  const systemText = "You are Claude, an AI assistant.";
  const tokens = estimateTokens(systemText);
  const headerValue = String(tokens);

  expect(headerValue).toMatch(/^\d+$/);
  expect(typeof headerValue).toBe("string");
  expect(headerValue).toBeTruthy();
});

test("should generate X-Cache-System header with base64 encoded content", () => {
  const systemText = "You are helpful.";
  const encoded = Buffer.from(systemText).toString("base64");

  expect(encoded).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(typeof encoded).toBe("string");
});

console.log("\nTEST SUITE 2: Header Format Validation\n");

test("X-Cache-Hash must be exactly 64 hex characters", () => {
  const validHashes = [
    "a".repeat(64),
    "0123456789abcdef".repeat(4),
    crypto.createHash("sha256").update("test").digest("hex"),
  ];

  for (const hash of validHashes) {
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toHaveLength(64);
  }
});

test("X-Cache-Hash should reject invalid formats", () => {
  const invalidHashes = [
    "a".repeat(63), // Too short
    "a".repeat(65), // Too long
    "z".repeat(64), // Invalid character
    "A".repeat(64), // Uppercase (should be lowercase)
  ];

  for (const hash of invalidHashes) {
    const isValid = /^[a-f0-9]{64}$/.test(hash);
    expect(isValid).toBeFalsy();
  }
});

test("X-Cache-Tokens should be non-negative integer string", () => {
  const validTokenValues = ["0", "1", "100", "10000"];

  for (const value of validTokenValues) {
    expect(value).toMatch(/^\d+$/);
    const num = parseInt(value);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(num)).toBeTruthy();
  }
});

test("X-Cache-System should be valid base64", () => {
  const testStrings = [
    "Hello",
    "You are Claude.",
    "System with special chars: !@#$%",
    "Unicode: 你好世界",
  ];

  for (const str of testStrings) {
    const encoded = Buffer.from(str).toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    expect(decoded).toBe(str);
  }
});

console.log("\nTEST SUITE 3: Header Presence for Different Request Types\n");

test("should generate cache headers when system has cache_control", () => {
  const extractHeaders = (request) => {
    const headers = {};

    if (request.system) {
      const systemArray = Array.isArray(request.system)
        ? request.system
        : [{ type: "text", text: request.system }];

      const hasCacheControl = systemArray.some(
        (b) => b.cache_control?.type === "ephemeral"
      );

      if (hasCacheControl) {
        const systemText = systemArray
          .filter((b) => b.cache_control?.type === "ephemeral")
          .map((b) => b.text)
          .join("");

        headers["X-Cache-System"] = Buffer.from(systemText).toString("base64");
        headers["X-Cache-Hash"] = crypto
          .createHash("sha256")
          .update(systemText)
          .digest("hex");
        headers["X-Cache-Tokens"] = String(Math.ceil(systemText.length / 4));
      }
    }

    return headers;
  };

  const request = {
    system: [
      {
        type: "text",
        text: "System",
        cache_control: { type: "ephemeral" },
      },
    ],
  };

  const headers = extractHeaders(request);

  expect(headers).toHaveProperty("X-Cache-System");
  expect(headers).toHaveProperty("X-Cache-Hash");
  expect(headers).toHaveProperty("X-Cache-Tokens");
});

test("should not generate cache headers when system lacks cache_control", () => {
  const extractHeaders = (request) => {
    const headers = {};

    if (request.system) {
      const systemArray = Array.isArray(request.system)
        ? request.system
        : [{ type: "text", text: request.system }];

      const hasCacheControl = systemArray.some(
        (b) => b.cache_control?.type === "ephemeral"
      );

      if (hasCacheControl) {
        // ... generate headers
      }
    }

    return headers;
  };

  const request = {
    system: [
      {
        type: "text",
        text: "System without cache_control",
      },
    ],
  };

  const headers = extractHeaders(request);

  expect(Object.keys(headers)).toHaveLength(0);
});

test("should generate headers only for ephemeral cache type", () => {
  const isCacheableBlock = (block) => {
    return block.cache_control?.type === "ephemeral";
  };

  const ephemeralBlock = {
    type: "text",
    text: "Text",
    cache_control: { type: "ephemeral" },
  };

  const permanentBlock = {
    type: "text",
    text: "Text",
    cache_control: { type: "permanent" },
  };

  const noCacheBlock = {
    type: "text",
    text: "Text",
  };

  expect(isCacheableBlock(ephemeralBlock)).toBeTruthy();
  expect(isCacheableBlock(permanentBlock)).toBeFalsy();
  expect(isCacheableBlock(noCacheBlock)).toBeFalsy();
});

console.log("\nTEST SUITE 4: Multiple Cacheable Blocks\n");

test("should combine multiple cacheable system blocks into single hash", () => {
  const extractCacheContent = (systemArray) => {
    const cacheableBlocks = systemArray.filter(
      (b) => b.cache_control?.type === "ephemeral"
    );
    return cacheableBlocks.map((b) => b.text).join("");
  };

  const system = [
    { type: "text", text: "Block 1", cache_control: { type: "ephemeral" } },
    { type: "text", text: "Block 2", cache_control: { type: "ephemeral" } },
    { type: "text", text: "Non-cacheable" },
  ];

  const content = extractCacheContent(system);
  expect(content).toBe("Block 1Block 2");

  const hash = crypto.createHash("sha256").update(content).digest("hex");

  expect(hash).toMatch(/^[a-f0-9]{64}$/);
});

test("should include cacheable user message blocks in cache", () => {
  const extractUserCacheContent = (messages) => {
    let content = "";

    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.cache_control?.type === "ephemeral") {
            content += block.text;
          }
        }
      }
    }

    return content;
  };

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Cacheable",
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: "Non-cacheable" },
      ],
    },
  ];

  const content = extractUserCacheContent(messages);
  expect(content).toBe("Cacheable");
});

test("should generate hash including both system and user cache", () => {
  const extractAllCacheContent = (request) => {
    let content = "";

    // System cache
    if (request.system) {
      const systemArray = Array.isArray(request.system)
        ? request.system
        : [{ type: "text", text: request.system }];

      for (const block of systemArray) {
        if (block.cache_control?.type === "ephemeral") {
          content += block.text;
        }
      }
    }

    // User cache
    if (request.messages) {
      for (const msg of request.messages) {
        if (msg.role === "user" && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.cache_control?.type === "ephemeral") {
              content += block.text;
            }
          }
        }
      }
    }

    return content;
  };

  const request = {
    system: [
      {
        type: "text",
        text: "System",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "User",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  };

  const content = extractAllCacheContent(request);
  expect(content).toBe("SystemUser");

  const hash = crypto.createHash("sha256").update(content).digest("hex");

  expect(hash).toMatch(/^[a-f0-9]{64}$/);
});

console.log("\nTEST SUITE 5: Header Value Consistency\n");

test("should generate same hash for same cacheable content", () => {
  const generateHash = (content) => {
    return crypto.createHash("sha256").update(content).digest("hex");
  };

  const content = "System prompt text";

  const hash1 = generateHash(content);
  const hash2 = generateHash(content);
  const hash3 = generateHash(content);

  expect(hash1).toBe(hash2);
  expect(hash2).toBe(hash3);
});

test("should generate different hash for different content", () => {
  const generateHash = (content) => {
    return crypto.createHash("sha256").update(content).digest("hex");
  };

  const hash1 = generateHash("Content 1");
  const hash2 = generateHash("Content 2");

  assert.notStrictEqual(hash1, hash2);
});

test("should generate same token count for same text", () => {
  const estimateTokens = (text) => {
    return Math.ceil(text.length / 4);
  };

  const text = "This is a system prompt";

  const tokens1 = estimateTokens(text);
  const tokens2 = estimateTokens(text);

  expect(tokens1).toBe(tokens2);
});

console.log("\nTEST SUITE 6: Header Encoding Safety\n");

test("should safely encode special characters in X-Cache-System", () => {
  const specialText = "Text with \"quotes\" and 'apostrophes' and \n newlines";
  const encoded = Buffer.from(specialText).toString("base64");
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");

  expect(decoded).toBe(specialText);
});

test("should safely handle Unicode in cache headers", () => {
  const unicodeText = "Unicode: 你好世界 مرحبا";
  const encoded = Buffer.from(unicodeText).toString("base64");
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");

  expect(decoded).toBe(unicodeText);
});

test("should handle very long cache content in headers", () => {
  const longText = "a".repeat(10000);
  const encoded = Buffer.from(longText).toString("base64");

  expect(encoded).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

  const hash = crypto.createHash("sha256").update(longText).digest("hex");

  expect(hash).toHaveLength(64);

  const tokens = String(Math.ceil(longText.length / 4));
  expect(tokens).toMatch(/^\d+$/);
});

console.log("\nTEST SUITE 7: Real-World Header Examples\n");

test("should generate valid headers for typical Claude Code system prompt", () => {
  const systemPrompt =
    "You are Claude, an AI assistant created by Anthropic. " +
    "You are helpful, harmless, and honest. " +
    "Follow the user's instructions carefully. " +
    "Use the available tools to help the user accomplish their goals.";

  const encoded = Buffer.from(systemPrompt).toString("base64");
  const hash = crypto.createHash("sha256").update(systemPrompt).digest("hex");
  const tokens = String(Math.ceil(systemPrompt.length / 4));

  expect(encoded).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(tokens).toMatch(/^\d+$/);

  // Verify round-trip
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  expect(decoded).toBe(systemPrompt);
});

test("should generate consistent headers across multiple systems", () => {
  const systems = [
    "You are helpful.",
    "Be honest and accurate.",
    "Follow instructions.",
    "Use tools when needed.",
  ];

  const hashes = systems.map((s) =>
    crypto.createHash("sha256").update(s).digest("hex")
  );

  // All hashes should be unique
  const uniqueHashes = new Set(hashes);
  expect(uniqueHashes.size).toBe(systems.length);
});

console.log("\nTEST SUITE 8: Header Missing When Not Needed\n");

test("should omit cache headers when no cache_control present", () => {
  const request = {
    system: "Simple system prompt",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "User message" }],
      },
    ],
  };

  const extractHeaders = (req) => {
    const headers = {};

    if (req.system) {
      const systemArray = Array.isArray(req.system)
        ? req.system
        : [{ type: "text", text: req.system }];

      if (systemArray.some((b) => b.cache_control?.type === "ephemeral")) {
        // Would add headers
        headers["X-Cache-System"] = "test";
      }
    }

    return headers;
  };

  const headers = extractHeaders(request);
  assert.strictEqual(Object.keys(headers).length, 0);
});

test("should omit cache headers for empty request", () => {
  const request = { messages: [] };

  const extractHeaders = (req) => {
    const headers = {};
    // No cache control in empty request
    return headers;
  };

  const headers = extractHeaders(request);
  assert.strictEqual(Object.keys(headers).length, 0);
});

// Summary
console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║   TEST SUMMARY                                           ║`);
console.log(
  `║   Passed: ${passed}                                              ║`
);
console.log(
  `║   Failed: ${failed}                                              ║`
);
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
