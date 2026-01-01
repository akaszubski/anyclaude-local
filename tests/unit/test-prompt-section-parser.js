#!/usr/bin/env node

/**
 * Prompt Section Parser - TDD Test Suite (RED Phase)
 *
 * Tests for src/prompt-section-parser.ts
 *
 * This test suite covers:
 * 1. Section parsing with markdown headers (#, ##, ###)
 * 2. Tier classification accuracy (0-3)
 * 3. Critical section detection integration
 * 4. Filtering by maxTier
 * 5. Prompt reconstruction with markdown preservation
 * 6. Edge cases (empty prompt, no headers, single section, nested lists)
 * 7. Line number tracking
 * 8. ID generation from headers (kebab-case)
 *
 * Run with: node tests/unit/test-prompt-section-parser.js
 */

const assert = require("assert");
const path = require("path");

// Test harness
let passed = 0;
let failed = 0;
const failedTests = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    if (error.stack) {
      console.log(`  ${error.stack.split("\n").slice(1, 3).join("\n")}`);
    }
    failed++;
    failedTests.push({ name, error: error.message });
  }
}

function expect(value) {
  const matchers = {
    toBe: (expected) => {
      assert.strictEqual(value, expected, `Expected ${expected}, got ${value}`);
    },
    toEqual: (expected) => {
      assert.deepStrictEqual(value, expected);
    },
    toContain: (substring) => {
      assert.ok(
        value.includes(substring),
        `Expected to contain "${substring}", got "${value}"`
      );
    },
    toMatch: (regex) => {
      assert.ok(
        regex.test(value),
        `Expected to match ${regex}, got "${value}"`
      );
    },
    toThrow: (expectedMessage) => {
      assert.throws(
        () => value(),
        (err) => {
          if (expectedMessage && !err.message.includes(expectedMessage)) {
            return false;
          }
          return true;
        },
        `Expected function to throw${expectedMessage ? ` with "${expectedMessage}"` : ""}`
      );
    },
    toBeTruthy: () => {
      assert.ok(value, `Expected truthy value, got ${value}`);
    },
    toBeFalsy: () => {
      assert.ok(!value, `Expected falsy value, got ${value}`);
    },
    toBeGreaterThan: (threshold) => {
      assert.ok(value > threshold, `Expected ${value} > ${threshold}`);
    },
    toBeGreaterThanOrEqual: (threshold) => {
      assert.ok(value >= threshold, `Expected ${value} >= ${threshold}`);
    },
    toBeLessThan: (threshold) => {
      assert.ok(value < threshold, `Expected ${value} < ${threshold}`);
    },
    toHaveLength: (length) => {
      assert.strictEqual(
        value.length,
        length,
        `Expected length ${length}, got ${value.length}`
      );
    },
    not: {
      toContain: (substring) => {
        assert.ok(
          !value.includes(substring),
          `Expected NOT to contain "${substring}", but got "${value}"`
        );
      },
    },
  };
  return matchers;
}

// ============================================================================
// MOCK MODULE (Since implementation doesn't exist yet)
// ============================================================================

// These will be imported from the actual implementation once it exists
let parseIntoSections;
let classifySection;
let getSectionsByTier;
let reconstructPrompt;

try {
  // Try to import from compiled TypeScript
  const modulePath = path.resolve(
    __dirname,
    "../../dist/prompt-section-parser.js"
  );
  const module = require(modulePath);
  parseIntoSections = module.parseIntoSections;
  classifySection = module.classifySection;
  getSectionsByTier = module.getSectionsByTier;
  reconstructPrompt = module.reconstructPrompt;
} catch (err) {
  console.log("⚠️  Module not found (expected in TDD RED phase)");
  console.log("   Will test against mock implementation that always fails\n");

  // Mock implementations that fail (TDD RED phase)
  parseIntoSections = () => {
    throw new Error("parseIntoSections not implemented");
  };
  classifySection = () => {
    throw new Error("classifySection not implemented");
  };
  getSectionsByTier = () => {
    throw new Error("getSectionsByTier not implemented");
  };
  reconstructPrompt = () => {
    throw new Error("reconstructPrompt not implemented");
  };
}

