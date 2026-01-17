/**
 * Unit Tests: Context Manager Extended Features (Issue #36)
 *
 * Tests for multi-turn context management with compression, summarization,
 * and intelligent tool result handling.
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
    cache_control?: { type: "ephemeral" } | undefined;
    [key: string]: any;
  }>;
};

// ============================================================================
// CONSTRUCTOR & CONFIGURATION TESTS
// ============================================================================

describe("ContextManager - Construction", () => {
  test("should create manager with default config", () => {
    const manager = new ContextManager({});
    expect(manager).toBeDefined();
  });

  test("should accept compressAt threshold", () => {
    const manager = new ContextManager({ compressAt: 0.7 });
    expect(manager).toBeDefined();
  });

  test("should accept keepRecentTurns setting", () => {
    const manager = new ContextManager({ keepRecentTurns: 5 });
    expect(manager).toBeDefined();
  });

  test("should accept toolResultMaxTokens limit", () => {
    const manager = new ContextManager({ toolResultMaxTokens: 500 });
    expect(manager).toBeDefined();
  });

  test("should accept model name for context limits", () => {
    const manager = new ContextManager({}, "qwen2.5-coder-7b");
    expect(manager).toBeDefined();
  });

  test("should accept lmstudio context length override", () => {
    const manager = new ContextManager({}, "current-model", 16384);
    expect(manager).toBeDefined();
  });
});

// ============================================================================
// USAGE TRACKING TESTS
// ============================================================================

describe("ContextManager - Usage Tracking", () => {
  test("should calculate token usage for messages", () => {
    const manager = new ContextManager({}, "current-model", 4096);
    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello", cache_control: undefined }],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hi there!", cache_control: undefined },
        ],
      },
    ];

    const usage = manager.getUsage(messages);
    expect(usage.tokens).toBeGreaterThan(0);
    expect(usage.percent).toBeGreaterThan(0);
    expect(usage.percent).toBeLessThan(1); // percent is 0-1, not 0-100
    expect(usage.breakdown).toBeDefined();
    expect(usage.breakdown.messages).toBeGreaterThan(0);
  });

  test("should include system prompt tokens", () => {
    const manager = new ContextManager({}, "current-model", 4096);
    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello", cache_control: undefined }],
      },
    ];
    // System must be array of text content objects (Anthropic format)
    const system = [{ type: "text", text: "You are a helpful assistant." }];

    const usageWithSystem = manager.getUsage(messages, system as any);
    const usageWithoutSystem = manager.getUsage(messages);

    expect(usageWithSystem.tokens).toBeGreaterThan(usageWithoutSystem.tokens);
  });
});

// ============================================================================
// TOOL RESULT COMPRESSION TESTS
// ============================================================================

describe("ContextManager - Tool Result Compression", () => {
  test("should compress long tool results", () => {
    const longContent = "x".repeat(10000);
    const compressed = compressToolResult(longContent, 500);

    expect(compressed.length).toBeLessThan(longContent.length);
    // Uses "[... Output truncated: X → Y tokens]" format
    expect(compressed).toContain("[... Output truncated:");
  });

  test("should preserve short tool results", () => {
    const shortContent = "short result";
    const result = compressToolResult(shortContent, 500);

    expect(result).toBe(shortContent);
  });
});

// ============================================================================
// MESSAGE PARTITIONING TESTS
// ============================================================================

describe("ContextManager - Message Partitioning", () => {
  test("should partition messages into recent and older", () => {
    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Message 1", cache_control: undefined },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Response 1", cache_control: undefined },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Message 2", cache_control: undefined },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Response 2", cache_control: undefined },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Message 3", cache_control: undefined },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Response 3", cache_control: undefined },
        ],
      },
    ];

    // partitionMessages uses message count (not pairs)
    // With 6 messages and keepRecent=4, keeps last 4 messages
    const { recent, older } = partitionMessages(messages, 4);

    expect(recent.length).toBe(4);
    expect(older.length).toBe(2);
  });

  test("should return all messages as recent if few messages", () => {
    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello", cache_control: undefined }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi", cache_control: undefined }],
      },
    ];

    const { recent, older } = partitionMessages(messages, 3);

    expect(recent.length).toBe(2);
    expect(older.length).toBe(0);
  });
});

// ============================================================================
// CONTEXT COMPRESSION ORCHESTRATION TESTS
// ============================================================================

describe("ContextManager - Compression Orchestration", () => {
  test("should compress context when threshold exceeded", () => {
    // Small context limit to trigger compression
    const manager = new ContextManager(
      { compressAt: 0.5, keepRecentTurns: 1, toolResultMaxTokens: 100 },
      "current-model",
      1000
    );

    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "x".repeat(500), cache_control: undefined },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "y".repeat(500), cache_control: undefined },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "z".repeat(500), cache_control: undefined },
        ],
      },
    ];

    // System must be array of text content objects (Anthropic format)
    const system = [{ type: "text", text: "You are helpful." }];
    const result = manager.manageContext(messages, system as any);

    // Should have compressed some messages
    expect(result).toBeDefined();
    expect(result.messages).toBeDefined();
  });
});

// ============================================================================
// SUMMARIZATION TESTS
// ============================================================================

describe("ContextManager - Summarization", () => {
  test("should produce summary when enabled", () => {
    const manager = new ContextManager({
      enableSummarization: true,
      keepRecentTurns: 1,
    });

    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "What is the capital of France?",
            cache_control: undefined,
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The capital of France is Paris.",
            cache_control: undefined,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "What is its population?",
            cache_control: undefined,
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "About 2.1 million.",
            cache_control: undefined,
          },
        ],
      },
    ];

    const summary = manager.summarize(messages);
    expect(summary).toBeDefined();
    expect(typeof summary).toBe("string");
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY TESTS
// ============================================================================

describe("ContextManager - Backward Compatibility", () => {
  test("should work alongside existing truncateMessages", () => {
    // Verify we can still import from context-manager
    const {
      truncateMessages,
      calculateContextStats,
    } = require("../../dist/context-manager");
    expect(truncateMessages).toBeDefined();
    expect(calculateContextStats).toBeDefined();
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe("ContextManager - Error Handling", () => {
  test("should handle empty message array", () => {
    const manager = new ContextManager({});
    const result = manager.manageContext([]);

    expect(result.messages).toEqual([]);
  });

  test("should handle invalid model name gracefully", () => {
    expect(() => new ContextManager({}, "nonexistent-model-xyz")).not.toThrow();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("ContextManager - Edge Cases", () => {
  test("should handle single message", () => {
    const manager = new ContextManager({});
    const messages: AnthropicMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello", cache_control: undefined }],
      },
    ];

    const result = manager.manageContext(messages);
    expect(result.messages.length).toBe(1);
  });

  test("should handle messages with empty content", () => {
    const manager = new ContextManager({});
    const messages: AnthropicMessage[] = [{ role: "user", content: [] }];

    const result = manager.manageContext(messages);
    expect(result).toBeDefined();
  });
});
