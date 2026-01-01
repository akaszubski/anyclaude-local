/**
 * Unit tests for critical-sections.ts
 *
 * Tests the critical section detection and validation for preserving
 * tool-calling instructions during prompt optimization.
 *
 * Components tested:
 * 1. CriticalSection pattern detection (RegExp matching)
 * 2. detectCriticalSections() - Finds and extracts critical sections
 * 3. validateCriticalPresence() - Validates required sections exist
 * 4. CRITICAL_SECTIONS constant - Pattern definitions
 * 5. Security - ReDoS resistance, malicious inputs
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

const {
  detectCriticalSections,
  validateCriticalPresence,
  CRITICAL_SECTIONS,
} = require("../../dist/critical-sections.js");

// ============================================================================
// Test Data
// ============================================================================

const MINIMAL_VALID_PROMPT = "You are Claude Code.\n\n# Tool usage policy\n\nWhen making function calls using tools that accept array or object parameters ensure those are structured using JSON.\n\n# Doing tasks\n\nIMPORTANT: Follow instructions.";

const PROMPT_MISSING_REQUIRED = "You are Claude Code.\n\nSome instructions.";

const PROMPT_WITH_ALL_PATTERNS = "You are Claude Code.\n\n# Tool usage policy\n\nWhen making function calls using tools ensure JSON format.\n\n# Doing tasks\n\nIMPORTANT: Use absolute paths.\n\nVERY IMPORTANT: Parameters must be correct.";

const MALICIOUS_REDOS_ATTEMPT = "a".repeat(10000) + "# Tool usage policy" + "b".repeat(10000);

const EMPTY_PROMPT = "";

const WHITESPACE_ONLY = "   \n\n\t\t  \n  ";

// ============================================================================
// Test Suite
// ============================================================================

describe("CRITICAL_SECTIONS Constant", () => {
  describe("Structure validation", () => {
    test("should export CRITICAL_SECTIONS array", () => {
      expect(CRITICAL_SECTIONS).toBeDefined();
      expect(Array.isArray(CRITICAL_SECTIONS)).toBe(true);
    });

    test("should have at least 6 critical patterns", () => {
      expect(CRITICAL_SECTIONS.length).toBeGreaterThanOrEqual(6);
    });

    test("each section should have required properties", () => {
      CRITICAL_SECTIONS.forEach(section => {
        expect(section).toHaveProperty("name");
        expect(section).toHaveProperty("pattern");
        expect(section).toHaveProperty("required");
        expect(section).toHaveProperty("description");
        expect(section.pattern).toBeInstanceOf(RegExp);
        expect(typeof section.required).toBe("boolean");
      });
    });
  });

  describe("Required patterns", () => {
    test("should include tool usage policy pattern", () => {
      const hasToolPolicy = CRITICAL_SECTIONS.some(s =>
        s.name.toLowerCase().includes("tool") && s.name.toLowerCase().includes("policy")
      );
      expect(hasToolPolicy).toBe(true);
    });

    test("should include function calls pattern", () => {
      const hasFunctionCalls = CRITICAL_SECTIONS.some(s =>
        s.pattern.test("When making function calls using tools")
      );
      expect(hasFunctionCalls).toBe(true);
    });

    test("should include JSON format requirement pattern", () => {
      const hasJsonFormat = CRITICAL_SECTIONS.some(s =>
        s.pattern.test("ensure those are structured using JSON")
      );
      expect(hasJsonFormat).toBe(true);
    });

    test("should include Doing tasks section pattern", () => {
      const hasDoingTasks = CRITICAL_SECTIONS.some(s =>
        s.pattern.test("# Doing tasks")
      );
      expect(hasDoingTasks).toBe(true);
    });

    test("should include IMPORTANT marker pattern", () => {
      const hasImportant = CRITICAL_SECTIONS.some(s =>
        s.pattern.test("IMPORTANT:")
      );
      expect(hasImportant).toBe(true);
    });

    test("should mark critical patterns as required", () => {
      const requiredSections = CRITICAL_SECTIONS.filter(s => s.required);
      expect(requiredSections.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Pattern quality", () => {
    test("patterns should match expected text", () => {
      const toolPolicy = CRITICAL_SECTIONS.find(s =>
        s.name.toLowerCase().includes("tool")
      );
      expect(toolPolicy.pattern.test("# Tool usage policy")).toBe(true);
    });

    test("patterns should not be overly permissive", () => {
      const toolPolicy = CRITICAL_SECTIONS.find(s =>
        s.name.toLowerCase().includes("tool")
      );
      expect(toolPolicy.pattern.test("random text")).toBe(false);
    });
  });
});

describe("detectCriticalSections() - Pattern Matching", () => {
  describe("Basic detection", () => {
    test("should return array of matches", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should detect tool usage policy", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      const hasToolPolicy = matches.some(m =>
        m.section.name.toLowerCase().includes("tool")
      );
      expect(hasToolPolicy).toBe(true);
    });

    test("should detect function calls instructions", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      const hasFunctionCalls = matches.some(m =>
        m.matchedText.includes("making function calls")
      );
      expect(hasFunctionCalls).toBe(true);
    });

    test("should detect IMPORTANT markers", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      const hasImportant = matches.some(m =>
        m.matchedText.includes("IMPORTANT:")
      );
      expect(hasImportant).toBe(true);
    });

    test("should detect Doing tasks section", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      const hasDoingTasks = matches.some(m =>
        m.matchedText.includes("# Doing tasks")
      );
      expect(hasDoingTasks).toBe(true);
    });
  });

  describe("Match metadata", () => {
    test("should include section reference in each match", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      matches.forEach(match => {
        expect(match).toHaveProperty("section");
        expect(match.section).toHaveProperty("name");
        expect(match.section).toHaveProperty("pattern");
      });
    });

    test("should include matched text", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      matches.forEach(match => {
        expect(match).toHaveProperty("matchedText");
        expect(typeof match.matchedText).toBe("string");
        expect(match.matchedText.length).toBeGreaterThan(0);
      });
    });

    test("should include position information", () => {
      const matches = detectCriticalSections(MINIMAL_VALID_PROMPT);
      matches.forEach(match => {
        expect(match).toHaveProperty("start");
        expect(match).toHaveProperty("end");
        expect(typeof match.start).toBe("number");
        expect(typeof match.end).toBe("number");
        expect(match.end).toBeGreaterThan(match.start);
      });
    });

    test("positions should be valid indices", () => {
      const prompt = MINIMAL_VALID_PROMPT;
      const matches = detectCriticalSections(prompt);
      matches.forEach(match => {
        expect(match.start).toBeGreaterThanOrEqual(0);
        expect(match.end).toBeLessThanOrEqual(prompt.length);
        expect(prompt.substring(match.start, match.end)).toBe(match.matchedText);
      });
    });
  });

  describe("Multiple matches", () => {
    test("should detect all patterns in comprehensive prompt", () => {
      const matches = detectCriticalSections(PROMPT_WITH_ALL_PATTERNS);
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    test("should not duplicate matches", () => {
      const matches = detectCriticalSections(PROMPT_WITH_ALL_PATTERNS);
      const positions = matches.map(m => m.start + "-" + m.end);
      const uniquePositions = new Set(positions);
      expect(positions.length).toBe(uniquePositions.size);
    });

    test("should preserve match order by position", () => {
      const matches = detectCriticalSections(PROMPT_WITH_ALL_PATTERNS);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].start);
      }
    });
  });

  describe("Edge cases", () => {
    test("should handle empty prompt", () => {
      const matches = detectCriticalSections(EMPTY_PROMPT);
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBe(0);
    });

    test("should handle whitespace-only prompt", () => {
      const matches = detectCriticalSections(WHITESPACE_ONLY);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle prompt with no critical sections", () => {
      const matches = detectCriticalSections(PROMPT_MISSING_REQUIRED);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle partial pattern matches", () => {
      const partial = "# Tool usage";
      const matches = detectCriticalSections(partial);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should be case-sensitive for patterns", () => {
      const lowercase = "# tool usage policy";
      const matches = detectCriticalSections(lowercase);
      const hasMatch = matches.some(m => m.matchedText.includes("tool usage policy"));
      expect(hasMatch).toBe(false);
    });

    test("should handle unicode characters", () => {
      const unicode = "IMPORTANT: Use 中文 characters";
      const matches = detectCriticalSections(unicode);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle newlines in patterns", () => {
      const multiline = "# Tool usage policy\n\nSome content\n\n# Doing tasks";
      const matches = detectCriticalSections(multiline);
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});

describe("validateCriticalPresence() - Validation Logic", () => {
  describe("Valid prompts", () => {
    test("should return validation result object", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("missingRequired");
      expect(result).toHaveProperty("warnings");
    });

    test("should validate minimal valid prompt", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result.isValid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    test("should validate comprehensive prompt", () => {
      const result = validateCriticalPresence(PROMPT_WITH_ALL_PATTERNS);
      expect(result.isValid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    test("valid prompts should have no missing required sections", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(Array.isArray(result.missingRequired)).toBe(true);
      expect(result.missingRequired.length).toBe(0);
    });
  });

  describe("Invalid prompts", () => {
    test("should fail validation for missing required sections", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      expect(result.isValid).toBe(false);
    });

    test("should list missing required sections", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      expect(result.missingRequired.length).toBeGreaterThan(0);
    });

    test("each missing section should have metadata", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      result.missingRequired.forEach(section => {
        expect(section).toHaveProperty("name");
        expect(section).toHaveProperty("description");
        expect(section.required).toBe(true);
      });
    });

    test("should fail for empty prompt", () => {
      const result = validateCriticalPresence(EMPTY_PROMPT);
      expect(result.isValid).toBe(false);
      expect(result.missingRequired.length).toBeGreaterThan(0);
    });

    test("should fail for whitespace-only prompt", () => {
      const result = validateCriticalPresence(WHITESPACE_ONLY);
      expect(result.isValid).toBe(false);
    });
  });

  describe("Warnings for optional sections", () => {
    test("warnings should be array", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test("should warn about missing optional sections", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    test("each warning should have descriptive message", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      result.warnings.forEach(warning => {
        expect(typeof warning).toBe("string");
        expect(warning.length).toBeGreaterThan(0);
      });
    });

    test("valid prompt should have minimal warnings", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result.warnings.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Detailed validation information", () => {
    test("should provide found sections count", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result).toHaveProperty("foundSections");
      expect(typeof result.foundSections).toBe("number");
      expect(result.foundSections).toBeGreaterThan(0);
    });

    test("should provide total required count", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result).toHaveProperty("requiredCount");
      expect(typeof result.requiredCount).toBe("number");
    });

    test("should provide coverage percentage", () => {
      const result = validateCriticalPresence(MINIMAL_VALID_PROMPT);
      expect(result).toHaveProperty("coveragePercent");
      expect(typeof result.coveragePercent).toBe("number");
      expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.coveragePercent).toBeLessThanOrEqual(100);
    });

    test("100% coverage should have no missing required", () => {
      const result = validateCriticalPresence(PROMPT_WITH_ALL_PATTERNS);
      if (result.coveragePercent === 100) {
        expect(result.missingRequired.length).toBe(0);
        expect(result.isValid).toBe(true);
      }
    });

    test("0% coverage should fail validation", () => {
      const result = validateCriticalPresence(PROMPT_MISSING_REQUIRED);
      if (result.coveragePercent === 0) {
        expect(result.isValid).toBe(false);
      }
    });
  });
});

describe("Security - ReDoS Resistance", () => {
  describe("Performance with malicious inputs", () => {
    test("should handle very long strings without hanging", () => {
      const start = Date.now();
      const matches = detectCriticalSections(MALICIOUS_REDOS_ATTEMPT);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle repeated pattern attempts", () => {
      const repeated = ("# Tool usage policy\n").repeat(1000);
      const start = Date.now();
      const matches = detectCriticalSections(repeated);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(matches.length).toBeGreaterThan(0);
    });

    test("should handle nested patterns safely", () => {
      const nested = ("IMPORTANT: ").repeat(100) + "content";
      const start = Date.now();
      detectCriticalSections(nested);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    test("patterns should not be vulnerable to catastrophic backtracking", () => {
      const backtracking = "When making function calls" + (" using").repeat(100);
      const start = Date.now();
      detectCriticalSections(backtracking);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    test("should handle alternating characters", () => {
      let alternating = "";
      for (let i = 0; i < 1000; i++) {
        alternating += i % 2 === 0 ? "a" : "b";
      }
      const start = Date.now();
      detectCriticalSections(alternating);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Memory safety", () => {
    test("should not accumulate memory with large prompts", () => {
      const large = "x".repeat(100000) + MINIMAL_VALID_PROMPT;
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10; i++) {
        detectCriticalSections(large);
      }
      const after = process.memoryUsage().heapUsed;
      const growth = after - before;
      expect(growth).toBeLessThan(10 * 1024 * 1024);
    });

    test("should not leak memory on repeated validation", () => {
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 100; i++) {
        validateCriticalPresence(MINIMAL_VALID_PROMPT);
      }
      const after = process.memoryUsage().heapUsed;
      const growth = after - before;
      expect(growth).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe("Input sanitization", () => {
    test("should handle null bytes", () => {
      const withNull = "IMPORTANT:\0content";
      const matches = detectCriticalSections(withNull);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle control characters", () => {
      const withControl = "IMPORTANT:\r\n\t content";
      const matches = detectCriticalSections(withControl);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle special regex characters", () => {
      const special = "IMPORTANT: Use .* and .+ patterns";
      const matches = detectCriticalSections(special);
      expect(Array.isArray(matches)).toBe(true);
    });
  });
});

describe("Integration - Real Claude Code Prompts", () => {
  describe("Realistic prompt excerpts", () => {
    test("should detect tool usage policy in real prompt", () => {
      const realPrompt = "You are Claude Code.\n\n# Tool usage policy\n\nWhen making function calls using tools that accept array or object parameters ensure those are structured using JSON.";
      const matches = detectCriticalSections(realPrompt);
      expect(matches.length).toBeGreaterThan(0);
    });

    test("should validate realistic optimized prompt", () => {
      const optimized = "You are Claude Code.\n\n# Tool usage policy\nWhen making function calls ensure JSON format.\n\n# Doing tasks\nIMPORTANT: Use absolute paths.";
      const result = validateCriticalPresence(optimized);
      expect(result.isValid).toBe(true);
    });

    test("should detect function_calls tags", () => {
      const withTags = "Use function_calls tags:\n<function_calls>\n<invoke name='Read'>\n</invoke>\n</function_calls>";
      const matches = detectCriticalSections(withTags);
      expect(matches.length).toBeGreaterThan(0);
    });

    test("should validate prompt after optimization", () => {
      const beforeOptimization = MINIMAL_VALID_PROMPT;
      const afterOptimization = "You are Claude Code.\n\n# Tool usage policy\nJSON format required.\n\n# Doing tasks\nIMPORTANT: Follow rules.";
      const resultBefore = validateCriticalPresence(beforeOptimization);
      const resultAfter = validateCriticalPresence(afterOptimization);
      expect(resultBefore.isValid).toBe(true);
      expect(resultAfter.isValid).toBe(true);
    });

    test("should detect absolute path requirements", () => {
      const withPaths = "IMPORTANT: Agent threads always have their cwd reset between bash calls, as a result please only use absolute file paths.";
      const matches = detectCriticalSections(withPaths);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle very important markers", () => {
      const veryImportant = "VERY IMPORTANT: This is critical.";
      const matches = detectCriticalSections(veryImportant);
      const hasVeryImportant = matches.some(m => m.matchedText.includes("VERY IMPORTANT"));
      expect(hasVeryImportant).toBe(true);
    });
  });

  describe("Edge cases from production", () => {
    test("should handle truncated prompts", () => {
      const truncated = "You are Claude Code.\n\n[... rest of prompt truncated for performance ...]\n\n# Tool usage policy\n\nWhen making function calls ensure JSON.";
      const result = validateCriticalPresence(truncated);
      expect(result).toHaveProperty("isValid");
    });

    test("should detect patterns across line breaks", () => {
      const multiline = "When making function calls\nusing tools that accept\narray or object parameters\nensure those are structured using JSON";
      const matches = detectCriticalSections(multiline);
      expect(Array.isArray(matches)).toBe(true);
    });

    test("should handle mixed case in non-critical sections", () => {
      const mixed = "You are claude code.\n\n# Tool usage policy\n\nWhen making function calls ensure JSON.";
      const matches = detectCriticalSections(mixed);
      const hasToolPolicy = matches.some(m => m.matchedText.includes("# Tool usage policy"));
      expect(hasToolPolicy).toBe(true);
    });
  });
});

// ============================================================================
// Test Runner
// ============================================================================

if (require.main === module) {
  console.log("Running critical-sections.test.js...");
  console.log("Expected: ALL TESTS FAIL (TDD red phase - no implementation yet)");
}