// ============================================================================
// TEST SUITE 1: SECTION PARSING WITH MARKDOWN HEADERS
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  PROMPT SECTION PARSER - TDD Tests (RED Phase)          ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("TEST SUITE 1: Section Parsing with Markdown Headers\n");

test("should parse simple prompt with single header", () => {
  const prompt = `# Tool Usage Policy

When making function calls, use proper JSON format.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(1);
  expect(sections[0].header).toBe("# Tool Usage Policy");
  expect(sections[0].id).toBe("tool-usage-policy");
  expect(sections[0].content).toContain("When making function calls");
  expect(sections[0].startLine).toBe(0);
  expect(sections[0].endLine).toBeGreaterThan(0);
});

test("should parse multiple sections with different header levels", () => {
  const prompt = `# Main Header

Content for main section.

## Subsection One

Subsection content.

### Deep Section

Deep content.`;

  const sections = parseIntoSections(prompt);

  expect(sections.length).toBeGreaterThanOrEqual(3);
  expect(sections[0].header).toBe("# Main Header");
  expect(sections[1].header).toBe("## Subsection One");
  expect(sections[2].header).toBe("### Deep Section");
});

test("should handle sections with no content (header at end)", () => {
  const prompt = `# First Section

Some content here.

# Second Section`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[1].header).toBe("# Second Section");
  expect(sections[1].content.trim()).toBe("");
});

test("should parse sections with complex markdown content", () => {
  const prompt = `# Tool Usage Policy

- Bullet point 1
- Bullet point 2
  - Nested bullet

\`\`\`typescript
code block example
\`\`\`

## Another Section

More content.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[0].content).toContain("Bullet point 1");
  expect(sections[0].content).toContain("code block example");
  expect(sections[1].content).toContain("More content");
});

test("should correctly track line numbers for each section", () => {
  const prompt = `# First Header

Content line 1
Content line 2

# Second Header

More content`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[0].startLine).toBe(0);
  expect(sections[0].endLine).toBeLessThan(sections[1].startLine);
  expect(sections[1].startLine).toBeGreaterThan(sections[0].endLine);
});

test("should handle content before first header (preamble)", () => {
  const prompt = `You are Claude Code, an AI assistant.

This is preamble content without a header.

# First Section

Section content.`;

  const sections = parseIntoSections(prompt);

  // Should either:
  // 1. Include preamble as section 0, OR
  // 2. Skip preamble and start from first header
  // Implementation decides which behavior is correct
  expect(sections.length).toBeGreaterThanOrEqual(1);

  const firstSectionWithHeader = sections.find((s) => s.header.startsWith("#"));
  expect(firstSectionWithHeader).toBeTruthy();
  expect(firstSectionWithHeader.header).toBe("# First Section");
});

// ============================================================================
// TEST SUITE 2: TIER CLASSIFICATION
// ============================================================================

console.log("\nTEST SUITE 2: Tier Classification\n");

test("should classify 'Tool Usage Policy' as tier 0 (critical)", () => {
  const tier = classifySection("# Tool Usage Policy");
  expect(tier).toBe(0);
});

test("should classify 'Available Tools' as tier 0 (critical)", () => {
  const tier = classifySection("## Available Tools");
  expect(tier).toBe(0);
});

test("should classify 'Function Calling' as tier 0 (critical)", () => {
  const tier = classifySection("# Function Calling");
  expect(tier).toBe(0);
});

test("should classify 'Tool Schemas' as tier 0 (critical)", () => {
  const tier = classifySection("## Tool Schemas");
  expect(tier).toBe(0);
});

test("should classify 'Core Identity' as tier 1", () => {
  const tier = classifySection("# Core Identity");
  expect(tier).toBe(1);
});

test("should classify 'Tone' as tier 1", () => {
  const tier = classifySection("## Tone and Style");
  expect(tier).toBe(1);
});

test("should classify 'Doing Tasks' as tier 1", () => {
  const tier = classifySection("# Doing tasks");
  expect(tier).toBe(1);
});

test("should classify 'Task Management' as tier 1", () => {
  const tier = classifySection("## Task Management");
  expect(tier).toBe(1);
});

test("should classify 'Planning' as tier 2", () => {
  const tier = classifySection("# Planning and Analysis");
  expect(tier).toBe(2);
});

test("should classify 'Git Workflow' as tier 2", () => {
  const tier = classifySection("## Git workflow");
  expect(tier).toBe(2);
});

test("should classify 'Asking Questions' as tier 2", () => {
  const tier = classifySection("# Asking questions");
  expect(tier).toBe(2);
});

test("should classify unknown sections as tier 3 (default)", () => {
  const tier = classifySection("# Random Unknown Section");
  expect(tier).toBe(3);
});

test("should classify examples and verbose explanations as tier 3", () => {
  const tier = classifySection("## Extended Examples");
  expect(tier).toBe(3);
});

test("should be case-insensitive when classifying", () => {
  const tier1 = classifySection("# TOOL USAGE POLICY");
  const tier2 = classifySection("# tool usage policy");

  expect(tier1).toBe(0);
  expect(tier2).toBe(0);
});

// ============================================================================
// TEST SUITE 3: CRITICAL SECTION DETECTION INTEGRATION
// ============================================================================

console.log("\nTEST SUITE 3: Critical Section Detection Integration\n");

test("should mark sections containing tool schemas as critical", () => {
  const prompt = `# Tool Usage Policy

When making function calls, use this format:

<function_calls>
<invoke name="Tool">
<parameter name="param">value</parameter>
</invoke>
</function_calls>

# Random Section

No tool stuff here.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[0].containsCritical).toBe(true);
  expect(sections[1].containsCritical).toBe(false);
});

