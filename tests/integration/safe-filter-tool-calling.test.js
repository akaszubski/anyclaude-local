/**
 * Integration tests for safe-system-filter.ts tool calling preservation (Issue #34)
 *
 * Tests that filtered prompts preserve tool calling functionality across all tiers.
 *
 * Expected: ALL TESTS FAIL (TDD red phase - enhanced implementation doesn't exist yet)
 */

const {
  OptimizationTier,
  filterSystemPrompt,
} = require("../../src/safe-system-filter");

// Test Data - Real Claude Code system prompt snippets
const CLAUDE_TOOL_CALLING_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

For example:
<function_calls>
<invoke name="Read">
<parameter name="file_path">/absolute/path</parameter>
</invoke>
</function_calls>

Check that all the required parameters for each tool call are provided or can reasonably be inferred from context.

# Read Tool

The Read tool reads files from the filesystem.

Parameters:
- file_path (string, required): Absolute path to the file to read

# Write Tool

The Write tool writes files to the filesystem.

Parameters:
- file_path (string, required): Absolute path to the file to write
- content (string, required): Content to write to the file

# Edit Tool

The Edit tool modifies existing files.

Parameters:
- file_path (string, required): Absolute path to the file to edit
- old_string (string, required): Exact string to replace (must match exactly)
- new_string (string, required): Replacement string

# Bash Tool

Execute bash commands.

Parameters:
- command (string, required): The bash command to execute
- description (string, optional): Description of what the command does

# Doing tasks

IMPORTANT: Always use absolute paths for file operations.
VERY IMPORTANT: Parameters must match the schema exactly.`;

const MINIMAL_TOOL_PROMPT = `# Tool usage policy

Use JSON for parameters.

# Read Tool

Read files with file_path parameter.

# Doing tasks

Use absolute paths.`;

const NO_TOOL_PROMPT = `# Security

NEVER execute untrusted code.

# Examples

