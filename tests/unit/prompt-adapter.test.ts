/**
 * Unit tests for prompt-adapter.ts
 *
 * Tests the PromptAdapter interface and core functionality for model-specific prompting.
 *
 * Components tested:
 * 1. PromptAdapter interface - Core adapter interface definition
 * 2. AdaptedPrompt type - Adapted prompt structure with metadata
 * 3. PromptAdapterConfig - Configuration options for adapters
 * 4. getPromptAdapter() factory - Creates adapter instances with fuzzy matching
 * 5. Security limits - Max prompt size (1MB), timeout (100ms)
 * 6. Model detection - Fuzzy matching for model IDs
 * 7. Backward compatibility - No adapter = no changes to output
 * 8. Error handling - Graceful fallback to GenericAdapter
 * 9. Adapter metadata - Track which adapter was used, transformation stats
 * 10. Integration points - Works with convert-anthropic-messages.ts
 *
 * Test categories:
 * - Interface validation (adapter implements all required methods)
 * - Factory function (getPromptAdapter with fuzzy matching)
 * - Security limits (1MB prompt max, 100ms timeout)
 * - Backward compatibility (undefined model = no changes)
 * - Error handling (invalid input, timeout, fallback)
 * - Metadata tracking (adapter name, stats, transformation details)
 * - Edge cases (empty prompts, huge prompts, malformed input)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  PromptAdapter,
  AdaptedPrompt,
  PromptAdapterConfig,
  getPromptAdapter,
  MAX_PROMPT_SIZE_BYTES,
  ADAPTER_TIMEOUT_MS,
} from "../../src/prompt-adapter";

// ============================================================================
// CONSTANTS & TEST DATA
// ============================================================================

const SAMPLE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

# Doing tasks

IMPORTANT: Follow instructions carefully and use the provided tools.`;

const SAMPLE_TOOLS = [
  {
    name: "Read",
    description: "Reads a file from the filesystem",
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
        file_path: { type: "string", description: "Path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["file_path", "content"],
    },
  },
];

const SAMPLE_USER_MESSAGE = "Read the README.md file and summarize it.";

const SAMPLE_TOOL_CALL = {
  type: "function",
  function: {
    name: "Read",
    arguments: '{"file_path":"README.md"}',
  },
};

// ============================================================================
// INTERFACE VALIDATION TESTS
// ============================================================================

describe("PromptAdapter Interface", () => {
  test("should define adaptSystemPrompt method", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.adaptSystemPrompt).toBeDefined();
    expect(typeof adapter.adaptSystemPrompt).toBe("function");
  });

  test("should define adaptTools method", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.adaptTools).toBeDefined();
    expect(typeof adapter.adaptTools).toBe("function");
  });

  test("should define adaptUserMessage method", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.adaptUserMessage).toBeDefined();
    expect(typeof adapter.adaptUserMessage).toBe("function");
  });

  test("should define parseToolCall method", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.parseToolCall).toBeDefined();
    expect(typeof adapter.parseToolCall).toBe("function");
  });

  test("should have modelId property", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.modelId).toBeDefined();
    expect(typeof adapter.modelId).toBe("string");
  });

  test("should have adapterName property", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.adapterName).toBeDefined();
    expect(typeof adapter.adapterName).toBe("string");
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS - getPromptAdapter()
// ============================================================================

describe("getPromptAdapter() Factory", () => {
  test("should return QwenAdapter for 'qwen2.5-coder'", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should return QwenAdapter for 'qwen3-coder-30b' (fuzzy match)", () => {
    const adapter = getPromptAdapter("qwen3-coder-30b");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should return QwenAdapter for 'Qwen2.5-Coder-7B-Instruct' (case-insensitive)", () => {
    const adapter = getPromptAdapter("Qwen2.5-Coder-7B-Instruct");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should return DeepSeekAdapter for 'deepseek-r1'", () => {
    const adapter = getPromptAdapter("deepseek-r1");
    expect(adapter.adapterName).toBe("DeepSeekAdapter");
  });

  test("should return DeepSeekAdapter for 'DeepSeek-V3' (fuzzy match)", () => {
    const adapter = getPromptAdapter("DeepSeek-V3");
    expect(adapter.adapterName).toBe("DeepSeekAdapter");
  });

  test("should return MistralAdapter for 'mistral-7b-instruct'", () => {
    const adapter = getPromptAdapter("mistral-7b-instruct");
    expect(adapter.adapterName).toBe("MistralAdapter");
  });

  test("should return MistralAdapter for 'Mixtral-8x7B' (fuzzy match)", () => {
    const adapter = getPromptAdapter("Mixtral-8x7B");
    expect(adapter.adapterName).toBe("MistralAdapter");
  });

  test("should return LlamaAdapter for 'llama-3.3-70b'", () => {
    const adapter = getPromptAdapter("llama-3.3-70b");
    expect(adapter.adapterName).toBe("LlamaAdapter");
  });

  test("should return LlamaAdapter for 'Meta-Llama-3.1-8B-Instruct' (fuzzy match)", () => {
    const adapter = getPromptAdapter("Meta-Llama-3.1-8B-Instruct");
    expect(adapter.adapterName).toBe("LlamaAdapter");
  });

  test("should return GenericAdapter for unknown model", () => {
    const adapter = getPromptAdapter("unknown-model-xyz");
    expect(adapter.adapterName).toBe("GenericAdapter");
  });

  test("should return GenericAdapter for empty string", () => {
    const adapter = getPromptAdapter("");
    expect(adapter.adapterName).toBe("GenericAdapter");
  });

  test("should return GenericAdapter for undefined model", () => {
    const adapter = getPromptAdapter(undefined as any);
    expect(adapter.adapterName).toBe("GenericAdapter");
  });

  test("should handle model IDs with special characters", () => {
    const adapter = getPromptAdapter("qwen2.5-coder-7b-instruct-q4_k_m.gguf");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should handle model IDs with version suffixes", () => {
    const adapter = getPromptAdapter("llama-3.3-70b-v2-mlx");
    expect(adapter.adapterName).toBe("LlamaAdapter");
  });
});

// ============================================================================
// SECURITY LIMITS TESTS
// ============================================================================

describe("Security Limits", () => {
  test("should define MAX_PROMPT_SIZE_BYTES as 1MB", () => {
    expect(MAX_PROMPT_SIZE_BYTES).toBe(1024 * 1024);
  });

  test("should define ADAPTER_TIMEOUT_MS as 100ms", () => {
    expect(ADAPTER_TIMEOUT_MS).toBe(100);
  });

  test("should reject prompts larger than 1MB", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const hugePrompt = "A".repeat(MAX_PROMPT_SIZE_BYTES + 1);

    await expect(async () => {
      await adapter.adaptSystemPrompt(hugePrompt);
    }).rejects.toThrow("Prompt size exceeds maximum");
  });

  test("should accept prompts exactly at 1MB limit", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const maxPrompt = "A".repeat(MAX_PROMPT_SIZE_BYTES);

    const result = await adapter.adaptSystemPrompt(maxPrompt);
    expect(result.content).toBeDefined();
  });

  test("should timeout if adaptation takes longer than 100ms", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const slowPrompt = "A".repeat(500000); // Large but under limit

    const startTime = Date.now();
    try {
      await adapter.adaptSystemPrompt(slowPrompt);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(ADAPTER_TIMEOUT_MS + 50); // Allow 50ms margin
    }
  });

  test("should validate tools array size", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const tooManyTools = Array(1000)
      .fill(null)
      .map((_, i) => ({
        name: `Tool${i}`,
        description: "A tool",
        input_schema: { type: "object", properties: {} },
      }));

    await expect(async () => {
      await adapter.adaptTools(tooManyTools);
    }).rejects.toThrow("Too many tools");
  });

  test("should validate user message length", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const hugeMessage = "A".repeat(MAX_PROMPT_SIZE_BYTES + 1);

    await expect(async () => {
      await adapter.adaptUserMessage(hugeMessage);
    }).rejects.toThrow("Message size exceeds maximum");
  });
});

// ============================================================================
// ADAPTED PROMPT STRUCTURE TESTS
// ============================================================================

describe("AdaptedPrompt Type", () => {
  test("should return adapted prompt with content field", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe("string");
  });

  test("should return metadata with adapter name", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.adapterName).toBe("QwenAdapter");
  });

  test("should return metadata with original length", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(SAMPLE_SYSTEM_PROMPT.length);
  });

  test("should return metadata with adapted length", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.adaptedLength).toBeDefined();
    expect(typeof result.metadata.adaptedLength).toBe("number");
  });

  test("should return metadata with transformation stats", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toBeDefined();
    expect(Array.isArray(result.metadata.transformations)).toBe(true);
  });

  test("should track reduction percentage in metadata", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.reductionPercent).toBeDefined();
    expect(typeof result.metadata.reductionPercent).toBe("number");
  });

  test("should indicate if content was modified", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBeDefined();
    expect(typeof result.metadata.wasModified).toBe("boolean");
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY TESTS
// ============================================================================

describe("Backward Compatibility", () => {
  test("should not modify prompt when using GenericAdapter", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBe(SAMPLE_SYSTEM_PROMPT);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should not modify tools when using GenericAdapter", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    expect(result).toEqual(SAMPLE_TOOLS);
  });

  test("should not modify user message when using GenericAdapter", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.adaptUserMessage(SAMPLE_USER_MESSAGE);

    expect(result.content).toBe(SAMPLE_USER_MESSAGE);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should pass through tool calls unchanged with GenericAdapter", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.parseToolCall(SAMPLE_TOOL_CALL);

    expect(result).toEqual(SAMPLE_TOOL_CALL);
  });

  test("should work with existing convert-anthropic-messages flow", async () => {
    // Test that adapter doesn't break existing message conversion
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe("Error Handling", () => {
  test("should handle null prompt gracefully", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    await expect(async () => {
      await adapter.adaptSystemPrompt(null as any);
    }).rejects.toThrow("Invalid prompt");
  });

  test("should handle undefined prompt gracefully", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    await expect(async () => {
      await adapter.adaptSystemPrompt(undefined as any);
    }).rejects.toThrow("Invalid prompt");
  });

  test("should handle empty prompt", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should handle malformed tools array", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const malformedTools = [
      { name: "InvalidTool" }, // Missing required fields
    ];

    await expect(async () => {
      await adapter.adaptTools(malformedTools as any);
    }).rejects.toThrow("Invalid tool schema");
  });

  test("should handle null tools array", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    await expect(async () => {
      await adapter.adaptTools(null as any);
    }).rejects.toThrow("Invalid tools");
  });

  test("should handle empty tools array", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });

  test("should handle malformed tool call", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const malformedCall = { invalid: "structure" };

    await expect(async () => {
      await adapter.parseToolCall(malformedCall);
    }).rejects.toThrow("Invalid tool call");
  });

  test("should fallback to GenericAdapter on adapter error", async () => {
    // Simulate adapter throwing error, should gracefully fall back
    const adapter = getPromptAdapter("qwen2.5-coder");
    const corruptedPrompt = "\x00\x01\x02"; // Binary data

    const result = await adapter.adaptSystemPrompt(corruptedPrompt);
    expect(result.content).toBeDefined();
    expect(result.metadata.fallbackUsed).toBe(true);
  });
});

// ============================================================================
// ADAPTER CONFIG TESTS
// ============================================================================

describe("PromptAdapterConfig", () => {
  test("should accept custom config for adapter", () => {
    const config: PromptAdapterConfig = {
      maxPromptLength: 10000,
      enableToolOptimization: true,
      preserveCriticalSections: true,
    };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    expect(adapter).toBeDefined();
  });

  test("should use default config when none provided", () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    expect(adapter).toBeDefined();
  });

  test("should respect maxPromptLength in config", async () => {
    const config: PromptAdapterConfig = {
      maxPromptLength: 100,
    };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    const longPrompt = "A".repeat(200);
    const result = await adapter.adaptSystemPrompt(longPrompt);

    expect(result.content.length).toBeLessThanOrEqual(100);
  });

  test("should respect enableToolOptimization flag", async () => {
    const config: PromptAdapterConfig = {
      enableToolOptimization: false,
    };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    const result = await adapter.adaptTools(SAMPLE_TOOLS);

    // When disabled, should return tools unchanged
    expect(result).toEqual(SAMPLE_TOOLS);
  });

  test("should preserve critical sections when flag is true", async () => {
    const config: PromptAdapterConfig = {
      preserveCriticalSections: true,
    };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.content).toContain("Tool usage policy");
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("Edge Cases", () => {
  test("should handle prompt with only whitespace", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const whitespacePrompt = "   \n\n\t\t   ";
    const result = await adapter.adaptSystemPrompt(whitespacePrompt);

    expect(result.content).toBeDefined();
  });

  test("should handle prompt with unicode characters", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const unicodePrompt = "You are Claude 🤖. Use tools 🛠️ effectively.";
    const result = await adapter.adaptSystemPrompt(unicodePrompt);

    expect(result.content).toBeDefined();
  });

  test("should handle prompt with special characters", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const specialPrompt = 'Use <tool>function</tool> and {"json":"data"}';
    const result = await adapter.adaptSystemPrompt(specialPrompt);

    expect(result.content).toBeDefined();
  });

  test("should handle tools with circular references", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const circularTool: any = {
      name: "Circular",
      description: "Test",
      input_schema: {},
    };
    circularTool.input_schema.self = circularTool;

    await expect(async () => {
      await adapter.adaptTools([circularTool]);
    }).rejects.toThrow("Circular reference");
  });

  test("should handle very long tool descriptions", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const longDescTool = {
      name: "LongDesc",
      description: "A".repeat(10000),
      input_schema: { type: "object", properties: {} },
    };

    const result = await adapter.adaptTools([longDescTool]);
    expect(result[0].description.length).toBeLessThan(10000);
  });

  test("should handle user message with code blocks", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const codeMessage =
      "Here's the code:\n```python\ndef test():\n    pass\n```";
    const result = await adapter.adaptUserMessage(codeMessage);

    expect(result.content).toContain("```python");
  });

  test("should handle concurrent adaptation requests", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const promises = Array(10)
      .fill(null)
      .map(() => adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT));

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    results.forEach((result) => {
      expect(result.content).toBeDefined();
    });
  });

  test("should handle model ID with path separators", async () => {
    const adapter = getPromptAdapter("models/qwen2.5-coder/7b-instruct");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should handle model ID with uppercase and hyphens", async () => {
    const adapter = getPromptAdapter("QWEN-2.5-CODER-7B-INSTRUCT-Q4_K_M");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });
});

// ============================================================================
// METADATA TRACKING TESTS
// ============================================================================

describe("Metadata Tracking", () => {
  test("should track transformation timestamp", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });

  test("should track transformation duration", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.durationMs).toBeDefined();
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.durationMs).toBeLessThan(ADAPTER_TIMEOUT_MS);
  });

  test("should list applied transformations", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toBeDefined();
    expect(Array.isArray(result.metadata.transformations)).toBe(true);
  });

  test("should calculate accurate reduction percentage", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    const expected =
      ((SAMPLE_SYSTEM_PROMPT.length - result.content.length) /
        SAMPLE_SYSTEM_PROMPT.length) *
      100;
    expect(result.metadata.reductionPercent).toBeCloseTo(expected, 1);
  });

  test("should track model-specific optimizations", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(SAMPLE_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toBeDefined();
    expect(Array.isArray(result.metadata.modelOptimizations)).toBe(true);
  });
});
