/**
 * Unit tests for Generic (pass-through) model adapter
 *
 * Tests the default adapter behavior for unknown models.
 *
 * GenericAdapter Characteristics:
 * - Pass-through behavior (no modifications)
 * - Backward compatibility guarantee
 * - Fallback for unknown models
 * - Safety net for new/untested models
 * - Metadata tracking without transformation
 *
 * GenericAdapter Behavior:
 * 1. Return system prompts unchanged
 * 2. Return tools unchanged
 * 3. Return user messages unchanged
 * 4. Pass through tool calls unchanged
 * 5. Mark wasModified as false
 * 6. Track metadata without transformations
 * 7. Handle all edge cases gracefully
 * 8. Serve as fallback adapter
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { GenericAdapter } from "../../../src/adapters/generic-adapter";
import { AdaptedPrompt } from "../../../src/prompt-adapter";

// ============================================================================
// TEST DATA
// ============================================================================

const SAMPLE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

# Doing tasks

IMPORTANT: Follow instructions carefully and use the provided tools.`;

const SAMPLE_TOOLS = [
  {
    name: "Read",
    description:
      "Reads a file from the filesystem. Very detailed description with lots of explanation about how it works and when to use it.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to the file" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description: "Writes content to a file",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        content: { type: "string" },
      },
      required: ["file_path", "content"],
    },
  },
];

const SAMPLE_USER_MESSAGE =
  "Read the README.md file and write a summary to summary.txt.";

const SAMPLE_TOOL_CALL = {
  type: "function",
  function: {
    name: "Read",
    arguments: '{"file_path":"README.md"}',
  },
};

// ============================================================================
// CONSTRUCTOR & BASIC TESTS
// ============================================================================

describe("GenericAdapter - Construction", () => {
  test("should create adapter with modelId", () => {
    const adapter = new GenericAdapter("unknown-model-xyz");
    expect(adapter.modelId).toBe("unknown-model-xyz");
  });

  test("should set adapterName to 'GenericAdapter'", () => {
    const adapter = new GenericAdapter("any-model");
    expect(adapter.adapterName).toBe("GenericAdapter");
  });

  test("should handle empty modelId", () => {
    const adapter = new GenericAdapter("");
    expect(adapter.modelId).toBe("");
  });

  test("should handle undefined modelId", () => {
    const adapter = new GenericAdapter(undefined as any);
    expect(adapter.modelId).toBe(undefined);
  });

  test("should handle null modelId", () => {
    const adapter = new GenericAdapter(null as any);
    expect(adapter.modelId).toBe(null);
  });
});

// ============================================================================
// SYSTEM PROMPT - PASS-THROUGH TESTS
// ============================================================================

describe("GenericAdapter - adaptSystemPrompt() Pass-through", () => {
  test("should return prompt unchanged", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
  });

  test("should mark wasModified as false", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(false);
  });

  test("should return empty transformations array", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toEqual([]);
  });

  test("should return 0% reduction", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.reductionPercent).toBe(0);
  });

  test("should preserve original and adapted lengths", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(SAMPLE_SYSTEM_PROMPT.length);
    expect(result.metadata.adaptedLength).toBe(SAMPLE_SYSTEM_PROMPT.length);
  });

  test("should handle empty prompt", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should handle very long prompt", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const longPrompt = "A".repeat(100000);
    const result = await adapter.adaptSystemPrompt(longPrompt);

    expect(result.content).toBe(longPrompt);
    expect(result.content.length).toBe(100000);
  });

  test("should handle prompt with special characters", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const specialPrompt =
      "Use <tool>function</tool> and {json} with @params & $vars.";
    const result = await adapter.adaptSystemPrompt(specialPrompt);

    expect(result.content).toBe(specialPrompt);
  });

  test("should handle prompt with unicode", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const unicodePrompt = "你好世界 🌍 Привет мир";
    const result = await adapter.adaptSystemPrompt(unicodePrompt);

    expect(result.content).toBe(unicodePrompt);
  });

  test("should handle prompt with code blocks", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const codePrompt = "Example:\n```python\ndef test():\n    pass\n```";
    const result = await adapter.adaptSystemPrompt(codePrompt);

    expect(result.content).toBe(codePrompt);
  });
});

// ============================================================================
// TOOLS - PASS-THROUGH TESTS
// ============================================================================

describe("GenericAdapter - adaptTools() Pass-through", () => {
  test("should return tools unchanged", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    expect(result).toEqual(SAMPLE_TOOLS);
  });

  test("should preserve tool names exactly", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    expect(result[0].name).toBe("Read");
    expect(result[1].name).toBe("Write");
  });

  test("should preserve tool descriptions exactly", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    expect(result[0].description).toBe(SAMPLE_TOOLS[0].description);
    expect(result[1].description).toBe(SAMPLE_TOOLS[1].description);
  });

  test("should preserve input schemas exactly", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    expect(result[0].input_schema).toEqual(SAMPLE_TOOLS[0].input_schema);
    expect(result[1].input_schema).toEqual(SAMPLE_TOOLS[1].input_schema);
  });

  test("should handle empty tools array", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });

  test("should handle single tool", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const singleTool = [SAMPLE_TOOLS[0]];
    const result = await adapter.adaptTools(singleTool);

    expect(result).toEqual(singleTool);
  });

  test("should handle many tools", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const manyTools = Array(100)
      .fill(null)
      .map((_, i) => ({
        name: `Tool${i}`,
        description: `Description ${i}`,
        input_schema: { type: "object", properties: {} },
      }));

    const result = await adapter.adaptTools(manyTools);
    expect(result).toEqual(manyTools);
    expect(result).toHaveLength(100);
  });

  test("should preserve complex nested schemas", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const complexTool = [
      {
        name: "Complex",
        description: "Complex tool",
        input_schema: {
          type: "object",
          properties: {
            nested: {
              type: "object",
              properties: {
                deep: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ];

    const result = await adapter.adaptTools(complexTool);
    expect(result).toEqual(complexTool);
  });

  test("should preserve tool metadata", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const toolsWithMetadata = [
      {
        name: "Test",
        description: "Test",
        input_schema: { type: "object", properties: {} },
        custom_field: "custom_value",
        another_field: 123,
      },
    ];

    const result = await adapter.adaptTools(toolsWithMetadata as any);
    expect(result).toEqual(toolsWithMetadata);
  });
});

// ============================================================================
// USER MESSAGE - PASS-THROUGH TESTS
// ============================================================================

describe("GenericAdapter - adaptUserMessage() Pass-through", () => {
  test("should return message unchanged", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptUserMessage(SAMPLE_USER_MESSAGE);

    expect(result.content).toBe(SAMPLE_USER_MESSAGE);
  });

  test("should mark wasModified as false", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptUserMessage(SAMPLE_USER_MESSAGE);

    expect(result.metadata.wasModified).toBe(false);
  });

  test("should handle empty message", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptUserMessage("");

    expect(result.content).toBe("");
  });

  test("should preserve code blocks", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const codeMessage = "Fix:\n```python\ndef broken():\n    pass\n```";
    const result = await adapter.adaptUserMessage(codeMessage);

    expect(result.content).toBe(codeMessage);
  });

  test("should preserve long messages", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const longMessage = "A".repeat(50000);
    const result = await adapter.adaptUserMessage(longMessage);

    expect(result.content).toBe(longMessage);
  });

  test("should preserve special characters", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const specialMessage = "Use <tag> and {json} with @params.";
    const result = await adapter.adaptUserMessage(specialMessage);

    expect(result.content).toBe(specialMessage);
  });

  test("should preserve unicode", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const unicodeMessage = "Hello 世界 🌍";
    const result = await adapter.adaptUserMessage(unicodeMessage);

    expect(result.content).toBe(unicodeMessage);
  });
});

// ============================================================================
// TOOL CALL PARSING - PASS-THROUGH TESTS
// ============================================================================

describe("GenericAdapter - parseToolCall() Pass-through", () => {
  test("should return tool call unchanged", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.parseToolCall(SAMPLE_TOOL_CALL);

    expect(result).toEqual(SAMPLE_TOOL_CALL);
  });

  test("should preserve tool call structure", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.parseToolCall(SAMPLE_TOOL_CALL);

    expect(result.type).toBe("function");
    expect(result.function.name).toBe("Read");
    expect(result.function.arguments).toBe('{"file_path":"README.md"}');
  });

  test("should preserve tool call ID", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const toolCallWithId = {
      id: "call_abc123",
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(toolCallWithId);
    expect(result).toEqual(toolCallWithId);
  });

  test("should handle tool call with object arguments", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const objectArgs = {
      type: "function",
      function: {
        name: "Read",
        arguments: { file_path: "test.txt" },
      },
    };

    const result = await adapter.parseToolCall(objectArgs);
    expect(result).toEqual(objectArgs);
  });

  test("should handle tool call with empty arguments", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const emptyArgs = {
      type: "function",
      function: {
        name: "NoArgs",
        arguments: "{}",
      },
    };

    const result = await adapter.parseToolCall(emptyArgs);
    expect(result).toEqual(emptyArgs);
  });

  test("should preserve custom tool call fields", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const customCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
      custom_field: "custom_value",
      metadata: { key: "value" },
    };

    const result = await adapter.parseToolCall(customCall);
    expect(result).toEqual(customCall);
  });
});

// ============================================================================
// METADATA TESTS
// ============================================================================

describe("GenericAdapter - Metadata", () => {
  test("should track timestamp", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });

  test("should track duration", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.durationMs).toBeDefined();
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.durationMs).toBeLessThan(100);
  });

  test("should indicate no model optimizations", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toEqual([]);
  });

  test("should track adapter name correctly", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.adapterName).toBe("GenericAdapter");
  });

  test("should not indicate fallback was used", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.fallbackUsed).toBe(false);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("GenericAdapter - Edge Cases", () => {
  test("should handle null prompt gracefully", async () => {
    const adapter = new GenericAdapter("unknown-model");

    await expect(async () => {
      await adapter.adaptSystemPrompt(null as any);
    }).rejects.toThrow("Invalid prompt");
  });

  test("should handle undefined prompt gracefully", async () => {
    const adapter = new GenericAdapter("unknown-model");

    await expect(async () => {
      await adapter.adaptSystemPrompt(undefined as any);
    }).rejects.toThrow("Invalid prompt");
  });

  test("should handle null tools array gracefully", async () => {
    const adapter = new GenericAdapter("unknown-model");

    await expect(async () => {
      await adapter.adaptTools(null as any);
    }).rejects.toThrow("Invalid tools");
  });

  test("should handle malformed tool call gracefully", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const malformed = { invalid: "structure" };

    await expect(async () => {
      await adapter.parseToolCall(malformed);
    }).rejects.toThrow("Invalid tool call");
  });

  test("should handle concurrent operations", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const promises = [
      adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT),
      adapter.adaptTools(SAMPLE_TOOLS),
      adapter.adaptUserMessage(SAMPLE_USER_MESSAGE),
      adapter.parseToolCall(SAMPLE_TOOL_CALL),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(4);
  });

  test("should handle whitespace-only prompt", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const whitespace = "   \n\n\t   ";
    const result = await adapter.adaptSystemPrompt(whitespace);

    expect(result.content).toBe(whitespace);
  });

  test("should handle binary-like data", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const binaryPrompt = "\x00\x01\x02\x03";
    const result = await adapter.adaptSystemPrompt(binaryPrompt);

    expect(result.content).toBe(binaryPrompt);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("GenericAdapter - Performance", () => {
  test("should complete adaptSystemPrompt instantly", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const start = Date.now();
    await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(10); // Should be nearly instant
  });

  test("should handle large prompts efficiently", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const largePrompt = "A".repeat(1000000); // 1MB
    const start = Date.now();
    await adapter.adaptSystemPrompt(largePrompt);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
  });

  test("should handle many tools efficiently", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const manyTools = Array(1000)
      .fill(null)
      .map((_, i) => ({
        name: `Tool${i}`,
        description: "Description",
        input_schema: { type: "object", properties: {} },
      }));

    const start = Date.now();
    await adapter.adaptTools(manyTools);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
  });

  test("should handle rapid successive calls", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const promises = Array(100)
      .fill(null)
      .map(() => adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT));

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY TESTS
// ============================================================================

describe("GenericAdapter - Backward Compatibility", () => {
  test("should guarantee no changes to system prompt", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    // Byte-for-byte identical
    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
    expect(result.content.length).toBe(SAMPLE_SYSTEM_PROMPT.length);
  });

  test("should guarantee no changes to tools", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    // Deep equality
    expect(JSON.stringify(result)).toBe(JSON.stringify(SAMPLE_TOOLS));
  });

  test("should work with existing convert-anthropic-messages", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    // Should be compatible with existing message conversion
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe("string");
  });

  test("should not break when used with real Claude prompts", async () => {
    const adapter = new GenericAdapter("unknown-model");
    const claudePrompt = `You are Claude Code, Anthropic's official CLI for Claude.

# Tool usage policy
When making function calls...`;

    const result = await adapter.adaptSystemPrompt(claudePrompt);
    expect(result.content).toBe(claudePrompt);
  });
});

// ============================================================================
// FALLBACK ADAPTER TESTS
// ============================================================================

describe("GenericAdapter - Fallback Behavior", () => {
  test("should serve as safe fallback for any model", async () => {
    const adapter = new GenericAdapter("totally-unknown-model-2025");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should work with model IDs containing special chars", async () => {
    const adapter = new GenericAdapter("model-v1.2.3-alpha+build.123");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
  });

  test("should work with very long model IDs", async () => {
    const adapter = new GenericAdapter("a".repeat(1000));
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
  });

  test("should never throw errors on valid input", async () => {
    const adapter = new GenericAdapter("unknown");

    await expect(
      adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT)
    ).resolves.toBeDefined();
    await expect(adapter.adaptTools(SAMPLE_TOOLS)).resolves.toBeDefined();
    await expect(
      adapter.adaptUserMessage(SAMPLE_USER_MESSAGE)
    ).resolves.toBeDefined();
    await expect(
      adapter.parseToolCall(SAMPLE_TOOL_CALL)
    ).resolves.toBeDefined();
  });
});