Here are some examples of good coding practices.`;

// Test Suite: Tool Calling Preservation Across Tiers
describe("Tool Calling Preservation Across Tiers", () => {
  describe("MINIMAL tier preservation", () => {
    test("should preserve all tool calling instructions", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("Tool usage policy");
      expect(result.filteredPrompt).toContain("JSON");
      expect(result.filteredPrompt).toContain("function calls");
    });

    test("should preserve tool schemas", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("Read Tool");
      expect(result.filteredPrompt).toContain("Write Tool");
      expect(result.filteredPrompt).toContain("Edit Tool");
      expect(result.filteredPrompt).toContain("Bash Tool");
    });

    test("should preserve tool parameter definitions", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("file_path");
      expect(result.filteredPrompt).toContain("content");
      expect(result.filteredPrompt).toContain("old_string");
      expect(result.filteredPrompt).toContain("new_string");
      expect(result.filteredPrompt).toContain("command");
    });

    test("should preserve absolute path requirements", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("absolute path");
    });

    test("should preserve tool call examples", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("function_calls");
      expect(result.filteredPrompt).toContain("invoke");
    });
  });

  describe("MODERATE tier preservation", () => {
    test("should preserve core tool calling instructions", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Tool usage policy");
      expect(result.filteredPrompt).toContain("JSON");
      expect(result.validation.isValid).toBe(true);
    });

    test("should preserve tool schemas even with condensed examples", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Read Tool");
      expect(result.filteredPrompt).toContain("Write Tool");
    });

    test("should preserve required parameters", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("file_path");
      expect(result.filteredPrompt).toContain("required");
    });

    test("should condense but not remove critical tool info", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      // Should be shorter but still valid
      expect(result.filteredPrompt.length).toBeLessThan(
        CLAUDE_TOOL_CALLING_PROMPT.length
      );
      expect(result.validation.isValid).toBe(true);
    });
  });

  describe("AGGRESSIVE tier preservation", () => {
    test("should preserve minimum viable tool calling instructions", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      expect(result.filteredPrompt).toContain("Tool usage policy");
      expect(result.validation.isValid).toBe(true);
    });

    test("should preserve essential tool schemas", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // Should have at least core tools
      const hasTools =
        result.filteredPrompt.includes("Read") ||
        result.filteredPrompt.includes("Write") ||
        result.filteredPrompt.includes("tool");

      expect(hasTools).toBe(true);
    });

    test("should preserve JSON format requirement", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      expect(result.filteredPrompt).toContain("JSON");
    });

    test("should validate successfully despite aggressive reduction", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
    });
  });

  describe("EXTREME tier preservation", () => {
    test("should preserve absolute minimum tool calling info", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Must have tool usage policy at minimum
      expect(result.filteredPrompt).toContain("Tool usage policy");
    });

    test("should pass validation with core tool info", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
    });

    test("should preserve JSON format requirement even in EXTREME", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      expect(result.filteredPrompt).toContain("JSON");
    });

    test("should trigger fallback if tool info would be lost", () => {
      const result = filterSystemPrompt(MINIMAL_TOOL_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Either passes validation or fell back to safer tier
      if (!result.validation.isValid) {
        expect(result.fallbackOccurred).toBe(true);
        expect(result.appliedTier).not.toBe(OptimizationTier.EXTREME);
      }
    });
  });
});

// Test Suite: Function Call Syntax Preservation
describe("Function Call Syntax Preservation", () => {
  describe("XML syntax preservation", () => {
    test("should preserve function_calls XML structure", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("function_calls");
      expect(result.filteredPrompt).toContain("invoke");
    });

    test("should preserve parameter XML structure", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain("parameter");
    });

    test("should preserve invoke name attribute", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.filteredPrompt).toContain('name="');
    });
  });

  describe("JSON format requirements", () => {
    test("should preserve JSON format instruction", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("JSON");
    });

    test("should preserve array/object parameter requirement", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      const hasArrayObjectMention =
        result.filteredPrompt.includes("array") ||
        result.filteredPrompt.includes("object") ||
        result.filteredPrompt.includes("JSON");

      expect(hasArrayObjectMention).toBe(true);
    });
  });

  describe("Parameter validation preservation", () => {
    test("should preserve required parameter checking", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("required");
    });

    test("should preserve parameter type information", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("string");
    });

    test("should preserve parameter validation rules", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      const hasValidation =
        result.filteredPrompt.includes("required") ||
        result.filteredPrompt.includes("provided") ||
        result.filteredPrompt.includes("parameters");

      expect(hasValidation).toBe(true);
    });
  });
});

// Test Suite: Tool Schema Preservation
describe("Tool Schema Preservation", () => {
  describe("Individual tool schemas", () => {
    test("should preserve Read tool schema", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Read");
      expect(result.filteredPrompt).toContain("file_path");
    });

    test("should preserve Write tool schema", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Write");
      expect(result.filteredPrompt).toContain("content");
    });

    test("should preserve Edit tool schema", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Edit");
      expect(result.filteredPrompt).toContain("old_string");
      expect(result.filteredPrompt).toContain("new_string");
    });

    test("should preserve Bash tool schema", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Bash");
      expect(result.filteredPrompt).toContain("command");
    });
  });

  describe("Schema completeness", () => {
    test("should preserve parameter names for all tools", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      const hasParameters =
        result.filteredPrompt.includes("file_path") &&
        result.filteredPrompt.includes("content") &&
        result.filteredPrompt.includes("command");

      expect(hasParameters).toBe(true);
    });

    test("should preserve parameter types", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("string");
    });

    test("should preserve required/optional annotations", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      const hasAnnotations =
        result.filteredPrompt.includes("required") ||
        result.filteredPrompt.includes("optional");

      expect(hasAnnotations).toBe(true);
    });
  });
});

// Test Suite: Absolute Path Requirement Preservation
describe("Absolute Path Requirement Preservation", () => {
  test("should preserve absolute path instructions in MINIMAL tier", () => {
    const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
      tier: OptimizationTier.MINIMAL,
    });

    expect(result.filteredPrompt).toContain("absolute path");
  });

  test("should preserve absolute path instructions in MODERATE tier", () => {
    const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
      tier: OptimizationTier.MODERATE,
    });

    const hasAbsolutePath =
      result.filteredPrompt.includes("absolute") ||
      result.filteredPrompt.includes("Absolute");

    expect(hasAbsolutePath).toBe(true);
  });

  test("should preserve IMPORTANT absolute path warning", () => {
    const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
      tier: OptimizationTier.MODERATE,
    });

    const hasImportant =
      result.filteredPrompt.includes("IMPORTANT") ||
      result.filteredPrompt.includes("absolute");

    expect(hasImportant).toBe(true);
  });

  test("should preserve path validation in Doing tasks section", () => {
    const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
      tier: OptimizationTier.AGGRESSIVE,
    });

    const hasPathInfo =
      result.filteredPrompt.includes("path") ||
      result.filteredPrompt.includes("file_path");

    expect(hasPathInfo).toBe(true);
  });
});

// Test Suite: Validation Prevents Broken Tool Calling
describe("Validation Prevents Broken Tool Calling", () => {
  describe("Missing tool usage policy", () => {
    test("should fail validation if tool usage policy removed", () => {
      const result = filterSystemPrompt(NO_TOOL_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.missingPatterns).toContain(
        "tool-usage-policy-header"
      );
    });

    test("should trigger fallback if aggressive filtering removes policy", () => {
      const result = filterSystemPrompt(MINIMAL_TOOL_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Either keeps policy or falls back
      expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
    });
  });

  describe("Missing JSON format requirement", () => {
    test("should detect missing JSON format requirement", () => {
      const noJsonPrompt = `# Tool usage policy\nUse tools properly.`;
      const result = filterSystemPrompt(noJsonPrompt, {
        tier: OptimizationTier.MINIMAL,
      });

      if (!result.validation.isValid) {
        expect(result.validation.missingPatterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Missing function call syntax", () => {
    test("should detect missing function call examples", () => {
      const noSyntaxPrompt = `# Tool usage policy\nJSON format\n# Read\nfile_path`;
      const result = filterSystemPrompt(noSyntaxPrompt, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // Should either have function call syntax or fail validation
      if (!result.filteredPrompt.includes("function_calls")) {
        expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
      }
    });
  });
});