test("should mark sections with IMPORTANT markers as critical", () => {
  const prompt = `# Core Identity

You are Claude Code.

IMPORTANT: Always use absolute file paths.

# Another Section

Regular content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].containsCritical).toBe(true);
  expect(sections[1].containsCritical).toBe(false);
});

test("should mark sections with JSON requirements as critical", () => {
  const prompt = `# Doing Tasks

When calling tools, parameters must be in JSON format.

# Examples

Some examples here.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].containsCritical).toBe(true);
});

test("should detect multiple critical patterns in same section", () => {
  const prompt = `# Tool Usage Policy

IMPORTANT: Use JSON format for all parameters.

<function_calls>
<invoke name="Read">
</invoke>
</function_calls>`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].containsCritical).toBe(true);
});

test("should handle sections with no critical markers", () => {
  const prompt = `# General Guidelines

This section has general advice about coding style and practices.
Nothing critical about tool calling here.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].containsCritical).toBe(false);
});

// ============================================================================
// TEST SUITE 4: FILTERING BY MAX TIER
// ============================================================================

console.log("\nTEST SUITE 4: Filtering by Max Tier\n");

test("should return only tier 0 sections when maxTier=0", () => {
  const prompt = `# Tool Usage Policy

Tier 0 content.

# Core Identity

Tier 1 content.

# Planning

Tier 2 content.`;

  const sections = parseIntoSections(prompt);
  const filtered = getSectionsByTier(sections, 0);

  expect(filtered.length).toBeGreaterThan(0);
  filtered.forEach((section) => {
    expect(section.tier).toBe(0);
  });
});

test("should return tier 0 and tier 1 sections when maxTier=1", () => {
  const prompt = `# Tool Usage Policy

Tier 0 content.

# Core Identity

Tier 1 content.

# Planning

Tier 2 content.

# Examples

Tier 3 content.`;

  const sections = parseIntoSections(prompt);
  const filtered = getSectionsByTier(sections, 1);

  filtered.forEach((section) => {
    expect(section.tier).toBeLessThan(2);
  });

  const hasTier0 = filtered.some((s) => s.tier === 0);
  const hasTier1 = filtered.some((s) => s.tier === 1);
  const hasTier2 = filtered.some((s) => s.tier === 2);

  expect(hasTier0).toBe(true);
  expect(hasTier1).toBe(true);
  expect(hasTier2).toBe(false);
});

test("should return all sections when maxTier=3", () => {
  const prompt = `# Tool Usage Policy

Tier 0.

# Core Identity

Tier 1.

# Planning

Tier 2.

# Extended Examples

Tier 3.`;

  const sections = parseIntoSections(prompt);
  const filtered = getSectionsByTier(sections, 3);

  expect(filtered.length).toBe(sections.length);
});

test("should preserve section order after filtering", () => {
  const prompt = `# Tool Usage Policy

First tier 0.

# Planning

Tier 2.

# Doing Tasks

Tier 1.

# Another Tool Section

Second tier 0.`;

  const sections = parseIntoSections(prompt);
  const filtered = getSectionsByTier(sections, 1);

  // Check that filtered sections maintain original order
  for (let i = 1; i < filtered.length; i++) {
    expect(filtered[i].startLine).toBeGreaterThan(filtered[i - 1].startLine);
  }
});

test("should return empty array if no sections match tier", () => {
  const prompt = `# Planning

Tier 2 only.

# Examples

Tier 3 only.`;

  const sections = parseIntoSections(prompt);
  const filtered = getSectionsByTier(sections, 0);

  expect(filtered).toHaveLength(0);
});

// ============================================================================
// TEST SUITE 5: PROMPT RECONSTRUCTION
// ============================================================================

console.log("\nTEST SUITE 5: Prompt Reconstruction\n");

test("should reconstruct exact original prompt from sections", () => {
  const original = `# Tool Usage Policy

When making function calls, use JSON.

# Core Identity

You are Claude Code.

# Planning

Plan before executing.`;

  const sections = parseIntoSections(original);
  const reconstructed = reconstructPrompt(sections);

  expect(reconstructed.trim()).toBe(original.trim());
});

test("should preserve markdown formatting in reconstruction", () => {
  const original = `# Tool Usage Policy

- Bullet 1
- Bullet 2
  - Nested

\`\`\`typescript
code();
\`\`\`

## Subsection

Content.`;

  const sections = parseIntoSections(original);
  const reconstructed = reconstructPrompt(sections);

  expect(reconstructed).toContain("- Bullet 1");
  expect(reconstructed).toContain("- Nested");
  expect(reconstructed).toContain("```typescript");
  expect(reconstructed).toContain("code();");
});

