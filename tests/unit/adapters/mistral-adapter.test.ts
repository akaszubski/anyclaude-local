/**
 * Unit tests for Mistral model adapter
 *
 * Tests Mistral-specific prompt transformations for conciseness and efficiency.
 *
 * Mistral Model Characteristics:
 * - Prefers concise, direct instructions
 * - Strong at following structured formats
 * - Benefits from clear, minimal prompts
 * - Excellent instruction following
 * - Efficient with token usage
 *
 * Mistral-Specific Transformations:
 * 1. Remove verbose explanations and redundancy
 * 2. Convert to direct, imperative commands
 * 3. Simplify tool descriptions (max 100 chars)
 * 4. Remove examples unless critical
 * 5. Flatten nested structures
 * 6. Preserve tool schemas exactly
 * 7. Use bullet points for clarity
 * 8. Add Mistral-specific format hint ([INST] compatible)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { MistralAdapter } from "../../../src/adapters/mistral-adapter";
import { AdaptedPrompt } from "../../../src/prompt-adapter";

// ============================================================================
// TEST DATA
// ============================================================================

const VERBOSE_SYSTEM_PROMPT = `You are Claude Code, which is Anthropic's official CLI application for Claude.

This system provides comprehensive assistance for software development tasks.
When you receive a request, you should carefully analyze what is being asked
and then use the appropriate tools to complete the task. It's important to
follow best practices and ensure quality in your work.

# Tool usage policy

When making function calls using tools, you need to make sure that any parameters
which are arrays or objects are properly formatted using JSON notation. This is
very important for the system to work correctly.

# Doing tasks

IMPORTANT: You should follow all instructions carefully and make sure to use
the provided tools in the correct manner to accomplish what is requested.`;

const CONCISE_SYSTEM_PROMPT = `You are Claude Code.

# Tool usage
Use JSON for array/object parameters.

# Tasks
Follow instructions. Use tools correctly.`;

const VERBOSE_TOOLS = [
  {
    name: "Read",
    description:
      "This tool allows you to read the contents of a file from the filesystem. It's particularly useful when you need to examine existing code or configuration before making changes.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The path to the file" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description:
      "This tool enables you to write content to a file on the filesystem. You can use it to create new files or overwrite existing ones with updated content.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The file path" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["file_path", "content"],
    },
  },
];

// ============================================================================
// CONSTRUCTOR & BASIC TESTS
// ============================================================================

describe("MistralAdapter - Construction", () => {
  test("should create adapter with modelId", () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    expect(adapter.modelId).toBe("mistral-7b-instruct");
  });

  test("should set adapterName to 'MistralAdapter'", () => {
    const adapter = new MistralAdapter("mistral-7b");
    expect(adapter.adapterName).toBe("MistralAdapter");
  });

  test("should handle Mixtral models", () => {
    const adapter = new MistralAdapter("mixtral-8x7b");
    expect(adapter.modelId).toContain("mixtral");
  });

  test("should handle Mistral Large models", () => {
    const adapter = new MistralAdapter("mistral-large-2407");
    expect(adapter.modelId).toContain("mistral");
  });
});

// ============================================================================
// SYSTEM PROMPT ADAPTATION - CONCISENESS
// ============================================================================

describe("MistralAdapter - adaptSystemPrompt() Conciseness", () => {
  test("should remove verbose explanations", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).not.toContain("carefully analyze");
    expect(result.content).not.toContain("It's important");
    expect(result.content).not.toContain("very important");
  });

  test("should convert to direct imperative commands", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toMatch(/Use|Follow|Complete/);
  });

  test("should significantly reduce prompt length", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content.length).toBeLessThan(
      VERBOSE_SYSTEM_PROMPT.length * 0.6
    );
  });

  test("should preserve critical sections", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain("Tool usage");
    expect(result.content).toContain("Tasks");
  });

  test("should use bullet points for clarity", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain("-");
  });

  test("should remove redundant phrases", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const redundantPrompt = `You should use tools to complete tasks.
It's important to use tools correctly.
Make sure you use the right tools.`;
    const result = await adapter.adaptSystemPrompt(redundantPrompt);

    const useToolsCount = (result.content.match(/use tools/gi) || []).length;
    expect(useToolsCount).toBeLessThan(3);
  });

  test("should flatten nested structures", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const nestedPrompt = `Main task:
  - Subtask 1:
    - Step A
    - Step B
  - Subtask 2`;
    const result = await adapter.adaptSystemPrompt(nestedPrompt);

    expect(result.content).not.toContain("  -"); // No double indents
  });

  test("should add Mistral format hint", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain("Use [INST] format");
  });

  test("should keep already concise prompts unchanged", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(CONCISE_SYSTEM_PROMPT);

    expect(result.content).toBe(CONCISE_SYSTEM_PROMPT);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should track transformations in metadata", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toContain("removed_verbosity");
    expect(result.metadata.transformations).toContain("imperative_commands");
  });

  test("should handle empty prompt", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });
});

// ============================================================================
// TOOL ADAPTATION TESTS
// ============================================================================

describe("MistralAdapter - adaptTools()", () => {
  test("should simplify tool descriptions to max 100 chars", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(100);
    });
  });

  test("should keep first sentence of description", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].description).toContain("read");
    expect(result[1].description).toContain("write");
  });

  test("should preserve tool names exactly", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].name).toBe("Read");
    expect(result[1].name).toBe("Write");
  });

  test("should preserve input schemas exactly", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].input_schema).toEqual(VERBOSE_TOOLS[0].input_schema);
    expect(result[1].input_schema).toEqual(VERBOSE_TOOLS[1].input_schema);
  });

  test("should handle short descriptions unchanged", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const shortTools = [
      {
        name: "Test",
        description: "Short description",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const result = await adapter.adaptTools(shortTools);
    expect(result[0].description).toBe("Short description");
  });

  test("should handle empty tools array", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });

  test("should remove filler words from descriptions", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    result.forEach((tool) => {
      expect(tool.description).not.toContain("particularly");
      expect(tool.description).not.toContain("enables you to");
    });
  });
});

// ============================================================================
// USER MESSAGE ADAPTATION TESTS
// ============================================================================

describe("MistralAdapter - adaptUserMessage()", () => {
  test("should keep user messages unchanged", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const message = "Read the README.md file and summarize it.";
    const result = await adapter.adaptUserMessage(message);

    expect(result.content).toBe(message);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should preserve code blocks", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const codeMessage = "Fix:\n```python\ndef test():\n  pass\n```";
    const result = await adapter.adaptUserMessage(codeMessage);

    expect(result.content).toContain("```python");
  });

  test("should handle empty message", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptUserMessage("");

    expect(result.content).toBe("");
  });

  test("should handle very long messages", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const longMessage = "A".repeat(5000);
    const result = await adapter.adaptUserMessage(longMessage);

    expect(result.content).toBe(longMessage);
  });
});

// ============================================================================
// TOOL CALL PARSING TESTS
// ============================================================================

describe("MistralAdapter - parseToolCall()", () => {
  test("should parse standard OpenAI format", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
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

  test("should parse Mistral-specific format", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const mistralCall = {
      type: "tool_use",
      name: "Read",
      input: { file_path: "test.txt" },
    };

    const result = await adapter.parseToolCall(mistralCall);
    expect(result.type).toBe("function");
    expect(result.function.name).toBe("Read");
    expect(result.function.arguments).toContain("file_path");
  });

  test("should handle [INST] formatted responses", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const instCall = {
      type: "text",
      content:
        '[TOOL_CALL]{"name":"Read","arguments":{"file_path":"test.txt"}}',
    };

    const result = await adapter.parseToolCall(instCall);
    expect(result.function.name).toBe("Read");
  });

  test("should handle arguments as object", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
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
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const toolCall = {
      id: "call_abc",
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"test.txt"}',
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result.id).toBe("call_abc");
  });

  test("should handle malformed JSON gracefully", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const badCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: "{invalid}",
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

describe("MistralAdapter - Edge Cases", () => {
  test("should handle prompts with multiple languages", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const multiLangPrompt = "You are an assistant. Vous êtes un assistant.";
    const result = await adapter.adaptSystemPrompt(multiLangPrompt);

    expect(result.content).toBeDefined();
  });

  test("should handle prompts with special characters", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const specialPrompt = "Use <tool> and {json} with @params.";
    const result = await adapter.adaptSystemPrompt(specialPrompt);

    expect(result.content).toContain("<tool>");
    expect(result.content).toContain("{json}");
  });

  test("should handle prompts with markdown tables", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const tablePrompt = "| Tool | Desc |\n|------|------|\n| Read | File |";
    const result = await adapter.adaptSystemPrompt(tablePrompt);

    expect(result.content).toContain("|");
  });

  test("should handle code-heavy prompts", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const codePrompt =
      "Example:\n```js\nconst x = 1;\nconsole.log(x);\n```\nUse this pattern.";
    const result = await adapter.adaptSystemPrompt(codePrompt);

    expect(result.content).toContain("```js");
  });

  test("should handle concurrent adaptations", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const promises = [
      adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT),
      adapter.adaptTools(VERBOSE_TOOLS),
      adapter.adaptUserMessage("Test"),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
  });

  test("should handle very long single line", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const longLine = "This is a very long line. ".repeat(200);
    const result = await adapter.adaptSystemPrompt(longLine);

    expect(result.content.length).toBeLessThan(longLine.length);
  });

  test("should handle prompt with only whitespace", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const whitespace = "   \n\n\t\t   ";
    const result = await adapter.adaptSystemPrompt(whitespace);

    expect(result.content.trim()).toBe("");
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("MistralAdapter - Performance", () => {
  test("should complete within 100ms timeout", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const start = Date.now();
    await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle large prompts efficiently", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const largePrompt = VERBOSE_SYSTEM_PROMPT.repeat(50);
    const start = Date.now();
    await adapter.adaptSystemPrompt(largePrompt);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle many tools efficiently", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const manyTools = Array(100)
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

describe("MistralAdapter - Metadata", () => {
  test("should include Mistral-specific optimizations", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toContain("mistral_conciseness");
    expect(result.metadata.modelOptimizations).toContain("mistral_imperative");
  });

  test("should track reduction percentage", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.reductionPercent).toBeGreaterThan(0);
    expect(result.metadata.reductionPercent).toBeLessThan(100);
  });

  test("should track original and adapted lengths", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(VERBOSE_SYSTEM_PROMPT.length);
    expect(result.metadata.adaptedLength).toBe(result.content.length);
  });

  test("should mark as modified when changes made", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(true);
  });

  test("should track transformation timestamp", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// COMPARISON TESTS - Mistral vs Others
// ============================================================================

describe("MistralAdapter - Comparison", () => {
  test("should reduce more aggressively than Qwen adapter", async () => {
    const mistralAdapter = new MistralAdapter("mistral-7b-instruct");
    const mistralResult = await mistralAdapter.adaptSystemPrompt(
      VERBOSE_SYSTEM_PROMPT
    );

    // Mistral prioritizes conciseness over detail
    expect(mistralResult.metadata.reductionPercent).toBeGreaterThan(30);
  });

  test("should be more concise than DeepSeek adapter", async () => {
    const mistralAdapter = new MistralAdapter("mistral-7b-instruct");
    const mistralResult = await mistralAdapter.adaptSystemPrompt(
      VERBOSE_SYSTEM_PROMPT
    );

    // DeepSeek adds reasoning, Mistral removes verbosity
    expect(mistralResult.content.length).toBeLessThan(
      VERBOSE_SYSTEM_PROMPT.length * 0.7
    );
  });

  test("should simplify tool descriptions more than others", async () => {
    const adapter = new MistralAdapter("mistral-7b-instruct");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    // Mistral: max 100 chars, vs Qwen: 200 chars
    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(100);
    });
  });
});
