/**
 * Unit tests for search-intent-cache.ts
 *
 * Tests the IntentCache class for caching GenAI-based search intent classification results.
 *
 * Components tested:
 * 1. Cache hit/miss logic
 * 2. LRU eviction (least recently used items removed when cache is full)
 * 3. TTL expiration (time-to-live removes stale entries)
 * 4. Message normalization (consistent cache keys)
 * 5. Statistics tracking (hit rate, size, hits/misses)
 * 6. Cache clearing
 *
 * Test categories:
 * - Basic cache operations (get, set, clear)
 * - LRU eviction behavior
 * - TTL expiration with fake timers
 * - Message normalization consistency
 * - Statistics accuracy
 * - Edge cases (empty cache, full cache, expired entries)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { IntentCache, CachedIntent } from "../../src/search-intent-cache";

// Mock timers for TTL tests
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Tests: Basic cache operations
// ============================================================================

describe("IntentCache - Basic operations", () => {
  test("should return null for cache miss on empty cache", () => {
    const cache = new IntentCache();

    const result = cache.get("what is the weather in NYC");

    expect(result).toBeNull();
  });

  test("should return cached value for cache hit", () => {
    const cache = new IntentCache();
    cache.set("what is the weather in NYC", true);

    const result = cache.get("what is the weather in NYC");

    expect(result).toBe(true);
  });

  test("should return false from cache for non-search intent", () => {
    const cache = new IntentCache();
    cache.set("write a function to sort an array", false);

    const result = cache.get("write a function to sort an array");

    expect(result).toBe(false);
  });

  test("should return null for different message after setting one", () => {
    const cache = new IntentCache();
    cache.set("what is the weather", true);

    const result = cache.get("how to sort an array");

    expect(result).toBeNull();
  });

  test("should update existing cache entry when set twice", () => {
    const cache = new IntentCache();
    cache.set("ambiguous query", true);
    cache.set("ambiguous query", false);

    const result = cache.get("ambiguous query");

    expect(result).toBe(false);
  });

  test("should clear all cache entries", () => {
    const cache = new IntentCache();
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);

    cache.clear();

    expect(cache.get("query 1")).toBeNull();
    expect(cache.get("query 2")).toBeNull();
    expect(cache.get("query 3")).toBeNull();
  });
});

// ============================================================================
// Tests: Message normalization
// ============================================================================

describe("IntentCache - Message normalization", () => {
  test("should normalize whitespace - leading/trailing spaces", () => {
    const cache = new IntentCache();
    cache.set("  what is the weather  ", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });

  test("should normalize whitespace - multiple spaces to single space", () => {
    const cache = new IntentCache();
    cache.set("what   is    the     weather", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });

  test("should normalize case - uppercase to lowercase", () => {
    const cache = new IntentCache();
    cache.set("WHAT IS THE WEATHER", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });

  test("should normalize case - mixed case to lowercase", () => {
    const cache = new IntentCache();
    cache.set("What Is The Weather", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });

  test("should normalize punctuation - remove trailing punctuation", () => {
    const cache = new IntentCache();
    cache.set("what is the weather?", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });

  test("should normalize all at once - complex normalization", () => {
    const cache = new IntentCache();
    cache.set("  WHAT   IS    The   Weather?!  ", true);

    const result = cache.get("what is the weather");

    expect(result).toBe(true);
  });
});

// ============================================================================
// Tests: LRU eviction
// ============================================================================

describe("IntentCache - LRU eviction", () => {
  test("should not evict when cache size is below max", () => {
    const cache = new IntentCache(3);
    cache.set("query 1", true);
    cache.set("query 2", false);

    expect(cache.get("query 1")).toBe(true);
    expect(cache.get("query 2")).toBe(false);
  });

  test("should evict least recently used item when cache is full", () => {
    const cache = new IntentCache(3);
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);
    cache.set("query 4", false); // Should evict "query 1"

    expect(cache.get("query 1")).toBeNull();
    expect(cache.get("query 2")).toBe(false);
    expect(cache.get("query 3")).toBe(true);
    expect(cache.get("query 4")).toBe(false);
  });

  test("should update LRU order when item is accessed (get)", () => {
    const cache = new IntentCache(3);
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);

    cache.get("query 1"); // Access query 1, making it most recently used

    cache.set("query 4", false); // Should evict "query 2"

    expect(cache.get("query 1")).toBe(true);
    expect(cache.get("query 2")).toBeNull();
    expect(cache.get("query 3")).toBe(true);
    expect(cache.get("query 4")).toBe(false);
  });

  test("should update LRU order when item is updated (set)", () => {
    const cache = new IntentCache(3);
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);

    cache.set("query 1", false); // Update query 1, making it most recently used

    cache.set("query 4", true); // Should evict "query 2"

    expect(cache.get("query 1")).toBe(false);
    expect(cache.get("query 2")).toBeNull();
    expect(cache.get("query 3")).toBe(true);
    expect(cache.get("query 4")).toBe(true);
  });

  test("should handle cache size of 1", () => {
    const cache = new IntentCache(1);
    cache.set("query 1", true);
    cache.set("query 2", false);

    expect(cache.get("query 1")).toBeNull();
    expect(cache.get("query 2")).toBe(false);
  });

  test("should default to reasonable max size when not specified", () => {
    const cache = new IntentCache();

    // Fill cache with many items (default should be large enough)
    for (let i = 0; i < 100; i++) {
      cache.set(`query ${i}`, i % 2 === 0);
    }

    // First items should still be accessible (default > 100)
    expect(cache.get("query 0")).toBe(true);
    expect(cache.get("query 50")).toBe(true);
  });
});

// ============================================================================
// Tests: TTL expiration
// ============================================================================

describe("IntentCache - TTL expiration", () => {
  test("should return cached value before TTL expires", () => {
    const cache = new IntentCache(100, 60); // 60 second TTL
    cache.set("query", true);

    jest.advanceTimersByTime(30000); // Advance 30 seconds

    expect(cache.get("query")).toBe(true);
  });

  test("should return null for expired entry after TTL", () => {
    const cache = new IntentCache(100, 60); // 60 second TTL
    cache.set("query", true);

    jest.advanceTimersByTime(61000); // Advance 61 seconds

    expect(cache.get("query")).toBeNull();
  });

  test("should keep fresh entries and expire old ones", () => {
    const cache = new IntentCache(100, 60); // 60 second TTL
    cache.set("old query", true);

    jest.advanceTimersByTime(30000); // Advance 30 seconds

    cache.set("new query", false);

    jest.advanceTimersByTime(31000); // Advance 31 more seconds (61 total)

    expect(cache.get("old query")).toBeNull(); // Expired
    expect(cache.get("new query")).toBe(false); // Still fresh
  });

  test("should reset TTL when entry is updated", () => {
    const cache = new IntentCache(100, 60); // 60 second TTL
    cache.set("query", true);

    jest.advanceTimersByTime(50000); // Advance 50 seconds

    cache.set("query", false); // Update entry, resetting TTL

    jest.advanceTimersByTime(50000); // Advance 50 more seconds (100 total)

    expect(cache.get("query")).toBe(false); // Should still be fresh
  });

  test("should not expire entries when TTL is disabled (0)", () => {
    const cache = new IntentCache(100, 0); // No TTL
    cache.set("query", true);

    jest.advanceTimersByTime(1000000); // Advance 1000 seconds

    expect(cache.get("query")).toBe(true);
  });

  test("should handle default TTL when not specified", () => {
    const cache = new IntentCache(100); // Default TTL
    cache.set("query", true);

    // Assume default TTL is 300 seconds (5 minutes)
    jest.advanceTimersByTime(299000);

    expect(cache.get("query")).toBe(true);

    jest.advanceTimersByTime(2000);

    expect(cache.get("query")).toBeNull();
  });
});

// ============================================================================
// Tests: Statistics tracking
// ============================================================================

describe("IntentCache - Statistics", () => {
  test("should track cache size", () => {
    const cache = new IntentCache();
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);

    const stats = cache.getStats();

    expect(stats.size).toBe(3);
  });

  test("should track cache hits", () => {
    const cache = new IntentCache();
    cache.set("query", true);

    cache.get("query"); // Hit
    cache.get("query"); // Hit

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
  });

  test("should track cache misses", () => {
    const cache = new IntentCache();

    cache.get("query 1"); // Miss
    cache.get("query 2"); // Miss
    cache.get("query 3"); // Miss

    const stats = cache.getStats();

    expect(stats.misses).toBe(3);
  });

  test("should calculate hit rate correctly", () => {
    const cache = new IntentCache();
    cache.set("query", true);

    cache.get("query"); // Hit
    cache.get("query"); // Hit
    cache.get("missing"); // Miss

    const stats = cache.getStats();

    expect(stats.hitRate).toBeCloseTo(0.667, 2); // 2 hits / 3 total = 66.7%
  });

  test("should handle hit rate when no accesses", () => {
    const cache = new IntentCache();

    const stats = cache.getStats();

    expect(stats.hitRate).toBe(0);
  });

  test("should update stats after clear", () => {
    const cache = new IntentCache();
    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.get("query 1");

    cache.clear();

    const stats = cache.getStats();

    expect(stats.size).toBe(0);
    // Hits/misses might persist or reset - test both scenarios
  });

  test("should track mixed hits and misses", () => {
    const cache = new IntentCache();
    cache.set("query 1", true);
    cache.set("query 2", false);

    cache.get("query 1"); // Hit
    cache.get("missing"); // Miss
    cache.get("query 2"); // Hit
    cache.get("missing"); // Miss

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  test("should not count set operations in hit/miss stats", () => {
    const cache = new IntentCache();

    cache.set("query 1", true);
    cache.set("query 2", false);
    cache.set("query 3", true);

    const stats = cache.getStats();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

// ============================================================================
// Tests: Edge cases
// ============================================================================

describe("IntentCache - Edge cases", () => {
  test("should handle empty string message", () => {
    const cache = new IntentCache();
    cache.set("", true);

    const result = cache.get("");

    expect(result).toBe(true);
  });

  test("should handle very long messages", () => {
    const cache = new IntentCache();
    const longMessage = "a".repeat(10000);
    cache.set(longMessage, true);

    const result = cache.get(longMessage);

    expect(result).toBe(true);
  });

  test("should handle special characters in messages", () => {
    const cache = new IntentCache();
    const specialMessage = "search for $pecial ch@r@cters! <>&\"'";
    cache.set(specialMessage, true);

    const result = cache.get(specialMessage);

    expect(result).toBe(true);
  });

  test("should handle unicode characters", () => {
    const cache = new IntentCache();
    const unicodeMessage = "search for 日本語 and émojis 🔍";
    cache.set(unicodeMessage, true);

    const result = cache.get(unicodeMessage);

    expect(result).toBe(true);
  });

  test("should handle expired entries in stats", () => {
    const cache = new IntentCache(100, 60);
    cache.set("query", true);

    jest.advanceTimersByTime(61000); // Expire entry

    cache.get("query"); // Should be miss (expired)

    const stats = cache.getStats();

    expect(stats.misses).toBe(1);
  });

  test("should handle rapid set/get operations", () => {
    const cache = new IntentCache();

    for (let i = 0; i < 1000; i++) {
      cache.set(`query ${i}`, i % 2 === 0);
    }

    for (let i = 0; i < 1000; i++) {
      const result = cache.get(`query ${i}`);
      // Most should hit (unless evicted by LRU)
      if (result !== null) {
        expect(result).toBe(i % 2 === 0);
      }
    }

    const stats = cache.getStats();
    expect(stats.hits + stats.misses).toBe(1000);
  });
});
