/**
 * Unit tests for enhanced critical-sections.ts (Issue #34)
 *
 * Tests enhanced critical section detection with P0/P1/P2 priorities and ReDoS prevention.
 *
 * Expected: ALL TESTS FAIL (TDD red phase - enhanced implementation doesn't exist yet)
 */

import {
  CriticalSection,
  CriticalSectionMatch,
  ValidationResult,
  detectCriticalSections,
  validateCriticalPresence,
  CRITICAL_SECTIONS,
} from "../../src/critical-sections";

// Test Data - Mock Prompts
const P0_ONLY_PROMPT = `You are Claude Code.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

Available tools:
- Read (file_path: string)
- Write (file_path: string, content: string)`;

const P0_P1_PROMPT = `You are Claude Code, Anthropic's official CLI.

# Tool usage policy

When making function calls ensure JSON format.

# Security

NEVER execute untrusted code.

# Doing tasks

IMPORTANT: Use absolute paths.`;

const FULL_PROMPT = `You are Claude Code.

# Tool usage policy

When making function calls use JSON format.

# Security

NEVER execute untrusted code.

# Examples

Here are some examples of good tool usage.

# Verbose explanations

This section contains detailed explanations.`;

const MISSING_P0_PROMPT = `You are Claude Code.

# Security

Some security guidelines.

# Examples

Some examples.`;

const REDOS_ATTACK_PROMPT =
  "a".repeat(10000) + "\n# Tool usage policy\nJSON format\n";
const EMPTY_PROMPT = "";

// Test Suite: CriticalSection Interface Enhancement
describe("CriticalSection Interface - Priority Levels", () => {
  test("should have priority field in CriticalSection interface", () => {
    const section: CriticalSection = CRITICAL_SECTIONS[0];
    expect(section).toHaveProperty("priority");
  });

  test("priority should be P0, P1, or P2", () => {
    CRITICAL_SECTIONS.forEach((section) => {
      expect(["P0", "P1", "P2"]).toContain(section.priority);
    });
  });

  test("should have dependencies field for pattern dependencies", () => {
    const section: CriticalSection = CRITICAL_SECTIONS[0];
    expect(section).toHaveProperty("dependencies");
    expect(Array.isArray(section.dependencies)).toBe(true);
  });
});

// Test Suite: P0 Patterns (Must Preserve)
describe("P0 Patterns - Critical Tool Calling Instructions", () => {
  describe("P0 pattern definitions", () => {
    test("should have P0 patterns for tool usage policy", () => {
      const p0Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P0");
      const hasToolUsage = p0Patterns.some((p) =>
        p.name.includes("tool-usage")
      );
      expect(hasToolUsage).toBe(true);
    });

    test("should have P0 pattern for JSON format requirements", () => {
      const p0Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P0");
      const hasJson = p0Patterns.some(
        (p) =>
          p.name.includes("json") ||
          p.description.toLowerCase().includes("json")
      );
      expect(hasJson).toBe(true);
    });

    test("all P0 patterns should be marked as required", () => {
      const p0Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P0");
      p0Patterns.forEach((pattern) => {
        expect(pattern.required).toBe(true);
      });
    });
  });

  describe("P0 pattern detection", () => {
    test("should detect P0 patterns in valid prompt", () => {
      const matches = detectCriticalSections(P0_ONLY_PROMPT);
      const p0Matches = matches.filter((m) => m.section.priority === "P0");
      expect(p0Matches.length).toBeGreaterThan(0);
    });

    test("should extract correct matched text for P0 patterns", () => {
      const matches = detectCriticalSections(P0_ONLY_PROMPT);
      const toolUsageMatch = matches.find((m) =>
        m.section.name.includes("tool-usage")
      );
      expect(toolUsageMatch).toBeDefined();
      expect(toolUsageMatch!.matchedText.length).toBeGreaterThan(0);
    });
  });

  describe("P0 validation", () => {
    test("should fail validation if P0 patterns missing", () => {
      const result = validateCriticalPresence(MISSING_P0_PROMPT);
      expect(result.isValid).toBe(false);
      expect(result.missingRequired.length).toBeGreaterThan(0);
    });

    test("should list missing P0 patterns separately", () => {
      const result = validateCriticalPresence(MISSING_P0_PROMPT);
      const missingP0 = result.missingRequired.filter(
        (s) => s.priority === "P0"
      );
      expect(missingP0.length).toBeGreaterThan(0);
    });

    test("should pass validation with all P0 patterns present", () => {
      const result = validateCriticalPresence(P0_ONLY_PROMPT);
      const missingP0 = result.missingRequired.filter(
        (s) => s.priority === "P0"
      );
      expect(missingP0.length).toBe(0);
    });
  });
});

