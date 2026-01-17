/**
 * Unit tests for Llama model adapter
 *
 * Tests Llama-specific prompt transformations for instruction following.
 *
 * Llama Model Characteristics:
 * - Strong instruction following (Instruct variants)
 * - Prefers flat, sequential instructions
 * - Benefits from clear task structure
 * - Good with explicit examples
 * - Native support for [INST] format
 *
 * Llama-Specific Transformations:
 * 1. Flatten nested structures into linear flow
 * 2. Convert complex instructions to step-by-step format
 * 3. Add clear task boundaries
 * 4. Simplify tool descriptions (moderate, ~150 chars)
 * 5. Preserve tool schemas exactly
 * 6. Add Llama-specific format hints ([INST][/INST])
 * 7. Keep examples when helpful
 * 8. Remove meta-commentary and hedging language
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { LlamaAdapter } from "../../../src/adapters/llama-adapter";
import { AdaptedPrompt } from "../../../src/prompt-adapter";

// ============================================================================
// TEST DATA
// ============================================================================

const NESTED_SYSTEM_PROMPT = `You are Claude Code.

# Tool Usage
When using tools:
  - Check parameters carefully
    - Ensure types are correct
    - Validate required fields
  - Format as JSON
    - Use proper escaping
    - Maintain structure

# Task Execution
To complete tasks:
  1. Understand the request
     a. Read carefully
     b. Identify key requirements
  2. Plan your approach
  3. Execute using tools`;

const FLAT_SYSTEM_PROMPT = `You are Claude Code.

# Tool Usage
1. Check parameter types
2. Validate required fields
3. Format as JSON

# Task Execution
1. Understand request
2. Plan approach
3. Execute with tools`;

const VERBOSE_TOOLS = [
  {
    name: "Read",
    description:
      "This tool reads file contents from the filesystem, which is useful for examining code before modifications.",
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

describe("LlamaAdapter - Construction", () => {
  test("should create adapter with modelId", () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    expect(adapter.modelId).toBe("llama-3.3-70b");
  });

  test("should set adapterName to 'LlamaAdapter'", () => {
    const adapter = new LlamaAdapter("llama-3.1-8b");
    expect(adapter.adapterName).toBe("LlamaAdapter");
  });

  test("should handle Meta-Llama prefix", () => {
    const adapter = new LlamaAdapter("Meta-Llama-3.1-8B-Instruct");
    expect(adapter.modelId).toContain("Llama");
  });

  test("should handle Llama 3.3 models", () => {
    const adapter = new LlamaAdapter("llama-3.3-70b-instruct");
    expect(adapter.modelId).toContain("llama-3.3");
  });
});

// ============================================================================
// SYSTEM PROMPT ADAPTATION - FLATTENING
// ============================================================================

describe("LlamaAdapter - adaptSystemPrompt() Flattening", () => {
  test("should flatten nested bullet points", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).not.toContain("  -"); // No nested indents
    expect(result.content).not.toContain("    -"); // No double nested
  });

  test("should convert nested lists to numbered steps", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).toMatch(/1\./);
    expect(result.content).toMatch(/2\./);
    expect(result.content).toMatch(/3\./);
  });

  test("should remove sub-lettering (a, b, c)", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).not.toContain("a.");
    expect(result.content).not.toContain("b.");
  });

  test("should preserve critical sections", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).toContain("Tool Usage");
    expect(result.content).toContain("Task Execution");
  });

  test("should add Llama [INST] format hint", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).toContain("[INST]");
  });

  test("should add clear task boundaries", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.content).toMatch(/^#|^---/m); // Section dividers
  });

  test("should remove hedging language", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const hedgingPrompt = `You might want to consider using tools.
It's generally a good idea to validate inputs.
You should probably check the results.`;
    const result = await adapter.adaptSystemPrompt(hedgingPrompt);

    expect(result.content).not.toContain("might want to");
    expect(result.content).not.toContain("generally a good idea");
    expect(result.content).not.toContain("probably");
  });

  test("should keep already flat prompts unchanged", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(FLAT_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(false);
  });

  test("should track transformations in metadata", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toContain("flattened_structure");
    expect(result.metadata.transformations).toContain("numbered_steps");
  });

  test("should handle empty prompt", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });
});

// ============================================================================
// TOOL ADAPTATION TESTS
// ============================================================================

describe("LlamaAdapter - adaptTools()", () => {
  test("should simplify descriptions to ~150 chars", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(150);
    });
  });

  test("should preserve tool names exactly", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].name).toBe("Read");
  });

  test("should preserve input schemas exactly", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].input_schema).toEqual(VERBOSE_TOOLS[0].input_schema);
  });

  test("should keep helpful context in descriptions", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].description).toContain("read");
    expect(result[0].description.length).toBeGreaterThan(20);
  });

  test("should handle short descriptions unchanged", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const shortTools = [
      {
        name: "Test",
        description: "Test tool",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const result = await adapter.adaptTools(shortTools);
    expect(result[0].description).toBe("Test tool");
  });

  test("should handle empty tools array", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });
});

// ============================================================================
// USER MESSAGE ADAPTATION TESTS
// ============================================================================

describe("LlamaAdapter - adaptUserMessage()", () => {
  test("should keep user messages unchanged", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const message = "Read the README.md file.";
    const result = await adapter.adaptUserMessage(message);

    expect(result.content).toBe(message);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should preserve code blocks", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const codeMessage = "Fix:\n```python\ndef test():\n  pass\n```";
    const result = await adapter.adaptUserMessage(codeMessage);

    expect(result.content).toContain("```python");
  });

  test("should handle empty message", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptUserMessage("");

    expect(result.content).toBe("");
  });
});

// ============================================================================
// TOOL CALL PARSING TESTS
// ============================================================================

describe("LlamaAdapter - parseToolCall()", () => {
  test("should parse standard OpenAI format", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
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

  test("should parse Llama [INST] format", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const llamaCall = {
      type: "text",
      content:
        '[INST]{"function":"Read","arguments":{"file_path":"test.txt"}}[/INST]',
    };

    const result = await adapter.parseToolCall(llamaCall);
    expect(result.function.name).toBe("Read");
    expect(result.function.arguments).toContain("file_path");
  });

  test("should parse Llama function tag format", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const llamaCall = {
      type: "function_call",
      name: "Read",
      parameters: { file_path: "test.txt" },
    };

    const result = await adapter.parseToolCall(llamaCall);
    expect(result.type).toBe("function");
    expect(result.function.name).toBe("Read");
  });

  test("should handle arguments as object", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
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
    const adapter = new LlamaAdapter("llama-3.3-70b");
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
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const badCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: "{bad}",
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

describe("LlamaAdapter - Edge Cases", () => {
  test("should handle very deeply nested structures", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const deepNested = `Level 1
  Level 2
    Level 3
      Level 4
        Level 5`;
    const result = await adapter.adaptSystemPrompt(deepNested);

    expect(result.content).not.toContain("      "); // No deep indents
  });

  test("should handle mixed bullet and number formats", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const mixedPrompt = `1. First step
- Bullet point
2. Second step
  - Nested bullet`;
    const result = await adapter.adaptSystemPrompt(mixedPrompt);

    expect(result.content).toMatch(/1\./);
    expect(result.content).toMatch(/2\./);
  });

  test("should handle code blocks in prompt", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const codePrompt = "Example:\n```python\ndef test():\n    pass\n```";
    const result = await adapter.adaptSystemPrompt(codePrompt);

    expect(result.content).toContain("```python");
  });

  test("should handle markdown tables", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const tablePrompt = "| Col1 | Col2 |\n|------|------|\n| A | B |";
    const result = await adapter.adaptSystemPrompt(tablePrompt);

    expect(result.content).toContain("|");
  });

  test("should handle concurrent adaptations", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const promises = [
      adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT),
      adapter.adaptTools(VERBOSE_TOOLS),
      adapter.adaptUserMessage("Test"),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
  });

  test("should handle special characters", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const specialPrompt = "Use <tool> with {json} @params.";
    const result = await adapter.adaptSystemPrompt(specialPrompt);

    expect(result.content).toContain("<tool>");
  });

  test("should handle whitespace-only prompt", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const whitespace = "   \n\n\t   ";
    const result = await adapter.adaptSystemPrompt(whitespace);

    expect(result.content.trim()).toBe("");
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("LlamaAdapter - Performance", () => {
  test("should complete within 100ms timeout", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const start = Date.now();
    await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle large prompts efficiently", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const largePrompt = NESTED_SYSTEM_PROMPT.repeat(50);
    const start = Date.now();
    await adapter.adaptSystemPrompt(largePrompt);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle many tools efficiently", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const manyTools = Array(50)
      .fill(null)
      .map((_, i) => ({
        name: `Tool${i}`,
        description: "A".repeat(200),
        input_schema: { type: "object", properties: {} },
      }));

    const start = Date.now();
    await adapter.adaptTools(manyTools);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});

// ============================================================================
// METADATA TESTS
// ============================================================================

describe("LlamaAdapter - Metadata", () => {
  test("should include Llama-specific optimizations", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toContain("llama_flattening");
    expect(result.metadata.modelOptimizations).toContain(
      "llama_sequential_steps"
    );
  });

  test("should track original and adapted lengths", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(NESTED_SYSTEM_PROMPT.length);
    expect(result.metadata.adaptedLength).toBe(result.content.length);
  });

  test("should mark as modified when changes made", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(true);
  });

  test("should track transformation timestamp", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });

  test("should calculate reduction percentage", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    expect(result.metadata.reductionPercent).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// COMPARISON TESTS - Llama vs Others
// ============================================================================

describe("LlamaAdapter - Comparison", () => {
  test("should keep moderate description length (vs Mistral 100, Qwen 200)", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    // Llama: ~150 chars (balanced between Mistral and Qwen)
    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(150);
      expect(tool.description.length).toBeGreaterThan(50);
    });
  });

  test("should focus on structure (vs Mistral conciseness)", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    // Should convert to numbered steps (structure)
    expect(result.content).toMatch(/1\./);
    expect(result.content).toMatch(/2\./);
  });

  test("should not add reasoning prompts (vs DeepSeek)", async () => {
    const adapter = new LlamaAdapter("llama-3.3-70b");
    const result = await adapter.adaptSystemPrompt(NESTED_SYSTEM_PROMPT);

    // Llama doesn't need explicit CoT prompts like DeepSeek
    expect(result.content).not.toContain("Think step-by-step");
  });
});
