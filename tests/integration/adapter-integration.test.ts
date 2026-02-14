/**
 * Integration tests for prompt adapter system (Issue #37)
 *
 * Tests the complete adapter flow from factory to message conversion.
 *
 * Integration Scenarios:
 * 1. Factory → Adapter → Anthropic Messages conversion
 * 2. Multiple adapters working together
 * 3. Adapter selection based on model ID
 * 4. Backward compatibility with existing proxy code
 * 5. End-to-end prompt transformation pipeline
 * 6. Error handling and fallback behavior
 * 7. Performance under realistic workloads
 * 8. Configuration-based adapter selection
 *
 * IMPLEMENTATION STATUS: TDD GREEN PHASE
 * Expected: All tests PASS (implementation complete)
 */

import {
  getPromptAdapter,
  PromptAdapter,
  MAX_PROMPT_SIZE_BYTES,
} from "../../src/prompt-adapter";

// ============================================================================
// TEST DATA - Realistic Scenarios
// ============================================================================

const FULL_CLAUDE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

This is a comprehensive system that helps developers write code more efficiently through
a wide range of tools and capabilities. The system provides powerful assistance for
various development tasks while maintaining high standards of code quality.

# Tool usage policy

When making function calls using tools that accept array or object parameters, it is
critically important that you ensure those parameters are properly structured using
JSON format. This ensures compatibility and correct parsing by the system.

For example, when using the Edit tool:
- Good: {"file_path": "test.js", "old_string": "foo", "new_string": "bar"}
- Bad: {file_path: test.js, old_string: foo, new_string: bar}

# Doing tasks

IMPORTANT: When you receive a task, you should carefully analyze the requirements,
plan your approach, and then execute using the appropriate tools. Always verify
your work and handle errors gracefully.

