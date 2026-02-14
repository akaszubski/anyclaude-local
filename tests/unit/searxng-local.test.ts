/**
 * Unit tests for local SearxNG search functionality (Issue #49)
 *
 * Tests the self-hosted SearxNG integration for local-only web search:
 * 1. searchViaLocalSearxNG() - HTTP requests to local SearxNG instance
 * 2. getLocalSearxngUrl() - Environment variable configuration
 * 3. executeClaudeSearch() integration - Local-first fallback chain
 *
 * Components tested:
 * - HTTP request handling with fetch() and AbortController
 * - 5-second timeout enforcement
 * - JSON response parsing and SearchResult[] transformation
 * - Error handling (connection refused, 403, timeout, invalid JSON)
 * - URL encoding for special characters
 * - Custom base URL support via SEARXNG_URL env var
 * - Fallback chain when local SearxNG fails
 *
 * Test categories:
 * - Success path (200 response with valid JSON)
 * - Network errors (connection refused, Docker not running)
 * - HTTP errors (403 Forbidden - JSON format disabled)
 * - Timeout scenarios (>5s response time)
 * - Malformed responses (invalid JSON, missing fields)
 * - Empty results handling
 * - URL encoding edge cases
 * - Environment variable configuration
 * - Fallback behavior in executeClaudeSearch()
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  searchViaLocalSearxNG,
  getLocalSearxngUrl,
  executeClaudeSearch,
  SearchResult,
} from "../../src/claude-search-executor";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Store original env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// ============================================================================
// Test Data
// ============================================================================

const VALID_SEARXNG_RESPONSE = {
  results: [
    {
      url: "https://example.com/result1",
      title: "Test Result 1",
      content: "This is a test snippet for result 1",
    },
    {
      url: "https://example.com/result2",
      title: "Test Result 2",
      content: "This is a test snippet for result 2",
    },
    {
      url: "https://example.com/result3",
      title: "Test Result 3",
      content: "This is a test snippet for result 3",
    },
  ],
};

const EXPECTED_SEARCH_RESULTS: SearchResult[] = [
  {
    url: "https://example.com/result1",
    title: "Test Result 1",
    snippet: "This is a test snippet for result 1",
  },
  {
    url: "https://example.com/result2",
    title: "Test Result 2",
    snippet: "This is a test snippet for result 2",
  },
  {
    url: "https://example.com/result3",
    title: "Test Result 3",
    snippet: "This is a test snippet for result 3",
  },
];

// ============================================================================
// Suite 1: searchViaLocalSearxNG() - Success scenarios
// ============================================================================

describe("searchViaLocalSearxNG - Success scenarios", () => {
  test("should return SearchResult[] on successful 200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await searchViaLocalSearxNG("test query");

    expect(results).toHaveLength(3);
    expect(results).toEqual(EXPECTED_SEARCH_RESULTS);
  });

  test("should make fetch request with correct URL parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("test query");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/search?q=test%20query&format=json&categories=general",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  test("should use custom base URL when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("test query", "http://custom:9000");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://custom:9000/search?q=test%20query&format=json&categories=general",
      expect.any(Object)
    );
  });

  test("should handle results without content field (snippet is optional)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://example.com/test",
            title: "Test Result",
            // No content field
          },
        ],
      }),
    });

    const results = await searchViaLocalSearxNG("test query");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      url: "https://example.com/test",
      title: "Test Result",
      snippet: undefined,
    });
  });

  test("should return empty array when results array is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const results = await searchViaLocalSearxNG("nonexistent query");

    expect(results).toEqual([]);
  });

  test("should handle response with missing results field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}), // No results field
    });

    const results = await searchViaLocalSearxNG("test query");

    expect(results).toEqual([]);
  });

  test("should limit results to 10 items when more are returned", async () => {
    const manyResults = {
      results: Array.from({ length: 20 }, (_, i) => ({
        url: `https://example.com/result${i}`,
        title: `Result ${i}`,
        content: `Content ${i}`,
      })),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => manyResults,
    });

    const results = await searchViaLocalSearxNG("popular query");

    expect(results).toHaveLength(10);
  });
});

// ============================================================================
// Suite 2: searchViaLocalSearxNG() - URL encoding
// ============================================================================

describe("searchViaLocalSearxNG - URL encoding", () => {
  test("should URL encode query with spaces", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("hello world test");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("q=hello%20world%20test"),
      expect.any(Object)
    );
  });

  test("should URL encode query with special characters (&, ?, =)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("test&query?with=special");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("test&query?with=special")),
      expect.any(Object)
    );
  });

  test("should handle unicode characters in query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("日本語 search");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("日本語 search")),
      expect.any(Object)
    );
  });

  test("should handle quotes and symbols in query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG('"exact phrase" +required -excluded');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        encodeURIComponent('"exact phrase" +required -excluded')
      ),
      expect.any(Object)
    );
  });
});

// ============================================================================
// Suite 3: searchViaLocalSearxNG() - Network errors
// ============================================================================

describe("searchViaLocalSearxNG - Network errors", () => {
  test("should throw descriptive error on connection refused (Docker not running)", async () => {
    const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:8080");
    connectionError.name = "FetchError";
    (connectionError as any).code = "ECONNREFUSED";

    mockFetch.mockRejectedValueOnce(connectionError);

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /local SearxNG.*not running|connection refused|ECONNREFUSED/i
    );
  });

  test("should throw error on network timeout", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "AbortError";

    mockFetch.mockRejectedValueOnce(timeoutError);

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /abort|timeout/i
    );
  });

  test("should throw error on DNS resolution failure", async () => {
    const dnsError = new Error("getaddrinfo ENOTFOUND localhost");
    dnsError.name = "FetchError";

    mockFetch.mockRejectedValueOnce(dnsError);

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow();
  });
});

// ============================================================================
// Suite 4: searchViaLocalSearxNG() - HTTP errors
// ============================================================================

describe("searchViaLocalSearxNG - HTTP errors", () => {
  test("should throw error on 403 Forbidden (JSON format disabled)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "<html>Forbidden</html>",
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /403|forbidden|JSON format/i
    );
  });

  test("should throw error on 404 Not Found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Not Found",
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /404|not found/i
    );
  });

  test("should throw error on 500 Internal Server Error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /500|server error/i
    );
  });

  test("should throw error on 502 Bad Gateway (SearxNG backend down)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "Bad Gateway",
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /502|bad gateway/i
    );
  });
});

// ============================================================================
// Suite 5: searchViaLocalSearxNG() - Timeout enforcement
// ============================================================================

describe("searchViaLocalSearxNG - Timeout enforcement", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should abort request after 5 seconds", async () => {
    // Mock fetch to respect AbortController signal
    mockFetch.mockImplementationOnce(
      (_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((resolve, reject) => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";

          // Check if already aborted
          if (options?.signal?.aborted) {
            reject(abortError);
            return;
          }

          // Listen for abort
          options?.signal?.addEventListener("abort", () => {
            reject(abortError);
          });

          // Never resolves normally - simulates hanging request
          setTimeout(
            () => resolve({ ok: true, json: async () => ({}) }),
            10000
          );
        });
      }
    );

    const searchPromise = searchViaLocalSearxNG("test query");

    // Fast-forward time by 5 seconds to trigger timeout
    jest.advanceTimersByTime(5000);

    // Should timeout and throw
    await expect(searchPromise).rejects.toThrow(/timeout/i);
  }, 10000);

  test("should pass AbortController signal to fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG("test query");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  test("should clear timeout on successful response before 5s", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const searchPromise = searchViaLocalSearxNG("test query");

    // Fast-forward 1 second (before timeout)
    jest.advanceTimersByTime(1000);

    // Should complete successfully
    const results = await searchPromise;
    expect(results).toEqual([]);

    // Verify timeout was cleared
    jest.advanceTimersByTime(10000);
    // No error should be thrown
  });
});

// ============================================================================
// Suite 6: searchViaLocalSearxNG() - Invalid JSON responses
// ============================================================================

describe("searchViaLocalSearxNG - Invalid JSON responses", () => {
  test("should throw SyntaxError on malformed JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      SyntaxError
    );
  });

  test("should handle HTML response instead of JSON (misconfigured SearxNG)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow(
      /JSON|parse/i
    );
  });

  test("should handle empty response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(searchViaLocalSearxNG("test query")).rejects.toThrow();
  });
});

// ============================================================================
// Suite 7: searchViaLocalSearxNG() - Edge cases
// ============================================================================

describe("searchViaLocalSearxNG - Edge cases", () => {
  test("should handle empty query string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const results = await searchViaLocalSearxNG("");

    expect(results).toEqual([]);
  });

  test("should handle very long query (>1000 characters)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    const longQuery = "test ".repeat(300);
    const results = await searchViaLocalSearxNG(longQuery);

    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(longQuery)),
      expect.any(Object)
    );
  });

  test("should handle results with missing required fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { url: "https://example.com" }, // Missing title
          { title: "Test" }, // Missing url
          {}, // Missing both
        ],
      }),
    });

    // Should handle gracefully (filter out invalid results or throw)
    const resultPromise = searchViaLocalSearxNG("test query");

    // Implementation decision: either filter invalid or throw
    // Test will validate the chosen behavior
    await expect(resultPromise).resolves.toBeDefined();
  });

  test("should handle results with null/undefined fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://example.com",
            title: "Test",
            content: null,
          },
        ],
      }),
    });

    const results = await searchViaLocalSearxNG("test query");

    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBeUndefined();
  });
});

// ============================================================================
// Suite 8: getLocalSearxngUrl() - Environment configuration
// ============================================================================

describe("getLocalSearxngUrl - Environment configuration", () => {
  test("should return SEARXNG_URL when env var is set", () => {
    process.env.SEARXNG_URL = "http://custom-searxng:8888";

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://custom-searxng:8888");
  });

  test("should return default http://localhost:8080 when env var is not set", () => {
    delete process.env.SEARXNG_URL;

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://localhost:8080");
  });

  test("should return default when SEARXNG_URL is empty string", () => {
    process.env.SEARXNG_URL = "";

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://localhost:8080");
  });

  test("should return custom URL with different port", () => {
    process.env.SEARXNG_URL = "http://localhost:9999";

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://localhost:9999");
  });

  test("should handle URL with trailing slash", () => {
    process.env.SEARXNG_URL = "http://localhost:8080/";

    const url = getLocalSearxngUrl();

    // Implementation should normalize or preserve trailing slash
    expect(url).toMatch(/^http:\/\/localhost:8080\/?$/);
  });

  test("should handle HTTPS URLs", () => {
    process.env.SEARXNG_URL = "https://secure-searxng.local";

    const url = getLocalSearxngUrl();

    expect(url).toBe("https://secure-searxng.local");
  });

  test("should handle IPv4 addresses", () => {
    process.env.SEARXNG_URL = "http://192.168.1.100:8080";

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://192.168.1.100:8080");
  });

  test("should handle IPv6 addresses", () => {
    process.env.SEARXNG_URL = "http://[::1]:8080";

    const url = getLocalSearxngUrl();

    expect(url).toBe("http://[::1]:8080");
  });
});

// ============================================================================
// Suite 9: executeClaudeSearch() - Local SearxNG integration
// ============================================================================

describe("executeClaudeSearch - Local SearxNG integration", () => {
  test("should try local SearxNG first when SEARXNG_URL is set", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await executeClaudeSearch("test query");

    expect(results).toEqual(EXPECTED_SEARCH_RESULTS);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("localhost:8080"),
      expect.any(Object)
    );
  });

  test("should skip local SearxNG when SEARXNG_URL is not set", async () => {
    delete process.env.SEARXNG_URL;

    // Mock public SearxNG response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await executeClaudeSearch("test query");

    // Should call public SearxNG instances, not localhost
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("localhost:8080"),
      expect.any(Object)
    );
  });

  test("should fallback to public SearxNG when local fails (connection refused)", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";

    // First call: local SearxNG fails
    const connectionError = new Error("ECONNREFUSED");
    mockFetch.mockRejectedValueOnce(connectionError);

    // Second call: public SearxNG succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await executeClaudeSearch("test query");

    expect(results).toEqual(EXPECTED_SEARCH_RESULTS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("should fallback to Tavily when both local and public SearxNG fail", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";
    process.env.TAVILY_API_KEY = "test-key";

    // First call: local SearxNG fails
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    // Second call: public SearxNG fails
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    // Third call: Tavily succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://tavily.com/result",
            title: "Tavily Result",
            content: "Tavily content",
          },
        ],
      }),
    });

    const results = await executeClaudeSearch("test query");

    expect(results).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("should return local results immediately without cloud API calls", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const startTime = Date.now();
    const results = await executeClaudeSearch("test query");
    const duration = Date.now() - startTime;

    expect(results).toEqual(EXPECTED_SEARCH_RESULTS);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(duration).toBeLessThan(1000); // Should be fast
  });

  test("should handle local SearxNG timeout and fallback", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";

    // First call: timeout
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(timeoutError);

    // Second call: public SearxNG succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await executeClaudeSearch("test query");

    expect(results).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("should handle local SearxNG 403 error and fallback", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";

    // First call: 403 Forbidden
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "JSON format disabled",
    });

    // Second call: public SearxNG succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => VALID_SEARXNG_RESPONSE,
    });

    const results = await executeClaudeSearch("test query");

    expect(results).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("should propagate error when all search providers fail", async () => {
    process.env.SEARXNG_URL = "http://localhost:8080";
    delete process.env.TAVILY_API_KEY;
    delete process.env.BRAVE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // All calls fail
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(executeClaudeSearch("test query")).rejects.toThrow();
  });
});

// ============================================================================
// Suite 10: Integration scenarios
// ============================================================================

describe("searchViaLocalSearxNG - Integration scenarios", () => {
  test("should successfully search with real-world query pattern", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://docs.python.org/3/library/asyncio.html",
            title: "asyncio — Asynchronous I/O — Python 3.13.0 documentation",
            content:
              "asyncio is a library to write concurrent code using the async/await syntax.",
          },
        ],
      }),
    });

    const results = await searchViaLocalSearxNG("python asyncio tutorial");

    expect(results).toHaveLength(1);
    expect(results[0].title).toContain("asyncio");
    expect(results[0].url).toContain("docs.python.org");
  });

  test("should handle search with multiple special characters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });

    await searchViaLocalSearxNG('typescript "generics" +examples -deprecated');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        encodeURIComponent('typescript "generics" +examples -deprecated')
      ),
      expect.any(Object)
    );
  });

  test("should handle concurrent searches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ url: "http://a.com", title: "A" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ url: "http://b.com", title: "B" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ url: "http://c.com", title: "C" }] }),
      });

    const results = await Promise.all([
      searchViaLocalSearxNG("query 1"),
      searchViaLocalSearxNG("query 2"),
      searchViaLocalSearxNG("query 3"),
    ]);

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// Suite 11: SearchResult type validation
// ============================================================================

describe("SearchResult type validation", () => {
  test("should transform SearxNG response to SearchResult format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://example.com",
            title: "Test",
            content: "Test content",
          },
        ],
      }),
    });

    const results = await searchViaLocalSearxNG("test");

    expect(results[0]).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      snippet: expect.any(String),
    });
  });

  test("should ensure snippet is optional in SearchResult", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://example.com",
            title: "Test",
            // No content
          },
        ],
      }),
    });

    const results = await searchViaLocalSearxNG("test");

    expect(results[0]).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
    });
    expect(results[0].snippet).toBeUndefined();
  });
});