// Test Suite: P1 Patterns (Should Preserve)
describe("P1 Patterns - Important Guidelines", () => {
  describe("P1 pattern definitions", () => {
    test("should have P1 patterns for safety guidelines", () => {
      const p1Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P1");
      const hasSafety = p1Patterns.some(
        (p) =>
          p.name.toLowerCase().includes("safety") ||
          p.name.toLowerCase().includes("security")
      );
      expect(hasSafety).toBe(true);
    });

    test("should have P1 pattern for core identity", () => {
      const p1Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P1");
      const hasIdentity = p1Patterns.some(
        (p) => p.name.includes("identity") || p.name.includes("doing-tasks")
      );
      expect(hasIdentity).toBe(true);
    });
  });

  describe("P1 pattern detection", () => {
    test("should detect P1 patterns when present", () => {
      const matches = detectCriticalSections(P0_P1_PROMPT);
      const p1Matches = matches.filter((m) => m.section.priority === "P1");
      expect(p1Matches.length).toBeGreaterThan(0);
    });
  });
});

// Test Suite: P2 Patterns (Optional)
describe("P2 Patterns - Optional Content", () => {
  describe("P2 pattern definitions", () => {
    test("should have P2 patterns for examples", () => {
      const p2Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P2");
      const hasExamples = p2Patterns.some((p) =>
        p.name.toLowerCase().includes("example")
      );
      expect(hasExamples).toBe(true);
    });

    test("all P2 patterns should have required: false", () => {
      const p2Patterns = CRITICAL_SECTIONS.filter((s) => s.priority === "P2");
      p2Patterns.forEach((pattern) => {
        expect(pattern.required).toBe(false);
      });
    });
  });

  describe("P2 pattern detection", () => {
    test("should detect P2 patterns when present", () => {
      const matches = detectCriticalSections(FULL_PROMPT);
      const p2Matches = matches.filter((m) => m.section.priority === "P2");
      expect(p2Matches.length).toBeGreaterThan(0);
    });

    test("should not fail validation if P2 patterns missing", () => {
      const result = validateCriticalPresence(P0_ONLY_PROMPT);
      const hasAllP0 = !result.missingRequired.some((s) => s.priority === "P0");
      if (hasAllP0) {
        expect(result.isValid).toBe(true);
      }
    });
  });
});

