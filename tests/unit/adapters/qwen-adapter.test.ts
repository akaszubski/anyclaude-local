/**
 * Unit tests for Qwen model adapter
 *
 * Tests Qwen-specific prompt transformations and optimizations.
 *
 * Qwen Model Characteristics:
 * - Strong tool calling support (native OpenAI function format)
 * - Benefits from concise, structured prompts
 * - Prefers bullet points over verbose paragraphs
 * - Good with code-heavy instructions
 * - Supports Chinese and English equally well
 *
 * Qwen-Specific Transformations:
 * 1. Convert verbose paragraphs to bullet points
 * 2. Simplify tool descriptions (keep first 200 chars)
 * 3. Remove redundant examples (keep only 1-2 critical ones)
 * 4. Flatten nested instructions into linear flow
 * 5. Preserve tool schemas exactly (critical for function calling)
 * 6. Add Qwen-specific tool calling hint
 * 7. Optimize for code-heavy prompts (preserve code blocks)
 * 8. Remove verbose explanations, keep actionable instructions
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { QwenAdapter } from "../../../src/adapters/qwen-adapter";
import { AdaptedPrompt } from "../../../src/prompt-adapter";

// ============================================================================
// TEST DATA
// ============================================================================

const VERBOSE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

This is a comprehensive system that helps developers write code more efficiently.
It provides a wide range of tools and capabilities that can be used to accomplish
various tasks. The system is designed to be flexible and powerful, allowing you
to work with files, execute commands, and more.

# Tool usage policy

When making function calls using tools that accept array or object parameters,
it is very important that you ensure those parameters are properly structured
using JSON format. This is critical for the tools to work correctly. For example,
if you have a tool that accepts an array, you should format it like this:
[{"key": "value"}] rather than just passing it as a plain string.

# Doing tasks

IMPORTANT: When you are given a task, you should follow the instructions very
carefully and make sure to use the provided tools in the correct way. This means
reading the tool descriptions thoroughly and understanding what each parameter does.`;

const CONCISE_SYSTEM_PROMPT = `You are Claude Code.

# Tool usage

Use JSON for array/object parameters.

# Tasks

Follow instructions carefully and use tools correctly.`;

const VERBOSE_TOOLS = [
  {
    name: "Read",
    description:
      "This tool reads a file from the filesystem. It's very useful when you need to examine the contents of a file before making changes. You can use it to read configuration files, source code, documentation, and any other text-based files. The tool will return the entire contents of the file as a string.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "The absolute or relative path to the file you want to read. Make sure the path is correct and the file exists.",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description:
      "This tool writes content to a file on the filesystem. It's essential for creating new files or overwriting existing ones with updated content. You should use this tool whenever you need to save generated code, configuration, or any other text data to disk. The tool will create parent directories if they don't exist.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "The absolute or relative path where you want to write the file. Parent directories will be created automatically if needed.",
        },
        content: {
          type: "string",
          description:
            "The complete content you want to write to the file. This will replace any existing content if the file already exists.",
        },
      },
      required: ["file_path", "content"],
    },
  },
];

const CODE_HEAVY_PROMPT = `You are a coding assistant.

# Example

Here's how to use the Read tool:

\`\`\`python
# Read a Python file
result = read_file("example.py")
print(result)
\`\`\`

Another example:

\`\`\`typescript
// Read a TypeScript file
const content = await readFile("example.ts");
console.log(content);
\`\`\`

# Instructions

Use tools to complete tasks efficiently.`;

// ============================================================================
// CONSTRUCTOR & BASIC TESTS
// ============================================================================

describe("QwenAdapter - Construction", () => {
  test("should create adapter with modelId", () => {
    const adapter = new QwenAdapter("qwen2.5-coder-7b");
    expect(adapter.modelId).toBe("qwen2.5-coder-7b");
  });

  test("should set adapterName to 'QwenAdapter'", () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    expect(adapter.adapterName).toBe("QwenAdapter");
  });

  test("should handle Qwen3 models", () => {
    const adapter = new QwenAdapter("qwen3-coder-30b");
    expect(adapter.modelId).toContain("qwen3");
  });

  test("should handle Qwen2.5 Instruct models", () => {
    const adapter = new QwenAdapter("Qwen2.5-72B-Instruct");
    expect(adapter.modelId).toContain("Qwen2.5");
  });
});

// ============================================================================
// SYSTEM PROMPT ADAPTATION TESTS
// ============================================================================

describe("QwenAdapter - adaptSystemPrompt()", () => {
  test("should convert verbose paragraphs to bullet points", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain("-");
    expect(result.content.length).toBeLessThan(VERBOSE_SYSTEM_PROMPT.length);
  });

  test("should remove redundant explanations", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).not.toContain("it is very important that you");
    expect(result.content).not.toContain("This is critical for");
  });

  test("should preserve critical sections (Tool usage, Tasks)", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain("Tool usage");
    expect(result.content).toContain("Tasks");
  });

  test("should keep concise prompts unchanged", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(CONCISE_SYSTEM_PROMPT);

    expect(result.content).toBe(CONCISE_SYSTEM_PROMPT);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should flatten nested instructions", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const nestedPrompt = `Main instruction:
  - Sub instruction 1:
    - Sub-sub instruction A
    - Sub-sub instruction B
  - Sub instruction 2
`;
    const result = await adapter.adaptSystemPrompt(nestedPrompt);

    // Should convert to flat bullet list
    expect(result.content).toContain("-");
    expect(result.content).not.toContain("  -"); // No double indents
  });

  test("should preserve code blocks exactly", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(CODE_HEAVY_PROMPT);

    expect(result.content).toContain("```python");
    expect(result.content).toContain("```typescript");
    expect(result.content).toContain("read_file(");
    expect(result.content).toContain("await readFile(");
  });

  test("should add Qwen-specific tool calling hint", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.content).toContain(
      "Use OpenAI function calling format for tools"
    );
  });

  test("should track transformations in metadata", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.transformations).toContain(
      "converted_paragraphs_to_bullets"
    );
    expect(result.metadata.transformations).toContain("removed_redundant_text");
  });

  test("should calculate reduction percentage", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.reductionPercent).toBeGreaterThan(0);
    expect(result.metadata.reductionPercent).toBeLessThan(100);
  });

  test("should handle empty prompt", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should handle prompt with only headers", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const headersOnly = "# Header 1\n\n# Header 2\n\n# Header 3";
    const result = await adapter.adaptSystemPrompt(headersOnly);

    expect(result.content).toContain("# Header 1");
    expect(result.content).toContain("# Header 2");
    expect(result.content).toContain("# Header 3");
  });
});

// ============================================================================
// TOOL ADAPTATION TESTS
// ============================================================================

describe("QwenAdapter - adaptTools()", () => {
  test("should simplify verbose tool descriptions", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].description.length).toBeLessThan(
      VERBOSE_TOOLS[0].description.length
    );
    expect(result[1].description.length).toBeLessThan(
      VERBOSE_TOOLS[1].description.length
    );
  });

  test("should preserve tool names exactly", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].name).toBe("Read");
    expect(result[1].name).toBe("Write");
  });

  test("should preserve input schemas exactly", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].input_schema).toEqual(VERBOSE_TOOLS[0].input_schema);
    expect(result[1].input_schema).toEqual(VERBOSE_TOOLS[1].input_schema);
  });

  test("should keep descriptions under 200 characters", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    result.forEach((tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(200);
    });
  });

  test("should keep first sentence of description", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(result[0].description).toContain("reads a file");
    expect(result[1].description).toContain("writes content to a file");
  });

  test("should handle tools with short descriptions", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
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
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools([]);

    expect(result).toEqual([]);
  });

  test("should preserve parameter descriptions in schema", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptTools(VERBOSE_TOOLS);

    expect(
      result[0].input_schema.properties.file_path.description
    ).toBeDefined();
    expect(result[1].input_schema.properties.content.description).toBeDefined();
  });
});

// ============================================================================
// USER MESSAGE ADAPTATION TESTS
// ============================================================================

describe("QwenAdapter - adaptUserMessage()", () => {
  test("should keep user messages unchanged", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const message = "Read the README.md file and summarize it.";
    const result = await adapter.adaptUserMessage(message);

    expect(result.content).toBe(message);
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should preserve code blocks in user message", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const message = "Fix this code:\n```python\ndef test():\n  pass\n```";
    const result = await adapter.adaptUserMessage(message);

    expect(result.content).toContain("```python");
    expect(result.content).toContain("def test():");
  });

  test("should handle empty user message", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptUserMessage("");

    expect(result.content).toBe("");
    expect(result.metadata.wasModified).toBe(false);
  });

  test("should handle very long user messages", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const longMessage = "A".repeat(10000);
    const result = await adapter.adaptUserMessage(longMessage);

    expect(result.content).toBe(longMessage);
  });
});

// ============================================================================
// TOOL CALL PARSING TESTS
// ============================================================================

describe("QwenAdapter - parseToolCall()", () => {
  test("should parse standard OpenAI format tool calls", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const toolCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"README.md"}',
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result).toEqual(toolCall);
  });

  test("should parse Qwen-specific format with underscore", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const qwenCall = {
      type: "function",
      function_call: {
        name: "Read",
        arguments: '{"file_path":"README.md"}',
      },
    };

    const result = await adapter.parseToolCall(qwenCall);
    expect(result.type).toBe("function");
    expect(result.function.name).toBe("Read");
  });

  test("should parse Qwen format with response tags", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const qwenTagCall = {
      type: "tool_use",
      response:
        '<function_call>{"name":"Read","arguments":{"file_path":"README.md"}}</function_call>',
    };

    const result = await adapter.parseToolCall(qwenTagCall);
    expect(result.function.name).toBe("Read");
    expect(result.function.arguments).toContain("README.md");
  });

  test("should handle Qwen format without type field", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const qwenCall = {
      name: "Read",
      arguments: '{"file_path":"README.md"}',
    };

    const result = await adapter.parseToolCall(qwenCall);
    expect(result.type).toBe("function");
    expect(result.function.name).toBe("Read");
  });

  test("should handle Qwen format with arguments as object", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const qwenCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: { file_path: "README.md" }, // Object, not string
      },
    };

    const result = await adapter.parseToolCall(qwenCall);
    expect(result.function.arguments).toBe('{"file_path":"README.md"}');
  });

  test("should preserve tool call ID if present", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const toolCall = {
      id: "call_abc123",
      type: "function",
      function: {
        name: "Read",
        arguments: '{"file_path":"README.md"}',
      },
    };

    const result = await adapter.parseToolCall(toolCall);
    expect(result.id).toBe("call_abc123");
  });

  test("should handle malformed JSON in arguments", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const badCall = {
      type: "function",
      function: {
        name: "Read",
        arguments: "{invalid json}",
      },
    };

    await expect(async () => {
      await adapter.parseToolCall(badCall);
    }).rejects.toThrow("Invalid JSON in tool call arguments");
  });

  test("should handle empty arguments", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const emptyCall = {
      type: "function",
      function: {
        name: "NoArgs",
        arguments: "{}",
      },
    };

    const result = await adapter.parseToolCall(emptyCall);
    expect(result.function.arguments).toBe("{}");
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("QwenAdapter - Edge Cases", () => {
  test("should handle Chinese characters in prompt", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const chinesePrompt = "你是一个编程助手。使用工具来完成任务。";
    const result = await adapter.adaptSystemPrompt(chinesePrompt);

    expect(result.content).toContain("编程助手");
  });

  test("should handle mixed English/Chinese prompt", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const mixedPrompt = "You are Claude Code. 使用工具 to complete tasks.";
    const result = await adapter.adaptSystemPrompt(mixedPrompt);

    expect(result.content).toContain("Claude Code");
    expect(result.content).toContain("使用工具");
  });

  test("should handle prompt with markdown tables", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const tablePrompt = `| Tool | Description |
|------|-------------|
| Read | Reads files |
| Write | Writes files |`;
    const result = await adapter.adaptSystemPrompt(tablePrompt);

    expect(result.content).toContain("|");
    expect(result.content).toContain("Tool");
  });

  test("should handle prompt with HTML-like tags", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const tagPrompt = "Use <tool>Read</tool> to read files.";
    const result = await adapter.adaptSystemPrompt(tagPrompt);

    expect(result.content).toContain("<tool>");
    expect(result.content).toContain("</tool>");
  });

  test("should handle extremely long single line", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const longLine = "A".repeat(5000);
    const result = await adapter.adaptSystemPrompt(longLine);

    expect(result.content.length).toBeLessThanOrEqual(5000);
  });

  test("should handle prompt with many newlines", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const newlinesPrompt = "Line 1\n\n\n\n\n\nLine 2";
    const result = await adapter.adaptSystemPrompt(newlinesPrompt);

    expect(result.content).toContain("Line 1");
    expect(result.content).toContain("Line 2");
  });

  test("should handle tools with complex nested schemas", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const complexTool = [
      {
        name: "Complex",
        description: "A complex tool",
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
    expect(result[0].input_schema).toEqual(complexTool[0].input_schema);
  });

  test("should handle concurrent adaptations", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const promises = [
      adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT),
      adapter.adaptTools(VERBOSE_TOOLS),
      adapter.adaptUserMessage("Test message"),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("QwenAdapter - Performance", () => {
  test("should complete adaptation within 100ms timeout", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const start = Date.now();
    await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle large prompts efficiently", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const largePrompt = VERBOSE_SYSTEM_PROMPT.repeat(100); // ~50KB
    const start = Date.now();
    await adapter.adaptSystemPrompt(largePrompt);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("should handle many tools efficiently", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const manyTools = Array(50)
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
});

// ============================================================================
// METADATA TESTS
// ============================================================================

describe("QwenAdapter - Metadata", () => {
  test("should include Qwen-specific optimizations in metadata", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.modelOptimizations).toContain("qwen_bullet_points");
    expect(result.metadata.modelOptimizations).toContain(
      "qwen_concise_descriptions"
    );
  });

  test("should track original and adapted lengths", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.originalLength).toBe(VERBOSE_SYSTEM_PROMPT.length);
    expect(result.metadata.adaptedLength).toBe(result.content.length);
  });

  test("should track transformation timestamp", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const before = Date.now();
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);
    const after = Date.now();

    expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
  });

  test("should mark as modified when changes made", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(VERBOSE_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(true);
  });

  test("should mark as unmodified when no changes made", async () => {
    const adapter = new QwenAdapter("qwen2.5-coder");
    const result = await adapter.adaptSystemPrompt(CONCISE_SYSTEM_PROMPT);

    expect(result.metadata.wasModified).toBe(false);
  });
});