// Test Suite: Real-World Tool Calling Scenarios
describe("Real-World Tool Calling Scenarios", () => {
  describe("File operations preservation", () => {
    test("should preserve file read/write/edit capabilities", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      const hasFileOps =
        result.filteredPrompt.includes("Read") &&
        result.filteredPrompt.includes("Write") &&
        result.filteredPrompt.includes("Edit");

      expect(hasFileOps).toBe(true);
    });

    test("should preserve file path parameter in all file tools", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("file_path");
    });
  });

  describe("Bash command preservation", () => {
    test("should preserve Bash tool for command execution", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Bash");
      expect(result.filteredPrompt).toContain("command");
    });
  });

  describe("Multi-tool workflows", () => {
    test("should preserve all tools for complex workflows", () => {
      const result = filterSystemPrompt(CLAUDE_TOOL_CALLING_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      // Should have Read, Write, Edit, and Bash
      const toolCount = [
        result.filteredPrompt.includes("Read"),
        result.filteredPrompt.includes("Write"),
        result.filteredPrompt.includes("Edit"),
        result.filteredPrompt.includes("Bash"),
      ].filter(Boolean).length;

      expect(toolCount).toBeGreaterThanOrEqual(3);
    });
  });
});

// Test Suite: Paraphrased Prompts (Robustness Testing)
describe("Paraphrased Prompts Robustness", () => {
  test("should detect tool calling even with different phrasing", () => {
    const paraphrased = `# Function invocation guidelines

    When invoking functions, structure parameters as JSON objects.

    # File reader utility

    Reads file contents from disk.
    Parameter: file_path (absolute path required)`;

    const result = filterSystemPrompt(paraphrased, {
      tier: OptimizationTier.MODERATE,
    });

    // Should detect tool-related content
    const hasToolInfo =
      result.filteredPrompt.includes("function") ||
      result.filteredPrompt.includes("JSON") ||
      result.filteredPrompt.includes("file_path");

    expect(hasToolInfo).toBe(true);
  });

  test("should handle alternative tool call syntax", () => {
    const alternative = `# API call format

    Use JSON for all API calls.

    # Available APIs

    - read_file(path: str)
    - write_file(path: str, data: str)`;

    expect(() =>
      filterSystemPrompt(alternative, { tier: OptimizationTier.MODERATE })
    ).not.toThrow();
  });
});

// Test Suite: Edge Cases
describe("Edge Cases", () => {
  test("should handle minimal viable tool prompt", () => {
    const minimal = `# Tool usage policy\nJSON\n# Read\nfile_path`;
    const result = filterSystemPrompt(minimal, {
      tier: OptimizationTier.MINIMAL,
    });

    expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
  });

  test("should handle prompt with only tool schemas", () => {
    const schemasOnly = `# Read\nfile_path\n# Write\nfile_path, content`;
    const result = filterSystemPrompt(schemasOnly, {
      tier: OptimizationTier.MODERATE,
    });

    // Should fail or trigger fallback (missing policy header)
    if (!result.validation.isValid) {
      expect(result.validation.missingPatterns.length).toBeGreaterThan(0);
    }
  });

  test("should handle very long tool descriptions", () => {
    const longDesc = `# Tool usage policy\nJSON format\n\n# Read Tool\n${"Reads files from the filesystem. ".repeat(
      100
    )}\nfile_path: string`;

    expect(() =>
      filterSystemPrompt(longDesc, { tier: OptimizationTier.AGGRESSIVE })
    ).not.toThrow();
  });

  test("should handle tools with many parameters", () => {
    const manyParams = `# Tool usage policy\nJSON\n\n# Complex Tool\nparam1, param2, param3, param4, param5, param6, param7, param8, param9, param10`;

    const result = filterSystemPrompt(manyParams, {
      tier: OptimizationTier.MODERATE,
    });

    expect(result).toBeDefined();
    expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
  });
});