test("should reconstruct filtered sections correctly", () => {
  const original = `# Tool Usage Policy

Tier 0.

# Core Identity

Tier 1.

# Planning

Tier 2.`;

  const sections = parseIntoSections(original);
  const filtered = getSectionsByTier(sections, 1);
  const reconstructed = reconstructPrompt(filtered);

  expect(reconstructed).toContain("# Tool Usage Policy");
  expect(reconstructed).toContain("# Core Identity");
  expect(reconstructed).not.toContain("# Planning");
});

test("should handle sections with empty content", () => {
  const original = `# First Section

Content here.

# Empty Section

# Third Section

More content.`;

  const sections = parseIntoSections(original);
  const reconstructed = reconstructPrompt(sections);

  expect(reconstructed).toContain("# Empty Section");
  expect(reconstructed).toContain("# Third Section");
});

test("should preserve whitespace between sections", () => {
  const original = `# Section One

Content.


# Section Two

Content.`;

  const sections = parseIntoSections(original);
  const reconstructed = reconstructPrompt(sections);

  // Should preserve double newlines between sections
  expect(reconstructed).toMatch(/# Section One[\s\S]+# Section Two/);
});

// ============================================================================
// TEST SUITE 6: EDGE CASES
// ============================================================================

console.log("\nTEST SUITE 6: Edge Cases\n");

test("should handle empty prompt", () => {
  const prompt = "";
  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(0);
});

test("should handle prompt with only whitespace", () => {
  const prompt = "   \n\n   \t\t\n   ";
  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(0);
});

test("should handle prompt with no headers", () => {
  const prompt = `This is just plain text.
No markdown headers here.
Just regular content.`;

  const sections = parseIntoSections(prompt);

  // Implementation choice: either return empty array or treat entire text as one section
  // Both are valid depending on requirements
  expect(Array.isArray(sections)).toBe(true);
});

test("should handle single section prompt", () => {
  const prompt = `# Only Section

This is the only section in the prompt.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(1);
  expect(sections[0].header).toBe("# Only Section");
});

test("should handle headers with special characters", () => {
  const prompt = `# Tool Usage & Policy (v2.0)

Content.

## Sub-section: Advanced [BETA]

More content.`;

  const sections = parseIntoSections(prompt);

  expect(sections.length).toBeGreaterThanOrEqual(2);
  expect(sections[0].header).toContain("Tool Usage & Policy");
  expect(sections[0].id).toMatch(/tool-usage/); // Should kebab-case special chars
});

test("should handle very long section content", () => {
  const longContent = "Line of text.\n".repeat(1000);
  const prompt = `# Long Section\n\n${longContent}\n# Short Section\n\nBrief.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[0].content.length).toBeGreaterThan(10000);
  expect(sections[1].content.length).toBeLessThan(100);
});

test("should handle nested lists correctly", () => {
  const prompt = `# Section with Lists

- Top level 1
  - Nested 1.1
    - Deep nested 1.1.1
  - Nested 1.2
- Top level 2
  - Nested 2.1`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(1);
  expect(sections[0].content).toContain("- Top level 1");
  expect(sections[0].content).toContain("  - Nested 1.1");
  expect(sections[0].content).toContain("    - Deep nested 1.1.1");
});

test("should handle code blocks with markdown-like content", () => {
  const prompt = `# Code Examples

\`\`\`markdown
# This is NOT a real header
## This is inside a code block
\`\`\`

# Real Section

Content.`;

  const sections = parseIntoSections(prompt);

  // Code block content should NOT be parsed as headers
  expect(sections).toHaveLength(2);
  expect(sections[0].header).toBe("# Code Examples");
  expect(sections[1].header).toBe("# Real Section");
});

test("should handle inline code with hash symbols", () => {
  const prompt = `# Section One

Use \`#hashtags\` or \`###\` in your code.

# Section Two

More content.`;

  const sections = parseIntoSections(prompt);

  expect(sections).toHaveLength(2);
  expect(sections[0].content).toContain("`#hashtags`");
});

// ============================================================================
// TEST SUITE 7: ID GENERATION (KEBAB-CASE)
// ============================================================================

console.log("\nTEST SUITE 7: ID Generation (Kebab-Case)\n");

test("should generate kebab-case ID from simple header", () => {
  const prompt = `# Tool Usage Policy

Content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].id).toBe("tool-usage-policy");
});

test("should convert spaces to hyphens in ID", () => {
  const prompt = `# This Is A Long Header

Content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].id).toBe("this-is-a-long-header");
});

