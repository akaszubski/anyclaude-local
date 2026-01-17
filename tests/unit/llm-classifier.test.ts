/**
 * Unit tests for llm-classifier.ts
 *
 * Tests the LLMClassifier class for making GenAI-based binary YES/NO search intent
 * classification calls to local backend models.
 *
 * Components tested:
 * 1. Binary classification (YES/NO parsing)
 * 2. Fuzzy response handling ("Yes, this is...", "No, because...")
 * 3. JSON response parsing
 * 4. Timeout handling
 * 5. Network error handling
 * 6. Prompt construction
 * 7. Mode-based behavior (skip for cloud modes)
 * 8. Backend URL configuration
 *
 * Test categories:
 * - Response parsing (YES/NO, fuzzy, JSON)
 * - Error handling (timeout, network, malformed responses)
 * - Prompt building
 * - Configuration (mode, URL, timeout)
 * - Edge cases (empty response, unexpected formats)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { LLMClassifier } from "../../src/llm-classifier";

// Mock fetch for network calls
global.fetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
});

// ============================================================================
// Tests: Binary YES/NO parsing
// ============================================================================

describe("LLMClassifier - Binary YES/NO parsing", () => {
  test("should parse 'YES' as true", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("what is the weather in NYC");

    expect(result).toBe(true);
  });

  test("should parse 'NO' as false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "NO" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("write a function to sort");

    expect(result).toBe(false);
  });

  test("should parse 'yes' (lowercase) as true", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "yes" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("search for react docs");

    expect(result).toBe(true);
  });

  test("should parse 'no' (lowercase) as false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "no" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("create a component");

    expect(result).toBe(false);
  });
});

// ============================================================================
// Tests: Fuzzy response handling
// ============================================================================

describe("LLMClassifier - Fuzzy response handling", () => {
  test("should parse 'Yes, this is a search query' as true", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "Yes, this is clearly a search query for current information.",
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("what is the latest news");

    expect(result).toBe(true);
  });

  test("should parse 'No, this is a code generation request' as false", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "No, this is a code generation request, not a search.",
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("write a sorting function");

    expect(result).toBe(false);
  });

  test("should handle 'YES' with trailing whitespace", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  YES  \n" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("search query");

    expect(result).toBe(true);
  });

  test("should handle 'NO' with leading explanation", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "After analysis, NO - this is not a search query.",
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("fix this bug");

    expect(result).toBe(false);
  });

  test("should extract YES from multi-line response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "Let me analyze this request.\n\nYES\n\nThis appears to be a search query.",
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("look up TypeScript docs");

    expect(result).toBe(true);
  });
});

// ============================================================================
// Tests: JSON response parsing
// ============================================================================

describe("LLMClassifier - JSON response parsing", () => {
  test("should parse JSON response with 'is_search: true'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"is_search": true, "confidence": "high"}',
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("search for docs");

    expect(result).toBe(true);
  });

  test("should parse JSON response with 'is_search: false'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"is_search": false, "confidence": "high"}',
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("write code");

    expect(result).toBe(false);
  });

  test("should parse JSON with 'answer' field", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"answer": "YES"}',
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("web search");

    expect(result).toBe(true);
  });

  test("should handle JSON embedded in text", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'Here is my analysis: {"is_search": true} - this is a search.',
            },
          },
        ],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("look up info");

    expect(result).toBe(true);
  });
});

// ============================================================================
// Tests: Error handling
// ============================================================================

describe("LLMClassifier - Error handling", () => {
  test("should throw on timeout", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 100)
        )
    );

    const classifier = new LLMClassifier("local", "http://localhost:1234", 50); // 50ms timeout

    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should throw on network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Network error")
    );

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should throw on HTTP error status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should throw on malformed JSON response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should handle empty response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    // Should fall back to default (false) or throw
    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should handle missing choices in response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    await expect(classifier.classify("search query")).rejects.toThrow();
  });

  test("should handle ambiguous response (neither YES nor NO)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "MAYBE" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    // Should default to false or throw
    const result = await classifier.classify("ambiguous query");
    expect(typeof result).toBe("boolean");
  });
});

// ============================================================================
// Tests: Prompt construction
// ============================================================================

describe("LLMClassifier - Prompt construction", () => {
  test("should build correct prompt for classification", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    await classifier.classify("what is the weather in NYC");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);

    expect(body.messages).toBeDefined();
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("search intent");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("what is the weather in NYC");
  });

  test("should include user message in prompt", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "NO" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    await classifier.classify("write a sorting algorithm");

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);

    expect(body.messages[1].content).toContain("write a sorting algorithm");
  });

  test("should set appropriate temperature for classification", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    await classifier.classify("search query");

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);

    // Low temperature for deterministic classification
    expect(body.temperature).toBeLessThanOrEqual(0.3);
  });

  test("should set max_tokens for concise response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    await classifier.classify("search query");

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);

    // Small max_tokens for YES/NO response
    expect(body.max_tokens).toBeLessThanOrEqual(10);
  });
});

// ============================================================================
// Tests: Configuration and mode handling
// ============================================================================

describe("LLMClassifier - Configuration", () => {
  test("should use provided backend URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://custom:8080");
    await classifier.classify("search query");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://custom:8080/v1/chat/completions",
      expect.any(Object)
    );
  });

  test("should use default backend URL when not provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local");
    await classifier.classify("search query");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/chat/completions"),
      expect.any(Object)
    );
  });

  test("should respect custom timeout", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  choices: [{ message: { content: "YES" } }],
                }),
              }),
            100
          )
        )
    );

    const classifier = new LLMClassifier("local", "http://localhost:1234", 200); // 200ms timeout

    const result = await classifier.classify("search query");
    expect(result).toBe(true);
  });

  test("should skip classification for cloud mode (openrouter)", async () => {
    const classifier = new LLMClassifier("openrouter");

    // Should return false or skip without network call
    const result = await classifier.classify("search query");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test("should skip classification for cloud mode (claude)", async () => {
    const classifier = new LLMClassifier("claude");

    // Should return false or skip without network call
    const result = await classifier.classify("search query");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test("should work with local mode", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("search query");

    expect(global.fetch).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test("should work with mlx-cluster mode", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier(
      "mlx-cluster",
      "http://localhost:5001"
    );
    const result = await classifier.classify("search query");

    expect(global.fetch).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

// ============================================================================
// Tests: Edge cases
// ============================================================================

describe("LLMClassifier - Edge cases", () => {
  test("should handle very long user messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const longMessage = "search for ".repeat(1000) + "information";
    const result = await classifier.classify(longMessage);

    expect(result).toBe(true);
  });

  test("should handle special characters in messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify('search for "quotes" & <tags>');

    expect(result).toBe(true);
  });

  test("should handle unicode in messages", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");
    const result = await classifier.classify("search for 日本語 information");

    expect(result).toBe(true);
  });

  test("should handle concurrent classifications", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "YES" } }],
      }),
    });

    const classifier = new LLMClassifier("local", "http://localhost:1234");

    const results = await Promise.all([
      classifier.classify("query 1"),
      classifier.classify("query 2"),
      classifier.classify("query 3"),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
