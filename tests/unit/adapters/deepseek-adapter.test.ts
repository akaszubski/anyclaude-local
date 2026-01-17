/**
 * Unit tests for DeepSeek model adapter
 *
 * Tests DeepSeek-specific prompt transformations and chain-of-thought optimizations.
 *
 * DeepSeek Model Characteristics:
 * - Strong reasoning capabilities (R1 model with CoT)
 * - Benefits from explicit reasoning prompts
 * - Prefers step-by-step instructions
 * - Excellent at breaking down complex tasks
 * - Supports thinking/reasoning blocks
 *
 * DeepSeek-Specific Transformations:
 * 1. Add explicit "think step-by-step" prompts
 * 2. Convert instructions into numbered steps
 * 3. Add reasoning section headers
 * 4. Preserve tool schemas (critical for function calling)
 * 5. Encourage detailed planning before execution
 * 6. Add DeepSeek-specific CoT hint
 * 7. Structure prompts for reasoning flow
 * 8. Keep tool descriptions detailed (DeepSeek benefits from context)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { DeepSeekAdapter } from "../../../src/adapters/deepseek-adapter";
import { AdaptedPrompt } from "../../../src/prompt-adapter";

// ============================================================================
// TEST DATA
// ============================================================================

const BASIC_SYSTEM_PROMPT = `You are Claude Code.

# Tool usage policy

Use JSON for array/object parameters.

# Doing tasks

Follow instructions carefully and use tools correctly.`;

const COMPLEX_TASK_PROMPT = `You are Claude Code.

When given a task:
- Read the relevant files
- Analyze the code
- Make necessary changes
- Test the changes
- Document your work

Use the provided tools to complete tasks.`;

const SIMPLE_TOOLS = [
  {
    name: "Read",
    description: "Reads a file",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
      },
      required: ["file_path"],
    },
  },
];

// ============================================================================
// CONSTRUCTOR & BASIC TESTS
// ============================================================================

describe("DeepSeekAdapter - Construction", () => {
  test("should create adapter with modelId", () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    expect(adapter.modelId).toBe("deepseek-r1");
  });

  test("should set adapterName to 'DeepSeekAdapter'", () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    expect(adapter.adapterName).toBe("DeepSeekAdapter");
  });

  test("should handle DeepSeek V3 models", () => {
    const adapter = new DeepSeekAdapter("deepseek-v3");
    expect(adapter.modelId).toContain("deepseek");
  });

  test("should handle DeepSeek Coder models", () => {
    const adapter = new DeepSeekAdapter("deepseek-coder-33b");
    expect(adapter.modelId).toContain("deepseek");
  });
});

// ============================================================================
// SYSTEM PROMPT ADAPTATION - CHAIN-OF-THOUGHT
// ============================================================================

describe("DeepSeekAdapter - adaptSystemPrompt() CoT", () => {
  test("should add explicit step-by-step reasoning prompt", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.content).toContain("Think step-by-step");
  });

  test("should convert bullet points to numbered steps", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(COMPLEX_TASK_PROMPT);

    expect(result.content).toMatch(/1\./);
    expect(result.content).toMatch(/2\./);
    expect(result.content).toMatch(/3\./);
  });

  test("should add reasoning section header", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.content).toContain("# Reasoning");
  });

  test("should add planning encouragement", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.content).toContain("plan your approach");
  });

  test("should add DeepSeek-specific CoT hint", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.content).toContain("Use <think> tags for reasoning");
  });

  test("should preserve critical sections", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.content).toContain("Tool usage policy");
    expect(result.content).toContain("Doing tasks");
  });

  test("should structure for reasoning flow", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(COMPLEX_TASK_PROMPT);

    // Should have: Problem → Planning → Execution → Verification
    expect(result.content).toMatch(/Plan|Planning/i);
    expect(result.content).toMatch(/Execute|Execution/i);
  });

  test("should track CoT transformations in metadata", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toContain("added_cot_prompts");
    expect(result.metadata.transformations).toContain("numbered_steps");
  });

  test("should handle empty prompt", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should not double-add reasoning sections", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const alreadyHasReasoning = `# Reasoning\nThink step-by-step.`;
    const result = await adapter.adaptSystemPrompt(alreadyHasReasoning);

    const matches = result.content.match(/# Reasoning/g);
    expect(matches).toHaveLength(1);
  });
});

// ============================================================================
// TOOL ADAPTATION TESTS
// ============================================================================

describe("DeepSeekAdapter - adaptTools()", () => {
  test("should keep tool descriptions detailed", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const verboseTools = [
      {
        name: "Read",
        description:
          "This tool reads a file from the filesystem. It's very useful when you need to examine contents before making changes.",
        input_schema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
          },
          required: ["file_path"],
        },
      },
    ];

    const result = await adapter.adaptTools(verboseTools);

    // DeepSeek benefits from detailed descriptions
    expect(result[0].description.length).toBeGreaterThan(50);
    expect(result[0].description).toContain("useful");
  });

  test("should preserve tool schemas exactly", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptTools(SIMPLE_TOOLS);

    expect(result[0].input_schema).toEqual(SIMPLE_TOOLS[0].input_schema);
  });

  test("should preserve tool names exactly", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptTools(SIMPLE_TOOLS);

    expect(result[0].name).toBe("Read");
  });

  test("should add reasoning hints to tool descriptions", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptTools(SIMPLE_TOOLS);

    expect(result[0].description).toContain("Use when");
  });

  test("should handle empty tools array", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });

  test("should handle tools with minimal descriptions", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const minimalTools = [
      {
        name: "Test",
        description: "Test",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const result = await adapter.adaptTools(minimalTools);
    expect(result[0].description.length).toBeGreaterThan(4);
  });
});

// ============================================================================
// USER MESSAGE ADAPTATION TESTS
// ============================================================================

describe("DeepSeekAdapter - adaptUserMessage()", () => {
  test("should add reasoning prompt to complex tasks", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const complexTask =
      "Analyze the codebase, identify issues, and suggest improvements.";
    const result = await adapter.adaptUserMessage(complexTask);

    expect(result.content).toContain("Think carefully");
  });

  test("should keep simple tasks unchanged", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const simpleTask = "Read README.md";
    const result = await adapter.adaptUserMessage(simpleTask);

    expect(result.content).toBe(simpleTask);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should detect complex tasks requiring reasoning", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const complexTask =
      "Refactor the authentication system to improve security.";
    const result = await adapter.adaptUserMessage(complexTask);

    expect(result.metadata.wasModified).toBe(true);
  });

  test("should preserve code blocks in user message", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const codeMessage = "Fix this:\n```python\ndef broken():\n  pass\n```";
    const result = await adapter.adaptUserMessage(codeMessage);

    expect(result.content).toContain("```python");
  });

  test("should handle empty user message", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptUserMessage("");

    expect(result.content).toBe("");
  });
});

// ============================================================================
// TOOL CALL PARSING TESTS
// ============================================================================

describe("DeepSeekAdapter - parseToolCall()", () => {
  test("should parse standard OpenAI format", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const toolCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result).toEqual(toolCall);
  });

  test("should parse DeepSeek thinking blocks", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const deepseekCall = {
      type: "function",
      thinking: "I need to read the file first to understand the context.",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(deepseekCall);
    expect(result.function.name).toBe("Read");
    expect(result.thinking).toBeDefined();
  });

  test("should extract reasoning from response text", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const responseWithReasoning = {
      type: "function",
      response:
        "<think>I should read the file first</think>\n<function>Read</function>",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(responseWithReasoning);
    expect(result.reasoning).toContain("read the file first");
  });

  test("should handle arguments as object", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const toolCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: { file_path: "test.txt" },
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result.function.arguments).toBe('{"file_path":"test.txt"}');
  });

  test("should preserve tool call ID", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const toolCall = {
      id: "call_123",
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result.id).toBe("call_123");
  });

  test("should handle malformed JSON gracefully", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const badCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: "{bad json}",
      },
    };

    await expect(async () => {
      await adapter.parseToolCall(badCall);
    }).rejects.toThrow("Invalid JSON");
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("DeepSeekAdapter - Edge Cases", () => {
  test("should handle very long prompts", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const longPrompt = BASIC_SYSTEM_PROMPT.repeat(100);
    const result = await adapter.adaptSystemPrompt(longPrompt);

    expect(result.content).toBeDefined();
  });

  test("should handle prompts with multiple sections", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const multiSection = `# Section 1\nContent 1\n\n# Section 2\nContent 2\n\n# Section 3\nContent 3`;
    const result = await adapter.adaptSystemPrompt(multiSection);

    expect(result.content).toContain("# Section 1");
    expect(result.content).toContain("# Section 2");
    expect(result.content).toContain("# Section 3");
  });

  test("should handle code-heavy prompts", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const codePrompt = `Example:\n\`\`\`python\ndef example():\n    pass\n\`\`\``;
    const result = await adapter.adaptSystemPrompt(codePrompt);

    expect(result.content).toContain("```python");
  });

  test("should handle concurrent adaptations", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const promises = [
      adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT),
      adapter.adaptTools(SIMPLE_TOOLS),
      adapter.adaptUserMessage("Test"),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
  });

  test("should handle Chinese characters", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const chinesePrompt = "你是一个AI助手。逐步思考。";
    const result = await adapter.adaptSystemPrompt(chinesePrompt);

    expect(result.content).toContain("逐步思考");
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("DeepSeekAdapter - Performance", () => {
  test("should complete within 100ms timeout", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const start = Date.now();
    await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle large prompts efficiently", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const largePrompt = BASIC_SYSTEM_PROMPT.repeat(50);
    const start = Date.now();
    await adapter.adaptSystemPrompt(largePrompt);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});

// ============================================================================
// METADATA TESTS
// ============================================================================

describe("DeepSeekAdapter - Metadata", () => {
  test("should include DeepSeek-specific optimizations", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toContain("deepseek_cot");
    expect(result.metadata.modelOptimizations).toContain("deepseek_reasoning");
  });

  test("should track original and adapted lengths", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(BASIC_SYSTEM_PROMPT.length);
    expect(result.metadata.adaptedLength).toBe(result.content.length);
  });

  test("should mark as modified when changes made", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(true);
  });

  test("should track transformation timestamp", async () => {
    const adapter = new DeepSeekAdapter("deepseek-r1");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(BASIC_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });
});
