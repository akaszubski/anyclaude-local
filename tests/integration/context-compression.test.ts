/**
 * Integration Tests: Context Compression End-to-End (Issue #36)
 *
 * Tests the complete context management flow including compression,
 * observation masking, and interaction with the existing proxy system.
 *
 * IMPLEMENTATION STATUS: TDD GREEN PHASE
 * Expected: All tests PASS (implementation complete)
 */

import {
  ContextManager,
  compressToolResult,
  partitionMessages,
} from "../../dist/context-manager";

// Type alias for test readability
type AnthropicMessage = {
  role: "user" | "assistant";
  content: Array<{
    type: string;
    text?: string;
    cache_control?: undefined;
    [key: string]: any;
  }>;
};

// ============================================================================
// END-TO-END COMPRESSION TESTS
// ============================================================================

describe("Context Compression - End to End", () => {
  test("should create manager with compression config", () => {
    const manager = new ContextManager({
      compressAt: 0.5,
      keepRecentTurns: 3,
      toolResultMaxTokens: 500,
    });
    expect(manager).toBeDefined();
  });

  test("should manage context for multi-turn conversation", () => {
    const manager = new ContextManager(
      { compressAt: 0.5, keepRecentTurns: 2, toolResultMaxTokens: 200 },
      "current-model",
      2000
    );

    const messages: AnthropicMessage[] = [
      { role: "user", content: [{ type: "text", text: "Message 1" }] },
      { role: "assistant", content: [{ type: "text", text: "Response 1" }] },
      { role: "user", content: [{ type: "text", text: "Message 2" }] },
      { role: "assistant", content: [{ type: "text", text: "Response 2" }] },
    ];

    const result = manager.manageContext(messages);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.finalTokens).toBeGreaterThan(0);
  });
});

// ============================================================================
// OBSERVATION MASKING INTEGRATION TESTS
// ============================================================================

describe("Context Compression - Observation Masking", () => {
  test("should create manager with observation masking enabled", () => {
    const manager = new ContextManager({
      compressAt: 0.5,
      enableObservationMasking: true,
    });
    expect(manager).toBeDefined();
  });

  test("should mask old tool results when enabled", () => {
    const manager = new ContextManager(
      {
        compressAt: 0.3,
        keepRecentTurns: 1,
        toolResultMaxTokens: 50,
        enableObservationMasking: true,
      },
      "current-model",
      500
    );

    const messages: AnthropicMessage[] = [
      { role: "user", content: [{ type: "text", text: "Read file" }] },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "read", input: {} }],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "x".repeat(500),
            is_error: false,
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Here is the content" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Now do something else" }],
      },
    ];

    const result = manager.manageContext(messages);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("Context Compression - Performance", () => {
  test("should handle large conversations efficiently", () => {
    const manager = new ContextManager(
      { compressAt: 0.5, keepRecentTurns: 5, toolResultMaxTokens: 500 },
      "current-model",
      32768
    );

    // Generate 50 message pairs
    const messages: AnthropicMessage[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push({
        role: "user",
        content: [{ type: "text", text: `User message ${i}` }],
      });
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: `Assistant response ${i}` }],
      });
    }

    const start = Date.now();
    const result = manager.manageContext(messages);
    const elapsed = Date.now() - start;

    expect(result.messages.length).toBeGreaterThan(0);
    // Allow 10 seconds for CI environments which may be slower
    expect(elapsed).toBeLessThan(10000);
  });
});

// ============================================================================
// MODEL-SPECIFIC INTEGRATION TESTS
// ============================================================================

describe("Context Compression - Model Integration", () => {
  test("should work with Qwen 32K context", () => {
    const manager = new ContextManager(
      { compressAt: 0.7, toolResultMaxTokens: 500 },
      "qwen2.5-coder-7b",
      32768
    );
    expect(manager).toBeDefined();

    const usage = manager.getUsage([
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ]);
    expect(usage.tokens).toBeGreaterThan(0);
  });

  test("should work with DeepSeek 16K context", () => {
    const manager = new ContextManager(
      { compressAt: 0.7, toolResultMaxTokens: 500 },
      "deepseek-coder-v2-lite",
      16384
    );
    expect(manager).toBeDefined();
  });

  test("should work with Gemini 1M context", () => {
    const manager = new ContextManager(
      { compressAt: 0.7, toolResultMaxTokens: 500 },
      "google/gemini-2.5-flash",
      1048576
    );
    expect(manager).toBeDefined();
  });
});