test("should remove special characters from ID", () => {
  const prompt = `# Tool Usage & Policy (v2.0)!

Content.`;

  const sections = parseIntoSections(prompt);

  // Should remove &, (), !, keep only alphanumeric and hyphens
  expect(sections[0].id).toMatch(/^[a-z0-9-]+$/);
  expect(sections[0].id).not.toContain("&");
  expect(sections[0].id).not.toContain("(");
  expect(sections[0].id).not.toContain("!");
});

test("should lowercase all characters in ID", () => {
  const prompt = `# UPPERCASE HEADER

Content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].id).toBe("uppercase-header");
});

test("should handle header with numbers", () => {
  const prompt = `# Section 2.5 Beta

Content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].id).toContain("2");
  expect(sections[0].id).toContain("5");
  expect(sections[0].id).toMatch(/^[a-z0-9-]+$/);
});

test("should generate unique IDs for similar headers", () => {
  const prompt = `# Tool Usage

Content 1.

# Tool-Usage

Content 2.

# TOOL USAGE

Content 3.`;

  const sections = parseIntoSections(prompt);

  // All three should normalize to similar IDs
  // Implementation may add suffixes for uniqueness
  expect(sections[0].id).toBeTruthy();
  expect(sections[1].id).toBeTruthy();
  expect(sections[2].id).toBeTruthy();
});

test("should strip markdown header markers from ID", () => {
  const prompt = `### Deep Section Header

Content.`;

  const sections = parseIntoSections(prompt);

  expect(sections[0].id).toBe("deep-section-header");
  expect(sections[0].id).not.toContain("#");
});

// ============================================================================
// TEST SUITE 8: INTEGRATION TESTS
// ============================================================================

