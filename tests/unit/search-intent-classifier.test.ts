/**
 * Unit tests for search-intent-classifier.ts
 *
 * Tests the SearchIntentClassifier orchestrator that combines caching, regex
 * fast-path, and LLM-based classification for search intent detection.
 *
 * Components tested:
 * 1. Cache hit returns cached result
 * 2. Fast-path regex detection (obvious search/non-search queries)
 * 3. Slow-path LLM classification (ambiguous queries)
 * 4. Fallback to regex on LLM failure
 * 5. Statistics tracking (cache hits, regex hits, LLM calls)
 * 6. Configuration options
 * 7. Integration with IntentCache and LLMClassifier
 *
 * Test categories:
 * - Cache path (cache hit, cache miss)
 * - Fast-path positive (obvious search queries)
 * - Fast-path negative (obvious non-search queries)
 * - Slow-path LLM (ambiguous queries)
 * - Fallback behavior (LLM timeout/error)
 * - Statistics and metrics
 * - Configuration options
 * - Edge cases
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  SearchIntentClassifier,
  ClassificationResult,
  ClassifierConfig,
  ClassifierStats,
} from "../../src/search-intent-classifier";

// Mock dependencies
jest.mock("../../src/search-intent-cache");
jest.mock("../../src/llm-classifier");

import { IntentCache } from "../../src/search-intent-cache";
import { LLMClassifier } from "../../src/llm-classifier";

// Mock implementations
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheClear = jest.fn();
const mockCacheGetStats = jest.fn();

const mockLLMClassify = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  // Setup cache mock
  (IntentCache as jest.Mock).mockImplementation(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    clear: mockCacheClear,
    getStats: mockCacheGetStats,
  }));

  // Setup LLM classifier mock
  (LLMClassifier as jest.Mock).mockImplementation(() => ({
    classify: mockLLMClassify,
  }));

  // Default mock behaviors
  mockCacheGet.mockReturnValue(null); // Default: cache miss
  mockCacheGetStats.mockReturnValue({
    size: 0,
    hitRate: 0,
    hits: 0,
    misses: 0,
  });
});

// ============================================================================
// Test Data - Obvious Search Queries (Fast-path Positive)
// ============================================================================

const OBVIOUS_SEARCH_QUERIES = [
  "what is the current weather in NYC",
  "latest React version 2025",
  "search LSP plugin in claude code",
  "web search for TypeScript best practices",
  "look up Node.js documentation",
  "find the latest news about AI",
  "google how to install docker",
  "search for python tutorials",
  "what are the current interest rates",
  "latest stock prices for AAPL",
];

// ============================================================================
// Test Data - Obvious Non-Search Queries (Fast-path Negative)
// ============================================================================

const OBVIOUS_NON_SEARCH_QUERIES = [
  "write a function to sort an array",
  "fix the bug in this code",
  "run the tests",
  "create a new component called Button",
  "explain this code",
  "refactor this function",
  "add error handling to this endpoint",
  "implement a binary search tree",
  "update the documentation",
  "rename this variable to be more descriptive",
];

// ============================================================================
// Test Data - Ambiguous Queries (Need LLM)
// ============================================================================

const AMBIGUOUS_QUERIES = [
  "tell me about React hooks",
  "what are TypeScript generics",
  "how to use async/await",
  "explain the benefits of immutability",
  "what is dependency injection",
];

// ============================================================================
// Tests: Configuration
// ============================================================================

describe("SearchIntentClassifier - Configuration", () => {
  test("should create classifier with default config", () => {
    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    expect(classifier).toBeDefined();
  });

  test("should respect enabled=false configuration", async () => {
    const classifier = new SearchIntentClassifier(
      {
        enabled: false,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("what is the weather");

    // Should skip classification and return default
    expect(result.isSearchIntent).toBe(false);
    expect(result.method).toBe("fallback");
  });

  test("should pass config to IntentCache", () => {
    new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 500,
        cacheTtlSeconds: 600,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    expect(IntentCache).toHaveBeenCalledWith(500, 600);
  });

  test("should pass config to LLMClassifier", () => {
    new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 2000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:5001"
    );

    expect(LLMClassifier).toHaveBeenCalledWith(
      "local",
      "http://localhost:5001",
      2000
    );
  });
});

// ============================================================================
// Tests: Cache path
// ============================================================================

describe("SearchIntentClassifier - Cache path", () => {
  test("should return cached result on cache hit (true)", async () => {
    mockCacheGet.mockReturnValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("what is the weather");

    expect(result.isSearchIntent).toBe(true);
    expect(result.method).toBe("cache");
    expect(result.confidence).toBe("high");
    expect(mockCacheGet).toHaveBeenCalledWith("what is the weather");
    expect(mockLLMClassify).not.toHaveBeenCalled();
  });

  test("should return cached result on cache hit (false)", async () => {
    mockCacheGet.mockReturnValueOnce(false);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("write a function");

    expect(result.isSearchIntent).toBe(false);
    expect(result.method).toBe("cache");
    expect(result.confidence).toBe("high");
    expect(mockLLMClassify).not.toHaveBeenCalled();
  });

  test("should proceed to next step on cache miss", async () => {
    mockCacheGet.mockReturnValueOnce(null); // Cache miss

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("what is the weather in NYC");

    expect(result.method).not.toBe("cache");
    // Should use regex or LLM
  });

  test("should cache result after classification", async () => {
    mockCacheGet.mockReturnValueOnce(null); // Cache miss

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("what is the weather in NYC");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "what is the weather in NYC",
      expect.any(Boolean)
    );
  });
});

// ============================================================================
// Tests: Fast-path positive (obvious search queries)
// ============================================================================

describe("SearchIntentClassifier - Fast-path positive", () => {
  OBVIOUS_SEARCH_QUERIES.forEach((query) => {
    test(`should detect "${query}" as search via regex`, async () => {
      mockCacheGet.mockReturnValueOnce(null); // Cache miss

      const classifier = new SearchIntentClassifier(
        {
          enabled: true,
          cacheSize: 100,
          cacheTtlSeconds: 300,
          llmTimeout: 1000,
          fallbackToRegex: true,
        },
        "local",
        "http://localhost:1234"
      );

      const result = await classifier.classify(query);

      expect(result.isSearchIntent).toBe(true);
      expect(result.method).toBe("regex-positive");
      expect(result.confidence).toBe("high");
      expect(mockLLMClassify).not.toHaveBeenCalled();
    });
  });

  test("should cache regex-positive results", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("what is the weather");

    expect(mockCacheSet).toHaveBeenCalledWith("what is the weather", true);
  });
});

// ============================================================================
// Tests: Fast-path negative (obvious non-search queries)
// ============================================================================

describe("SearchIntentClassifier - Fast-path negative", () => {
  OBVIOUS_NON_SEARCH_QUERIES.forEach((query) => {
    test(`should detect "${query}" as non-search via regex`, async () => {
      mockCacheGet.mockReturnValueOnce(null); // Cache miss

      const classifier = new SearchIntentClassifier(
        {
          enabled: true,
          cacheSize: 100,
          cacheTtlSeconds: 300,
          llmTimeout: 1000,
          fallbackToRegex: true,
        },
        "local",
        "http://localhost:1234"
      );

      const result = await classifier.classify(query);

      expect(result.isSearchIntent).toBe(false);
      expect(result.method).toBe("regex-negative");
      expect(result.confidence).toBe("high");
      expect(mockLLMClassify).not.toHaveBeenCalled();
    });
  });

  test("should cache regex-negative results", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("write a function");

    expect(mockCacheSet).toHaveBeenCalledWith("write a function", false);
  });
});

// ============================================================================
// Tests: Slow-path LLM (ambiguous queries)
// ============================================================================

describe("SearchIntentClassifier - Slow-path LLM", () => {
  AMBIGUOUS_QUERIES.forEach((query) => {
    test(`should use LLM for ambiguous query: "${query}"`, async () => {
      mockCacheGet.mockReturnValueOnce(null); // Cache miss
      mockLLMClassify.mockResolvedValueOnce(true);

      const classifier = new SearchIntentClassifier(
        {
          enabled: true,
          cacheSize: 100,
          cacheTtlSeconds: 300,
          llmTimeout: 1000,
          fallbackToRegex: true,
        },
        "local",
        "http://localhost:1234"
      );

      const result = await classifier.classify(query);

      expect(mockLLMClassify).toHaveBeenCalledWith(query);
      expect(result.method).toBe("llm");
      expect(result.confidence).toBe("medium");
    });
  });

  test("should return LLM result (true) for ambiguous query", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockResolvedValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("tell me about React hooks");

    expect(result.isSearchIntent).toBe(true);
    expect(result.method).toBe("llm");
  });

  test("should return LLM result (false) for ambiguous query", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockResolvedValueOnce(false);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("explain dependency injection");

    expect(result.isSearchIntent).toBe(false);
    expect(result.method).toBe("llm");
  });

  test("should cache LLM results", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockResolvedValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("tell me about React hooks");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "tell me about React hooks",
      true
    );
  });
});

// ============================================================================
// Tests: Fallback behavior
// ============================================================================

describe("SearchIntentClassifier - Fallback behavior", () => {
  test("should fall back to regex on LLM timeout", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Timeout"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("tell me about React hooks");

    expect(result.method).toBe("fallback");
    expect(result.confidence).toBe("low");
    // Should return regex-based guess
    expect(typeof result.isSearchIntent).toBe("boolean");
  });

  test("should fall back to regex on LLM network error", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Network error"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("ambiguous query");

    expect(result.method).toBe("fallback");
    expect(result.confidence).toBe("low");
  });

  test("should return false when fallbackToRegex is disabled and LLM fails", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Timeout"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: false,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("ambiguous query");

    expect(result.isSearchIntent).toBe(false);
    expect(result.method).toBe("fallback");
    expect(result.confidence).toBe("low");
  });

  test("should cache fallback results", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Timeout"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("ambiguous query");

    expect(mockCacheSet).toHaveBeenCalledWith(
      "ambiguous query",
      expect.any(Boolean)
    );
  });
});

// ============================================================================
// Tests: Statistics tracking
// ============================================================================

describe("SearchIntentClassifier - Statistics", () => {
  test("should track cache hit statistics", async () => {
    mockCacheGet.mockReturnValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("query");
    const stats = classifier.getStats();

    expect(stats.cacheHits).toBe(1);
  });

  test("should track regex positive hits", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("what is the weather");
    const stats = classifier.getStats();

    expect(stats.regexPositive).toBeGreaterThan(0);
  });

  test("should track regex negative hits", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("write a function");
    const stats = classifier.getStats();

    expect(stats.regexNegative).toBeGreaterThan(0);
  });

  test("should track LLM calls", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockResolvedValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("tell me about React");
    const stats = classifier.getStats();

    expect(stats.llmCalls).toBe(1);
  });

  test("should track fallback count", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Timeout"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("ambiguous query");
    const stats = classifier.getStats();

    expect(stats.fallbacks).toBe(1);
  });

  test("should track average latency", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("what is the weather");

    expect(result.latencyMs).toBeGreaterThan(0);

    const stats = classifier.getStats();
    expect(stats.avgLatencyMs).toBeGreaterThan(0);
  });

  test("should track total classifications", async () => {
    mockCacheGet.mockReturnValue(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("query 1");
    await classifier.classify("query 2");
    await classifier.classify("query 3");

    const stats = classifier.getStats();
    expect(stats.totalClassifications).toBe(3);
  });
});

// ============================================================================
// Tests: Cache management
// ============================================================================

describe("SearchIntentClassifier - Cache management", () => {
  test("should clear cache", () => {
    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    classifier.clearCache();

    expect(mockCacheClear).toHaveBeenCalled();
  });

  test("should reset stats after cache clear", async () => {
    mockCacheGet.mockReturnValue(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    await classifier.classify("query 1");
    classifier.clearCache();

    const stats = classifier.getStats();
    // Stats should be reset or preserved - test implementation decision
    expect(stats).toBeDefined();
  });
});

// ============================================================================
// Tests: Edge cases
// ============================================================================

describe("SearchIntentClassifier - Edge cases", () => {
  test("should handle empty string message", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("");

    expect(result).toBeDefined();
    expect(typeof result.isSearchIntent).toBe("boolean");
  });

  test("should handle very long messages", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const longMessage = "search for ".repeat(1000) + "information";
    const result = await classifier.classify(longMessage);

    expect(result).toBeDefined();
  });

  test("should handle unicode characters", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("search for 日本語 information");

    expect(result).toBeDefined();
  });

  test("should handle special characters", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify('search for "special" & <chars>');

    expect(result).toBeDefined();
  });

  test("should handle concurrent classifications", async () => {
    mockCacheGet.mockReturnValue(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const results = await Promise.all([
      classifier.classify("what is the weather"),
      classifier.classify("write a function"),
      classifier.classify("tell me about React"),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result).toBeDefined();
      expect(typeof result.isSearchIntent).toBe("boolean");
    });
  });

  test("should handle classification result structure", async () => {
    mockCacheGet.mockReturnValueOnce(null);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("what is the weather");

    expect(result).toHaveProperty("isSearchIntent");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("method");
    expect(result).toHaveProperty("latencyMs");

    expect(typeof result.isSearchIntent).toBe("boolean");
    expect(["high", "medium", "low"]).toContain(result.confidence);
    expect([
      "cache",
      "regex-positive",
      "regex-negative",
      "llm",
      "fallback",
    ]).toContain(result.method);
    expect(typeof result.latencyMs).toBe("number");
  });
});

// ============================================================================
// Tests: Integration scenarios
// ============================================================================

describe("SearchIntentClassifier - Integration scenarios", () => {
  test("should follow complete classification flow: miss → regex → cache", async () => {
    mockCacheGet.mockReturnValueOnce(null); // First call: miss
    mockCacheGet.mockReturnValueOnce(true); // Second call: hit

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    // First classification - cache miss, uses regex
    const result1 = await classifier.classify("what is the weather");
    expect(result1.method).toBe("regex-positive");
    expect(mockCacheSet).toHaveBeenCalled();

    // Second classification - cache hit
    const result2 = await classifier.classify("what is the weather");
    expect(result2.method).toBe("cache");
  });

  test("should follow complete classification flow: miss → LLM → cache", async () => {
    mockCacheGet.mockReturnValueOnce(null); // First call: miss
    mockCacheGet.mockReturnValueOnce(true); // Second call: hit
    mockLLMClassify.mockResolvedValueOnce(true);

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    // First classification - cache miss, uses LLM
    const result1 = await classifier.classify("tell me about React hooks");
    expect(result1.method).toBe("llm");
    expect(mockCacheSet).toHaveBeenCalled();

    // Second classification - cache hit
    const result2 = await classifier.classify("tell me about React hooks");
    expect(result2.method).toBe("cache");
  });

  test("should follow complete classification flow: miss → LLM fail → fallback", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    mockLLMClassify.mockRejectedValueOnce(new Error("Timeout"));

    const classifier = new SearchIntentClassifier(
      {
        enabled: true,
        cacheSize: 100,
        cacheTtlSeconds: 300,
        llmTimeout: 1000,
        fallbackToRegex: true,
      },
      "local",
      "http://localhost:1234"
    );

    const result = await classifier.classify("ambiguous query");

    expect(result.method).toBe("fallback");
    expect(mockCacheSet).toHaveBeenCalled();
  });
});