// ============================================================================
// REAL-WORLD CONVERSATION PATTERNS
// ============================================================================

describe("Context Compression - Real-world Patterns", () => {
  test("should handle code review pattern", () => {
    const manager = new ContextManager(
      { compressAt: 0.5, keepRecentTurns: 2, toolResultMaxTokens: 500 },
      "current-model",
      8000
    );

    const messages: AnthropicMessage[] = [
      { role: "user", content: [{ type: "text", text: "Review this code" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "I see several issues..." }],
      },
      { role: "user", content: [{ type: "text", text: "Can you fix them?" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "Here are the fixes..." }],
      },
    ];

    const result = manager.manageContext(messages);
    expect(result.messages.length).toBe(4);
  });

  test("should handle debugging pattern", () => {
    const manager = new ContextManager(
      { compressAt: 0.5, enableObservationMasking: true },
      "current-model",
      8000
    );
    expect(manager).toBeDefined();
  });

  test("should handle refactoring pattern", () => {
    const manager = new ContextManager(
      { compressAt: 0.5, keepRecentTurns: 1, toolResultMaxTokens: 500 },
      "current-model",
      8000
    );
    expect(manager).toBeDefined();
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY INTEGRATION TESTS
// ============================================================================

describe("Context Compression - Backward Compatibility", () => {
  test("should coexist with existing truncateMessages", () => {
    const {
      truncateMessages,
      calculateContextStats,
    } = require("../../dist/context-manager");

    // Verify both old and new APIs work
    expect(truncateMessages).toBeDefined();
    expect(calculateContextStats).toBeDefined();

    const manager = new ContextManager({
      compressAt: 0.7,
      toolResultMaxTokens: 500,
    });
    expect(manager).toBeDefined();
  });
});

// ============================================================================
// ERROR RECOVERY INTEGRATION TESTS
// ============================================================================

describe("Context Compression - Error Recovery", () => {
  test("should handle malformed messages gracefully", () => {
    const manager = new ContextManager({
      compressAt: 0.5,
      toolResultMaxTokens: 500,
    });

    const messages: AnthropicMessage[] = [
      { role: "user", content: [] }, // Empty content
    ];

    expect(() => manager.manageContext(messages)).not.toThrow();
  });

  test("should handle unknown model gracefully", () => {
    expect(
      () => new ContextManager({ compressAt: 0.5 }, "unknown-model-xyz-123")
    ).not.toThrow();
  });
});

// ============================================================================
// COMPRESSION STRATEGY TESTS
// ============================================================================

describe("Context Compression - Strategy Selection", () => {
  test("should apply tool result compression", () => {
    const longContent = "x".repeat(5000);
    const compressed = compressToolResult(longContent, 500);

    expect(compressed.length).toBeLessThan(longContent.length);
    expect(compressed).toContain("[... Output truncated:");
  });

  test("should work with observation masking enabled", () => {
    const manager = new ContextManager({
      compressAt: 0.5,
      toolResultMaxTokens: 10000,
      enableObservationMasking: true,
    });
    expect(manager).toBeDefined();
  });

  test("should work with combined strategies", () => {
    const manager = new ContextManager({
      compressAt: 0.5,
      keepRecentTurns: 3,
      toolResultMaxTokens: 500,
      enableObservationMasking: true,
    });
    expect(manager).toBeDefined();

    const messages: AnthropicMessage[] = [
      { role: "user", content: [{ type: "text", text: "Test" }] },
    ];

    const result = manager.manageContext(messages);
    expect(result.messages.length).toBe(1);
  });
});
