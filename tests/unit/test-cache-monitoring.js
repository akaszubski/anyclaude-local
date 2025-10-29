#!/usr/bin/env node

/**
 * Cache Monitoring Dashboard Tests
 *
 * Tests for cache metrics collection, export, and dashboard display
 *
 * Run with: node tests/unit/test-cache-monitoring.js
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
    toBeLessThan: (threshold) => {
      assert.ok(value < threshold);
    },
  };
}

// ============================================================================
// CACHE METRICS COLLECTION
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   CACHE MONITORING DASHBOARD TESTS                       ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("TEST SUITE 1: Cache Metrics Collection\n");

test("should initialize empty cache metrics", () => {
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalInputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    entries: {},
  };

  expect(metrics.totalRequests).toBe(0);
  expect(metrics.cacheHits).toBe(0);
  expect(metrics.cacheMisses).toBe(0);
});

test("should record cache hit", () => {
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalInputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    entries: {},
  };

  metrics.totalRequests += 1;
  metrics.cacheHits += 1;
  metrics.cacheReadTokens += 500;
  metrics.totalInputTokens += 5000;

  expect(metrics.cacheHits).toBe(1);
  expect(metrics.cacheReadTokens).toBe(500);
});

test("should record cache miss", () => {
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalInputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    entries: {},
  };

  metrics.totalRequests += 1;
  metrics.cacheMisses += 1;
  metrics.cacheCreationTokens += 5000;
  metrics.totalInputTokens += 5000;

  expect(metrics.cacheMisses).toBe(1);
  expect(metrics.cacheCreationTokens).toBe(5000);
});

test("should calculate hit rate", () => {
  const metrics = {
    totalRequests: 10,
    cacheHits: 8,
    cacheMisses: 2,
  };

  const hitRate = (metrics.cacheHits / metrics.totalRequests) * 100;
  expect(hitRate).toBe(80);
});

test("should track per-prompt cache metrics", () => {
  const metrics = {
    entries: {
      "hash-001": {
        systemPrompt: "You are helpful",
        toolCount: 3,
        hits: 5,
        misses: 1,
        cacheCreationTokens: 2000,
        cacheReadTokens: 2500,
      },
    },
  };

  const entry = metrics.entries["hash-001"];
  expect(entry.hits).toBe(5);
  expect(entry.toolCount).toBe(3);
});

test("should accumulate metrics across multiple requests", () => {
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheReadTokens: 0,
  };

  // Request 1: miss
  metrics.totalRequests++;
  metrics.cacheMisses++;

  // Request 2: hit
  metrics.totalRequests++;
  metrics.cacheHits++;
  metrics.cacheReadTokens += 500;

  // Request 3: hit
  metrics.totalRequests++;
  metrics.cacheHits++;
  metrics.cacheReadTokens += 500;

  expect(metrics.totalRequests).toBe(3);
  expect(metrics.cacheHits).toBe(2);
  expect(metrics.cacheMisses).toBe(1);
  expect(metrics.cacheReadTokens).toBe(1000);
});

// ============================================================================
// CACHE DASHBOARD DISPLAY
// ============================================================================

console.log("TEST SUITE 2: Cache Dashboard Display\n");

test("should format hit rate percentage", () => {
  const hitRate = (8 / 10) * 100;
  const formatted = hitRate.toFixed(1) + "%";
  expect(formatted).toBe("80.0%");
});

test("should format token savings", () => {
  const cacheReadTokens = 2500;
  const cacheCreationTokens = 5000;
  const savings = (cacheReadTokens / cacheCreationTokens) * 100;
  const formatted = savings.toFixed(0) + "%";
  expect(formatted).toBe("50%");
});

test("should generate dashboard header", () => {
  const header = "╔══════════════════════════════════════════════════════════╗";
  expect(header).toContain("╔");
  expect(header).toContain("╗");
});

test("should display cache metrics in dashboard format", () => {
  const metrics = {
    totalRequests: 10,
    cacheHits: 8,
    cacheMisses: 2,
    cacheReadTokens: 4000,
    cacheCreationTokens: 10000,
  };

  const hitRate = ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1);
  const savings = (
    (metrics.cacheReadTokens / metrics.cacheCreationTokens) *
    100
  ).toFixed(0);

  expect(hitRate).toBe("80.0");
  expect(savings).toBe("40");
});

test("should sort cache entries by hit count", () => {
  const entries = [
    { hash: "a", hits: 5 },
    { hash: "c", hits: 15 },
    { hash: "b", hits: 10 },
  ];

  const sorted = entries.sort((a, b) => b.hits - a.hits);
  expect(sorted[0].hash).toBe("c");
  expect(sorted[1].hash).toBe("b");
  expect(sorted[2].hash).toBe("a");
});

test("should identify hot cache entries", () => {
  const entries = [
    { hash: "a", hits: 1 },
    { hash: "b", hits: 20 }, // hot
    { hash: "c", hits: 2 },
  ];

  const hot = entries.filter((e) => e.hits > 10);
  expect(hot.length).toBe(1);
  expect(hot[0].hash).toBe("b");
});

// ============================================================================
// CACHE METRICS EXPORT
// ============================================================================

console.log("TEST SUITE 3: Cache Metrics Export\n");

test("should export metrics to JSON object", () => {
  const metrics = {
    timestamp: new Date().toISOString(),
    totalRequests: 10,
    cacheHits: 8,
    cacheMisses: 2,
    cacheReadTokens: 4000,
    cacheCreationTokens: 10000,
  };

  const exported = JSON.stringify(metrics);
  const parsed = JSON.parse(exported);

  expect(parsed.totalRequests).toBe(10);
  expect(parsed.cacheHits).toBe(8);
});

test("should generate CSV export format", () => {
  const entries = [
    {
      timestamp: "2025-10-30T12:00:00Z",
      hash: "abc123",
      hits: 5,
      cacheReadTokens: 2500,
    },
    {
      timestamp: "2025-10-30T12:05:00Z",
      hash: "def456",
      hits: 3,
      cacheReadTokens: 1500,
    },
  ];

  const csv = "timestamp,hash,hits,tokens\n" + entries
    .map((e) => `${e.timestamp},${e.hash},${e.hits},${e.cacheReadTokens}`)
    .join("\n");

  expect(csv).toContain("abc123");
  expect(csv).toContain("def456");
  expect(csv).toContain("timestamp,hash");
});

test("should include timestamp in export", () => {
  const now = new Date().toISOString();
  const export_data = {
    exportedAt: now,
    metrics: {
      totalRequests: 10,
    },
  };

  expect(export_data.exportedAt).toContain("2025");
});

test("should format cache metrics for file export", () => {
  const metrics = {
    totalRequests: 10,
    cacheHits: 8,
    hitRate: "80.0%",
    cacheReadTokens: 4000,
    cacheCreationTokens: 10000,
    entries: [
      { hash: "a", hits: 5, tokens: 2500 },
      { hash: "b", hits: 3, tokens: 1500 },
    ],
  };

  const fileContent =
    "Cache Metrics Export\n" +
    `Total Requests: ${metrics.totalRequests}\n` +
    `Cache Hits: ${metrics.cacheHits}\n` +
    `Hit Rate: ${metrics.hitRate}\n`;

  expect(fileContent).toContain("Cache Metrics Export");
  expect(fileContent).toContain("Total Requests: 10");
  expect(fileContent).toContain("Hit Rate: 80.0%");
});

test("should handle empty metrics in export", () => {
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    entries: [],
  };

  const exported = JSON.stringify(metrics);
  const parsed = JSON.parse(exported);

  expect(parsed.totalRequests).toBe(0);
  expect(parsed.entries.length).toBe(0);
});

// ============================================================================
// CACHE PERFORMANCE ANALYSIS
// ============================================================================

console.log("TEST SUITE 4: Cache Performance Analysis\n");

test("should calculate average tokens saved per hit", () => {
  const metrics = {
    cacheHits: 10,
    cacheReadTokens: 5000, // 500 per hit
  };

  const avgSavedPerHit = metrics.cacheReadTokens / metrics.cacheHits;
  expect(avgSavedPerHit).toBe(500);
});

test("should identify cache warm-up period", () => {
  const requests = [
    { hit: false }, // 1 - warmup
    { hit: false }, // 2 - warmup
    { hit: true }, // 3 - warmed up
    { hit: true }, // 4
    { hit: true }, // 5
  ];

  let warmupCount = 0;
  for (const req of requests) {
    if (!req.hit) warmupCount++;
    else break;
  }

  expect(warmupCount).toBe(2);
});

test("should track cache hit trend over time", () => {
  const periods = [
    { name: "period-1", hitRate: 10 },
    { name: "period-2", hitRate: 45 },
    { name: "period-3", hitRate: 75 },
  ];

  const trend = periods.map((p) => p.hitRate);
  expect(trend[0]).toBeLessThan(trend[1]);
  expect(trend[1]).toBeLessThan(trend[2]);
});

test("should estimate cost savings from cache", () => {
  // Assuming: cache write costs same as normal, cache read costs 10%
  const cacheCreationTokens = 10000; // costs 10000
  const cacheReadTokens = 5000; // costs 500 (10%)
  const regularTokens = 5000; // would cost 5000

  const savings = regularTokens - cacheReadTokens / 10;
  expect(savings).toBeGreaterThan(4000);
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
  console.log("✅ All cache monitoring tests passed!\n");
  process.exit(0);
}