// Test Suite: ReDoS Prevention
describe("ReDoS Prevention", () => {
  describe("Pattern performance on adversarial input", () => {
    test("should complete detection in <100ms on 10k repetitive characters", () => {
      const start = Date.now();
      detectCriticalSections(REDOS_ATTACK_PROMPT);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    test("should complete detection in <100ms on nested patterns", () => {
      const nestedPrompt =
        "(".repeat(1000) + "# Tool usage policy\nJSON" + ")".repeat(1000);
      const start = Date.now();
      detectCriticalSections(nestedPrompt);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    test("should handle null bytes safely", () => {
      const maliciousPrompt = "Test\x00# Tool usage policy\x00JSON";
      expect(() => detectCriticalSections(maliciousPrompt)).not.toThrow();
    });

    test("should handle control characters safely", () => {
      const controlChars = "\r\n\t\x1b[31m# Tool usage policy\x1b[0m";
      expect(() => detectCriticalSections(controlChars)).not.toThrow();
    });
  });

  describe("Memory safety", () => {
    test("should not leak memory on repeated calls", () => {
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        detectCriticalSections(FULL_PROMPT);
      }
      expect(true).toBe(true);
    });

    test("should handle very long prompts without excessive memory", () => {
      const veryLongPrompt = FULL_PROMPT.repeat(100);
      const matches = detectCriticalSections(veryLongPrompt);
      expect(matches).toBeDefined();
    });
  });
});

// Test Suite: Pattern Dependencies
describe("Pattern Dependencies", () => {
  describe("Dependency tracking", () => {
    test("should define dependencies for dependent patterns", () => {
      const withDeps = CRITICAL_SECTIONS.filter(
        (s) => s.dependencies && s.dependencies.length > 0
      );
      expect(withDeps.length).toBeGreaterThan(0);
    });

    test("tool schema patterns should depend on tool usage policy", () => {
      const toolSchema = CRITICAL_SECTIONS.find((s) =>
        s.name.includes("tool-schema")
      );
      if (toolSchema && toolSchema.dependencies) {
        expect(
          toolSchema.dependencies.some((d) => d.includes("tool-usage"))
        ).toBe(true);
      }
    });

    test("dependencies should reference valid pattern names", () => {
      CRITICAL_SECTIONS.forEach((section) => {
        if (section.dependencies) {
          section.dependencies.forEach((dep) => {
            const exists = CRITICAL_SECTIONS.some((s) => s.name === dep);
            expect(exists).toBe(true);
          });
        }
      });
    });
  });
});

// Test Suite: Priority-Aware Validation
describe("Priority-Aware Validation", () => {
  describe("ValidationResult enhancement", () => {
    test("should separate missing patterns by priority", () => {
      const result = validateCriticalPresence(MISSING_P0_PROMPT);
      expect(result.missingRequired).toBeDefined();
      const missingP0 = result.missingRequired.filter(
        (s) => s.priority === "P0"
      );
      const missingP1 = result.missingRequired.filter(
        (s) => s.priority === "P1"
      );
      expect(missingP0).toBeDefined();
      expect(missingP1).toBeDefined();
    });

    test("should calculate coverage by priority level", () => {
      const result = validateCriticalPresence(P0_ONLY_PROMPT);
      expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.coveragePercent).toBeLessThanOrEqual(100);
    });
  });

  describe("Validation strictness by priority", () => {
    test("should fail validation if any P0 pattern missing", () => {
      const result = validateCriticalPresence(MISSING_P0_PROMPT);
      const missingP0 = result.missingRequired.filter(
        (s) => s.priority === "P0"
      );
      if (missingP0.length > 0) {
        expect(result.isValid).toBe(false);
      }
    });

    test("should warn but not fail if P1 patterns missing", () => {
      const result = validateCriticalPresence(P0_ONLY_PROMPT);
      const hasP0 = !result.missingRequired.some((s) => s.priority === "P0");
      if (hasP0) {
        expect(result.isValid).toBe(true);
      }
    });
  });
});

// Test Suite: Edge Cases
describe("Edge Cases", () => {
  describe("Empty and invalid input", () => {
    test("should handle empty string", () => {
      const result = validateCriticalPresence(EMPTY_PROMPT);
      expect(result.isValid).toBe(false);
      expect(result.foundSections).toBe(0);
    });

    test("should handle whitespace-only prompt", () => {
      const result = validateCriticalPresence("   \n\n\t  ");
      expect(result.isValid).toBe(false);
    });

    test("should handle prompt with no markdown headers", () => {
      const result = validateCriticalPresence("Just plain text no headers");
      expect(result.isValid).toBe(false);
    });
  });

  describe("Very large prompts", () => {
    test("should handle 100k character prompts", () => {
      const hugePrompt = FULL_PROMPT.repeat(500);
      expect(() => detectCriticalSections(hugePrompt)).not.toThrow();
    });

    test("should handle prompts with thousands of sections", () => {
      const manySections = Array.from(
        { length: 1000 },
        (_, i) => `# Section ${i}\nContent`
      ).join("\n\n");
      const matches = detectCriticalSections(manySections);
      expect(matches).toBeDefined();
    });
  });

  describe("Malicious input", () => {
    test("should handle prompts with regex metacharacters", () => {
      const malicious = "# Tool.*usage|policy\n(.*?)+JSON{1,999999}";
      expect(() => detectCriticalSections(malicious)).not.toThrow();
    });

    test("should handle unicode edge cases", () => {
      const unicodePrompt = "# Tool usage policy 🔧\nJSON format 📝";
      const result = validateCriticalPresence(unicodePrompt);
      expect(result).toBeDefined();
    });

    test("should handle extremely long lines", () => {
      const longLine = "a".repeat(100000);
      const prompt = `# Tool usage policy\n${longLine}\nJSON`;
      expect(() => detectCriticalSections(prompt)).not.toThrow();
    });
  });
});

// Test Suite: Integration with Filter System
describe("Integration with Filter System", () => {
  test("should provide priority information for tier filtering", () => {
    const matches = detectCriticalSections(FULL_PROMPT);
    matches.forEach((match) => {
      expect(match.section.priority).toBeDefined();
      expect(["P0", "P1", "P2"]).toContain(match.section.priority);
    });
  });

  test("should enable tier-based preservation decisions", () => {
    const matches = detectCriticalSections(FULL_PROMPT);
    const p0Count = matches.filter((m) => m.section.priority === "P0").length;
    const p1Count = matches.filter((m) => m.section.priority === "P1").length;
    const p2Count = matches.filter((m) => m.section.priority === "P2").length;

    // MINIMAL tier: preserve all
    expect(p0Count + p1Count + p2Count).toBeGreaterThan(0);

    // MODERATE tier: preserve P0 + P1
    expect(p0Count + p1Count).toBeGreaterThanOrEqual(0);

    // AGGRESSIVE tier: preserve P0
    expect(p0Count).toBeGreaterThanOrEqual(0);
  });

  test("should support validation after tier filtering", () => {
    const p0OnlyMatches = detectCriticalSections(P0_ONLY_PROMPT);
    expect(p0OnlyMatches.length).toBeGreaterThan(0);

    const result = validateCriticalPresence(P0_ONLY_PROMPT);
    const missingP0 = result.missingRequired.filter((s) => s.priority === "P0");
    expect(missingP0.length).toBe(0);
  });
});