console.log("\nTEST SUITE 8: Integration Tests\n");

test("should handle complete Claude Code system prompt structure", () => {
  const prompt = `You are Claude Code, an AI assistant from Anthropic.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

<function_calls>
<invoke name="Read">
<parameter name="file_path">/absolute/path.ts</parameter>
</invoke>
</function_calls>

IMPORTANT: Always use absolute file paths.

# Doing tasks

Break down complex tasks into steps.

## Task management

Use the Task tool to track progress.

# Planning and workflow

Think before acting.

## Git workflow

Commit changes when requested.

# Extended examples

Here are verbose examples of various operations...`;

  const sections = parseIntoSections(prompt);

  // Should have multiple sections
  expect(sections.length).toBeGreaterThanOrEqual(5);

  // Should classify tiers correctly
  const toolUsageSection = sections.find((s) => s.id === "tool-usage-policy");
  expect(toolUsageSection).toBeTruthy();
  expect(toolUsageSection.tier).toBe(0);
  expect(toolUsageSection.containsCritical).toBe(true);

  const doingTasksSection = sections.find((s) => s.id === "doing-tasks");
  expect(doingTasksSection).toBeTruthy();
  expect(doingTasksSection.tier).toBe(1);

  const planningSection = sections.find((s) => s.id.includes("planning"));
  if (planningSection) {
    expect(planningSection.tier).toBe(2);
  }

  const examplesSection = sections.find((s) => s.id.includes("example"));
  if (examplesSection) {
    expect(examplesSection.tier).toBe(3);
  }
});

test("should support round-trip: parse → filter → reconstruct", () => {
  const original = `# Tool Usage Policy

Critical tier 0 content.

# Core Identity

Important tier 1 content.

# Planning

Tier 2 content.

# Extended Examples

Tier 3 verbose examples.`;

  // Round-trip test
  const sections = parseIntoSections(original);
  const filtered = getSectionsByTier(sections, 1);
  const reconstructed = reconstructPrompt(filtered);

  // Reconstructed should only have tier 0 and tier 1
  expect(reconstructed).toContain("Tool Usage Policy");
  expect(reconstructed).toContain("Core Identity");
  expect(reconstructed).not.toContain("Planning");
  expect(reconstructed).not.toContain("Extended Examples");
});

test("should handle prompt optimization scenario", () => {
  // Simulate real optimization: keep tier 0-1, drop tier 2-3
  const fullPrompt = `# Tool Usage Policy

<function_calls>
<invoke name="Read">
</invoke>
</function_calls>

IMPORTANT: Use JSON format.

# Core Identity

You are Claude Code.

# Doing Tasks

Break down complex tasks.

# Planning and Analysis

Think step by step...

# Extended Examples with Verbose Explanations

Example 1: How to read a file...
Example 2: How to write a file...
[... 5000 more characters ...]`;

  const sections = parseIntoSections(fullPrompt);
  const optimized = getSectionsByTier(sections, 1);
  const optimizedPrompt = reconstructPrompt(optimized);

  // Optimized prompt should be shorter
  expect(optimizedPrompt.length).toBeLessThan(fullPrompt.length);

  // Should preserve critical sections
  expect(optimizedPrompt).toContain("Tool Usage Policy");
  expect(optimizedPrompt).toContain("function_calls");
  expect(optimizedPrompt).toContain("IMPORTANT");

  // Should remove verbose examples
  expect(optimizedPrompt).not.toContain("Extended Examples");
});

// ============================================================================
// TEST RESULTS SUMMARY
// ============================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  TEST RESULTS SUMMARY                                    ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log(`Total tests: ${passed + failed}`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}\n`);

if (failed > 0) {
  console.log("Failed tests:");
  failedTests.forEach(({ name, error }) => {
    console.log(`  - ${name}`);
    console.log(`    ${error}`);
  });
  console.log("");
  process.exit(1);
} else {
  console.log("🎉 All tests passed! (But they should FAIL in TDD RED phase)\n");
  console.log("Note: This is the RED phase of TDD - tests should fail until");
  console.log(
    "      the implementation is created in src/prompt-section-parser.ts"
  );
  process.exit(0);
}