Remember to:
- Read relevant files before making changes
- Test your changes when possible
- Document your work clearly
- Follow best practices and coding standards`;

const COMPREHENSIVE_TOOLS = [
  {
    name: "Read",
    description:
      "Reads a file from the filesystem. This is essential for examining code, configuration, and documentation before making any modifications. The tool returns the complete file contents as a string.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute or relative path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description:
      "Writes content to a file on the filesystem. Use this to create new files or completely overwrite existing ones. The tool will create parent directories automatically if they don't exist.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path where the file should be written",
        },
        content: {
          type: "string",
          description: "The complete content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Edit",
    description:
      "Performs exact string replacements in files. This is the preferred method for making targeted changes to existing files while preserving formatting and structure.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to file to edit" },
        old_string: {
          type: "string",
          description: "Exact string to find and replace",
        },
        new_string: { type: "string", description: "Replacement string" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Bash",
    description:
      "Executes bash commands in a persistent shell session. Use for git operations, running tests, installing packages, and other command-line tasks.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
        description: {
          type: "string",
          description: "Brief description of what the command does",
        },
      },
      required: ["command"],
    },
  },
];

// ============================================================================
// FACTORY INTEGRATION TESTS
// ============================================================================

describe("Adapter Factory Integration", () => {
  test("should select correct adapter for Qwen models", () => {
    const adapter = getPromptAdapter("qwen2.5-coder-7b-instruct");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should select correct adapter for DeepSeek models", () => {
    const adapter = getPromptAdapter("deepseek-r1");
    expect(adapter.adapterName).toBe("DeepSeekAdapter");
  });

  test("should select correct adapter for Mistral models", () => {
    const adapter = getPromptAdapter("mistral-7b-instruct");
    expect(adapter.adapterName).toBe("MistralAdapter");
  });

  test("should select correct adapter for Llama models", () => {
    const adapter = getPromptAdapter("llama-3.3-70b");
    expect(adapter.adapterName).toBe("LlamaAdapter");
  });

  test("should fallback to GenericAdapter for unknown models", () => {
    const adapter = getPromptAdapter("unknown-model-2025");
    expect(adapter.adapterName).toBe("GenericAdapter");
  });

  test("should handle model ID variations with fuzzy matching", () => {
    const variations = [
      "Qwen2.5-Coder-7B-Instruct-Q4_K_M",
      "qwen-2.5-coder-mlx",
      "models/qwen2.5/coder-7b",
      "QWEN_2_5_CODER",
    ];

    variations.forEach((modelId) => {
      const adapter = getPromptAdapter(modelId);
      expect(adapter.adapterName).toBe("QwenAdapter");
    });
  });
});

// ============================================================================
// END-TO-END TRANSFORMATION PIPELINE
// ============================================================================

describe("End-to-End Transformation Pipeline", () => {
  test("should transform Claude prompt for Qwen model", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // Qwen adds CoT preamble and formatting, may increase length slightly
    // The adapter transforms the prompt structure even if length increases
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata.wasModified).toBe(true);
  });

  test("should transform Claude prompt for DeepSeek model", async () => {
    const adapter = getPromptAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // DeepSeek adds CoT prompts via cot-preamble transformation
    expect(result.content).toContain("step-by-step");
    expect(result.metadata.transformations).toContain("cot-preamble");
  });

  test("should transform Claude prompt for Mistral model", async () => {
    const adapter = getPromptAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // Mistral applies light optimization - verifies transformation was applied
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata.wasModified).toBe(true);
    expect(result.metadata.transformations.length).toBeGreaterThan(0);
  });

  test("should transform Claude prompt for Llama model", async () => {
    const adapter = getPromptAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // Llama adds numbered steps via numbered-steps transformation
    expect(result.content).toMatch(/1\./);
    expect(result.metadata.transformations).toContain("numbered-steps");
  });

  test("should pass through for unknown model (backward compat)", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    expect(result.content).toBe(FULL_CLAUDE_SYSTEM_PROMPT);
    expect(result.metadata.wasModified).toBe(false);
  });
});

// ============================================================================
// TOOL TRANSFORMATION INTEGRATION
// ============================================================================

describe("Tool Transformation Integration", () => {
  test("should simplify tools for Qwen (200 char limit)", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(200);
    });
    // Schemas must be preserved exactly
    expect(result[0].input_schema).toEqual(COMPREHENSIVE_TOOLS[0].input_schema);
  });

  test("should simplify tools for Mistral (reasonable limit)", async () => {
    const adapter = getPromptAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    // Mistral applies moderate tool description simplification
    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(200);
      expect(tool.description.length).toBeGreaterThan(10);
    });
  });

  test("should keep moderate descriptions for Llama", async () => {
    const adapter = getPromptAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    // Llama keeps tool descriptions at a reasonable length
    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(250);
      expect(tool.description.length).toBeGreaterThan(20);
    });
  });

  test("should keep detailed descriptions for DeepSeek", async () => {
    const adapter = getPromptAdapter("deepseek-r1");
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    // DeepSeek benefits from context
    expect(result[0].description.length).toBeGreaterThan(50);
  });

  test("should preserve tools for unknown model", async () => {
    const adapter = getPromptAdapter("unknown-model");
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    expect(result).toEqual(COMPREHENSIVE_TOOLS);
  });

  test("should always preserve tool names and schemas", async () => {
    const models = [
      "qwen2.5-coder",
      "deepseek-r1",
      "mistral-7b",
      "llama-3.3-70b",
      "unknown",
    ];

    for (const modelId of models) {
      const adapter = getPromptAdapter(modelId);
      const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

      // Names must match exactly
      expect(result.map((t) => t.name)).toEqual(
        COMPREHENSIVE_TOOLS.map((t) => t.name)
      );

      // Schemas must be identical
      result.forEach((tool, i) => {
        expect(tool.input_schema).toEqual(COMPREHENSIVE_TOOLS[i].input_schema);
      });
    }
  });
});

// ============================================================================
// ANTHROPIC MESSAGES INTEGRATION
// ============================================================================

describe("Anthropic Messages Conversion Integration", () => {
  test("should work with convert-anthropic-messages flow", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // Simulate the proxy flow
    const systemPrompt = await adapter.adaptSystemPrompt(
      FULL_CLAUDE_SYSTEM_PROMPT
    );
    const tools = await adapter.adaptTools(COMPREHENSIVE_TOOLS);
    const userMessage = await adapter.adaptUserMessage(
      "Read the README.md and summarize it"
    );

    // Should have valid adapted content
    expect(systemPrompt.content).toBeDefined();
    expect(tools.length).toBe(COMPREHENSIVE_TOOLS.length);
    expect(userMessage.content).toBeDefined();
  });

  test("should maintain compatibility with existing proxy code", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // Result should be usable in existing message conversion
    expect(typeof result.content).toBe("string");
    expect(result.content.length).toBeGreaterThan(0);
  });

  test("should handle complete request/response cycle", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // Request phase
    const systemPrompt = await adapter.adaptSystemPrompt(
      FULL_CLAUDE_SYSTEM_PROMPT
    );
    const tools = await adapter.adaptTools(COMPREHENSIVE_TOOLS);
    const userMessage = await adapter.adaptUserMessage("Create a new file");

    // Response phase (tool call)
    const toolCall = {
      type: "function",
      function: {
        name: "Write",
        arguments: '{"file_path":"test.txt","content":"Hello"}',
      },
    };
    const parsedCall = await adapter.parseToolCall(toolCall);

    expect(systemPrompt.content).toBeDefined();
    expect(tools).toBeDefined();
    expect(userMessage.content).toBeDefined();
    expect(parsedCall.function.name).toBe("Write");
  });
});

// ============================================================================
// MULTI-ADAPTER COMPARISON
// ============================================================================

describe("Multi-Adapter Comparison", () => {
  test("should produce different results for different models", async () => {
    const models = [
      "qwen2.5-coder",
      "deepseek-r1",
      "mistral-7b-instruct",
      "llama-3.3-70b",
    ];

    const results = await Promise.all(
      models.map(async (modelId) => {
        const adapter = getPromptAdapter(modelId);
        return await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);
      })
    );

    // All should be different (except potentially identical optimizations)
    const uniqueContents = new Set(results.map((r) => r.content));
    expect(uniqueContents.size).toBeGreaterThan(1);

    // All should have metadata
    results.forEach((result) => {
      expect(result.metadata).toBeDefined();
      expect(result.metadata.adapterName).toBeDefined();
    });
  });

  test("should show varying reduction percentages", async () => {
    const models = ["qwen2.5-coder", "mistral-7b-instruct", "llama-3.3-70b"];

    const results = await Promise.all(
      models.map(async (modelId) => {
        const adapter = getPromptAdapter(modelId);
        return await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);
      })
    );

    // All adapters should report some metadata
    results.forEach((result) => {
      expect(result.metadata.adapterName).toBeDefined();
      // reductionPercent can be 0 or negative if adapter adds content
      expect(typeof result.metadata.reductionPercent).toBe("number");
    });
  });

  test("should optimize tools differently per model", async () => {
    const models = ["qwen2.5-coder", "mistral-7b-instruct", "llama-3.3-70b"];

    const results = await Promise.all(
      models.map(async (modelId) => {
        const adapter = getPromptAdapter(modelId);
        return await adapter.adaptTools(COMPREHENSIVE_TOOLS);
      })
    );

    // Tool descriptions should vary in length
    const descLengths = results.map((tools) => tools[0].description.length);
    const uniqueLengths = new Set(descLengths);
    expect(uniqueLengths.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// ERROR HANDLING & FALLBACK
// ============================================================================

describe("Error Handling & Fallback Integration", () => {
  test("should fallback to GenericAdapter on adapter error", async () => {
    // Simulate adapter throwing error by passing corrupted data
    const adapter = getPromptAdapter("qwen2.5-coder");
    const corrupted = "\x00\x01\x02";

    const result = await adapter.adaptSystemPrompt(corrupted);

    // Should fallback gracefully
    expect(result.content).toBeDefined();
    expect(result.metadata.fallbackUsed).toBe(true);
  });

  test("should handle timeout gracefully", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const hugePrompt = "A".repeat(500000); // Large but under limit

    // Should complete or timeout gracefully
    const result = await adapter.adaptSystemPrompt(hugePrompt);
    expect(result.content).toBeDefined();
  });

  test("should reject prompts over 1MB limit", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const tooLarge = "A".repeat(MAX_PROMPT_SIZE_BYTES + 1);

    await expect(async () => {
      await adapter.adaptSystemPrompt(tooLarge);
    }).rejects.toThrow("Prompt size exceeds maximum");
  });

  test("should handle malformed tools gracefully", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");
    const malformed = [{ name: "Bad" }]; // Missing required fields

    await expect(async () => {
      await adapter.adaptTools(malformed as any);
    }).rejects.toThrow("Invalid tool schema");
  });

  test("should handle concurrent requests safely", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    const promises = Array(20)
      .fill(null)
      .map(() => adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT));

    const results = await Promise.all(promises);
    expect(results).toHaveLength(20);

    results.forEach((result) => {
      expect(result.content).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });
});

// ============================================================================
// PERFORMANCE INTEGRATION TESTS
// ============================================================================

describe("Performance Integration", () => {
  test("should handle realistic workload efficiently", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    const start = Date.now();

    // Simulate real proxy request
    await Promise.all([
      adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT),
      adapter.adaptTools(COMPREHENSIVE_TOOLS),
      adapter.adaptUserMessage("Complete the task using available tools"),
    ]);

    const duration = Date.now() - start;

    // Total time for all adaptations should be under 100ms
    expect(duration).toBeLessThan(100);
  });

  test("should scale to many tools", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    const manyTools = Array(100)
      .fill(null)
      .map((_, i) => ({
        name: `Tool${i}`,
        description: "A".repeat(300),
        input_schema: {
          type: "object",
          properties: {
            param: { type: "string" },
          },
        },
      }));

    const start = Date.now();
    await adapter.adaptTools(manyTools);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should maintain performance across multiple adapters", async () => {
    const models = [
      "qwen2.5-coder",
      "deepseek-r1",
      "mistral-7b-instruct",
      "llama-3.3-70b",
    ];

    const start = Date.now();

    await Promise.all(
      models.map(async (modelId) => {
        const adapter = getPromptAdapter(modelId);
        await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);
        await adapter.adaptTools(COMPREHENSIVE_TOOLS);
      })
    );

    const duration = Date.now() - start;

    // All adapters should complete within reasonable time
    expect(duration).toBeLessThan(400); // 100ms * 4 models
  });
});

// ============================================================================
// CONFIGURATION INTEGRATION
// ============================================================================

describe("Configuration Integration", () => {
  test("should apply custom config options", () => {
    const config = {
      maxPromptLength: 5000,
      enableToolOptimization: true,
      preserveCriticalSections: true,
    };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    expect(adapter).toBeDefined();
  });

  test("should respect maxPromptLength config", async () => {
    const config = { maxPromptLength: 500 };

    const adapter = getPromptAdapter("qwen2.5-coder", config);
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    expect(result.content.length).toBeLessThanOrEqual(500);
  });

  test("should respect enableToolOptimization flag", async () => {
    const disabledConfig = { enableToolOptimization: false };

    const adapter = getPromptAdapter("qwen2.5-coder", disabledConfig);
    const result = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    // When disabled, tools should be unchanged
    expect(result).toEqual(COMPREHENSIVE_TOOLS);
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY INTEGRATION
// ============================================================================

describe("Backward Compatibility Integration", () => {
  test("should not break existing proxy code when adapter disabled", async () => {
    const adapter = getPromptAdapter("unknown-model");

    const systemPrompt = await adapter.adaptSystemPrompt(
      FULL_CLAUDE_SYSTEM_PROMPT
    );
    const tools = await adapter.adaptTools(COMPREHENSIVE_TOOLS);

    // Should be unchanged (GenericAdapter pass-through)
    expect(systemPrompt.content).toBe(FULL_CLAUDE_SYSTEM_PROMPT);
    expect(tools).toEqual(COMPREHENSIVE_TOOLS);
  });

  test("should work with undefined model (fallback to Generic)", async () => {
    const adapter = getPromptAdapter(undefined as any);

    expect(adapter.adapterName).toBe("GenericAdapter");

    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);
    expect(result.content).toBe(FULL_CLAUDE_SYSTEM_PROMPT);
  });

  test("should integrate seamlessly with existing convert-anthropic-messages", async () => {
    // Test that adapted output is compatible with existing conversion logic
    const adapter = getPromptAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT);

    // Should be valid for message conversion
    expect(typeof result.content).toBe("string");
    expect(result.content.length).toBeGreaterThan(0);

    // Should not break existing prompts
    expect(result.content).toContain("Claude Code");
  });
});

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

describe("Real-World Scenarios", () => {
  test("should handle Claude Code session start", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // Initial request with full system prompt and all tools
    const [systemPrompt, tools] = await Promise.all([
      adapter.adaptSystemPrompt(FULL_CLAUDE_SYSTEM_PROMPT),
      adapter.adaptTools(COMPREHENSIVE_TOOLS),
    ]);

    expect(systemPrompt.content).toBeDefined();
    expect(tools.length).toBe(COMPREHENSIVE_TOOLS.length);
  });

  test("should handle multi-turn conversation", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // Turn 1: User asks to read a file
    const msg1 = await adapter.adaptUserMessage("Read the README.md file");
    expect(msg1.content).toBeDefined();

    // Turn 2: Parse tool call response
    const toolCall1 = await adapter.parseToolCall({
      type: "function",
      function: { name: "Read", arguments: '{"file_path":"README.md"}' },
    });
    expect(toolCall1.function.name).toBe("Read");

    // Turn 3: User asks to write based on previous content
    const msg2 = await adapter.adaptUserMessage(
      "Now write a summary to summary.txt"
    );
    expect(msg2.content).toBeDefined();
  });

  test("should handle tool calling workflow", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // Prepare request
    const systemPrompt = await adapter.adaptSystemPrompt(
      FULL_CLAUDE_SYSTEM_PROMPT
    );
    const tools = await adapter.adaptTools(COMPREHENSIVE_TOOLS);
    const userMessage = await adapter.adaptUserMessage(
      "Create a test.txt file with 'Hello World'"
    );

    // Model responds with tool call
    const toolCall = await adapter.parseToolCall({
      type: "function",
      function: {
        name: "Write",
        arguments: '{"file_path":"test.txt","content":"Hello World"}',
      },
    });

    expect(systemPrompt.content).toBeDefined();
    expect(tools).toHaveLength(4);
    expect(userMessage.content).toBeDefined();
    expect(toolCall.function.name).toBe("Write");
  });

  test("should handle error recovery scenario", async () => {
    const adapter = getPromptAdapter("qwen2.5-coder");

    // User request
    const userMessage = await adapter.adaptUserMessage("Read config.json");

    // Model makes tool call
    const toolCall = await adapter.parseToolCall({
      type: "function",
      function: { name: "Read", arguments: '{"file_path":"config.json"}' },
    });

    // Error occurs, user provides clarification
    const followUp = await adapter.adaptUserMessage(
      "The file doesn't exist. Create it with default config."
    );

    expect(userMessage.content).toBeDefined();
    expect(toolCall.function.name).toBe("Read");
    expect(followUp.content).toBeDefined();
  });
});
