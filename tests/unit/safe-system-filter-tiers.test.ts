/**
 * Unit tests for safe-system-filter.ts tier configurations (Issue #34)
 *
 * Tests enhanced tier-based filtering with token budgets and auto-tier selection.
 *
 * Expected: ALL TESTS FAIL (TDD red phase - enhanced implementation doesn't exist yet)
 */

import {
  OptimizationTier,
  FilterOptions,
  FilterResult,
  filterSystemPrompt,
  estimateTokens,
  selectTierForPrompt,
} from "../../src/safe-system-filter";

// Test Data - Mock Prompts with varying sizes
const SMALL_PROMPT = `You are Claude Code.

# Tool usage policy

Use JSON format.`;

const MEDIUM_PROMPT = `You are Claude Code, Anthropic's official CLI.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

# Security

NEVER execute untrusted code without user permission.

# Doing tasks

IMPORTANT: Always use absolute paths for file operations.

# Error handling

Handle errors gracefully and report them clearly.

# Examples

Example 1: Reading a file
Example 2: Writing content
Example 3: Error recovery`;

const LARGE_PROMPT =
  MEDIUM_PROMPT.repeat(10) +
  "\n\n# Additional verbose explanations\n" +
  "Details here.\n".repeat(100);

const VERY_LARGE_PROMPT =
  MEDIUM_PROMPT.repeat(50) +
  "\n\n# Extensive documentation\n" +
  "More content.\n".repeat(500);

// Test Suite: Tier Token Budget Configuration
describe("Tier Token Budget Configuration", () => {
  describe("MINIMAL tier (12-15k tokens)", () => {
    test("should target 12-15k token range for MINIMAL tier", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      const tokens = result.stats.filteredTokens;
      // Should reduce very large prompts to ~12-15k range
      expect(tokens).toBeLessThanOrEqual(16000); // Allow 1k buffer
      expect(tokens).toBeGreaterThan(0);
    });

    test("MINIMAL tier should preserve most content", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      // Should have minimal reduction (deduplication only)
      expect(result.stats.reductionPercent).toBeLessThan(30);
    });

    test("MINIMAL tier should apply deduplication only", () => {
      const duplicatedPrompt = MEDIUM_PROMPT + "\n\n" + MEDIUM_PROMPT;
      const result = filterSystemPrompt(duplicatedPrompt, {
        tier: OptimizationTier.MINIMAL,
      });

      // Should detect and remove duplicates
      expect(result.filteredPrompt.length).toBeLessThan(
        duplicatedPrompt.length
      );
    });

    test("MINIMAL tier should preserve all priority levels (P0/P1/P2)", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      // Should preserve examples (P2) in MINIMAL tier
      if (LARGE_PROMPT.includes("Example")) {
        expect(result.filteredPrompt).toContain("Example");
      }
    });
  });

  describe("MODERATE tier (8-10k tokens)", () => {
    test("should target 8-10k token range for MODERATE tier", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      const tokens = result.stats.filteredTokens;
      expect(tokens).toBeLessThanOrEqual(11000); // Allow 1k buffer
      expect(tokens).toBeGreaterThan(0);
    });

    test("MODERATE tier should remove tier 3 sections", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      // Should have moderate reduction
      expect(result.stats.reductionPercent).toBeGreaterThan(20);
      expect(result.stats.reductionPercent).toBeLessThan(70);
    });

    test("MODERATE tier should condense examples", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      // Examples might be condensed but P0/P1 preserved
      expect(result.validation.isValid).toBe(true);
    });

    test("MODERATE tier should preserve P0 and P1 patterns", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.filteredPrompt).toContain("Tool usage policy");
      expect(result.filteredPrompt).toContain("Security");
    });
  });

  describe("AGGRESSIVE tier (4-6k tokens)", () => {
    test("should target 4-6k token range for AGGRESSIVE tier", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      const tokens = result.stats.filteredTokens;
      expect(tokens).toBeLessThanOrEqual(7000); // Allow 1k buffer
      expect(tokens).toBeGreaterThan(0);
    });

    test("AGGRESSIVE tier should remove tiers 2-3 sections", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // Should have significant reduction
      expect(result.stats.reductionPercent).toBeGreaterThan(40);
    });

    test("AGGRESSIVE tier should preserve only P0 patterns", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // P0 must be present
      expect(result.filteredPrompt).toContain("Tool usage policy");

      // P1/P2 might be removed
      expect(result.validation.isValid).toBe(true); // But validation should still pass
    });

    test("AGGRESSIVE tier should use summaries for removed sections", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // Should be significantly shorter
      expect(result.filteredPrompt.length).toBeLessThan(
        MEDIUM_PROMPT.length * 0.6
      );
    });
  });

  describe("EXTREME tier (2-3k tokens)", () => {
    test("should target 2-3k token range for EXTREME tier", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      const tokens = result.stats.filteredTokens;
      expect(tokens).toBeLessThanOrEqual(4000); // Allow 1k buffer
      expect(tokens).toBeGreaterThan(1000); // Minimum viable prompt
    });

    test("EXTREME tier should keep only core + tool schemas", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Maximum reduction
      expect(result.stats.reductionPercent).toBeGreaterThan(60);
    });

    test("EXTREME tier should preserve only P0 critical patterns", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Must have P0 patterns
      expect(result.validation.isValid).toBe(true);
      expect(result.filteredPrompt).toContain("Tool usage policy");
    });

    test("EXTREME tier should have maximum reduction ratio", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Should reduce to minimum viable size
      expect(result.stats.filteredTokens).toBeLessThan(
        result.stats.originalTokens * 0.3
      );
    });
  });
});

// Test Suite: Validation Gate with Enhanced Feedback
describe("Validation Gate with Enhanced Feedback", () => {
  describe("P0 pattern validation", () => {
    test("should catch missing P0 patterns immediately", () => {
      const noToolsPrompt = `# Examples\nSome examples\n# Verbose\nDetails`;
      const result = filterSystemPrompt(noToolsPrompt, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.missingPatterns).toContain(
        "tool-usage-policy-header"
      );
    });

    test("should report which P0 patterns are missing", () => {
      const partialPrompt = `# Tool usage policy\nUse JSON.\n`;
      const result = filterSystemPrompt(partialPrompt, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      if (!result.validation.isValid) {
        expect(result.validation.missingPatterns.length).toBeGreaterThan(0);
        result.validation.missingPatterns.forEach((pattern) => {
          expect(typeof pattern).toBe("string");
        });
      }
    });

    test("should list which P0 patterns are present", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.validation.presentPatterns).toBeDefined();
      expect(result.validation.presentPatterns.length).toBeGreaterThan(0);
    });
  });

  describe("Validation failure triggers fallback", () => {
    test("should trigger fallback when P0 patterns removed", () => {
      // Simulate aggressive filtering that might break tool calling
      const result = filterSystemPrompt(SMALL_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      // Either validation passes or fallback occurred
      expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
    });

    test("should try next less aggressive tier on validation failure", () => {
      const result = filterSystemPrompt(SMALL_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      if (result.fallbackOccurred) {
        // Should have fallen back to AGGRESSIVE, MODERATE, or MINIMAL
        expect([
          OptimizationTier.AGGRESSIVE,
          OptimizationTier.MODERATE,
          OptimizationTier.MINIMAL,
        ]).toContain(result.appliedTier);
      }
    });

    test("should track fallback chain in result", () => {
      const result = filterSystemPrompt(SMALL_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      expect(result).toHaveProperty("fallbackOccurred");
      expect(result).toHaveProperty("appliedTier");

      if (result.fallbackOccurred) {
        expect(result.appliedTier).not.toBe(OptimizationTier.EXTREME);
      }
    });
  });

  describe("Validation provides detailed feedback", () => {
    test("should report coverage percentage", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.validation).toHaveProperty("coveragePercent");
      expect(result.validation.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.validation.coveragePercent).toBeLessThanOrEqual(100);
    });

    test("should separate P0/P1/P2 missing patterns in feedback", () => {
      const partialPrompt = `# Tool usage policy\nJSON format`;
      const result = filterSystemPrompt(partialPrompt, {
        tier: OptimizationTier.MINIMAL,
      });

      // Should be able to identify which priority levels are missing
      expect(result.validation.missingPatterns).toBeDefined();
    });
  });
});

// Test Suite: Auto-Tier Selection
describe("Auto-Tier Selection", () => {
  describe("selectTierForPrompt() function", () => {
    test("should select MINIMAL for prompts <18k tokens", () => {
      const tokens = 15000;
      const tier = selectTierForPrompt(tokens);
      expect(tier).toBe(OptimizationTier.MINIMAL);
    });

    test("should select MODERATE for prompts 18k-25k tokens", () => {
      const tokens = 20000;
      const tier = selectTierForPrompt(tokens);
      expect(tier).toBe(OptimizationTier.MODERATE);
    });

    test("should select AGGRESSIVE for prompts 25k-40k tokens", () => {
      const tokens = 30000;
      const tier = selectTierForPrompt(tokens);
      expect(tier).toBe(OptimizationTier.AGGRESSIVE);
    });

    test("should select EXTREME for prompts >40k tokens", () => {
      const tokens = 50000;
      const tier = selectTierForPrompt(tokens);
      expect(tier).toBe(OptimizationTier.EXTREME);
    });

    test("should handle edge cases at tier boundaries", () => {
      expect(selectTierForPrompt(18000)).toBe(OptimizationTier.MODERATE);
      expect(selectTierForPrompt(17999)).toBe(OptimizationTier.MINIMAL);
      expect(selectTierForPrompt(25000)).toBe(OptimizationTier.AGGRESSIVE);
      expect(selectTierForPrompt(24999)).toBe(OptimizationTier.MODERATE);
    });

    test("should handle very small prompts", () => {
      const tier = selectTierForPrompt(100);
      expect(tier).toBe(OptimizationTier.MINIMAL);
    });

    test("should handle extremely large prompts", () => {
      const tier = selectTierForPrompt(100000);
      expect(tier).toBe(OptimizationTier.EXTREME);
    });
  });

  describe("Auto-tier in filterSystemPrompt", () => {
    test("should use auto-tier when tier: 'auto' specified", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: "auto" as any,
      });

      expect(result.appliedTier).toBeDefined();
      expect([
        OptimizationTier.MINIMAL,
        OptimizationTier.MODERATE,
        OptimizationTier.AGGRESSIVE,
        OptimizationTier.EXTREME,
      ]).toContain(result.appliedTier);
    });

    test("should select appropriate tier based on prompt size", () => {
      const smallResult = filterSystemPrompt(SMALL_PROMPT, {
        tier: "auto" as any,
      });
      const largeResult = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: "auto" as any,
      });

      // Small prompt should use less aggressive tier than large prompt
      const tierOrder = [
        OptimizationTier.MINIMAL,
        OptimizationTier.MODERATE,
        OptimizationTier.AGGRESSIVE,
        OptimizationTier.EXTREME,
      ];

      const smallIndex = tierOrder.indexOf(smallResult.appliedTier);
      const largeIndex = tierOrder.indexOf(largeResult.appliedTier);

      expect(smallIndex).toBeLessThanOrEqual(largeIndex);
    });
  });
});

// Test Suite: Token Budget Enforcement
describe("Token Budget Enforcement", () => {
  describe("maxTokens option overrides tier defaults", () => {
    test("should respect maxTokens even if tier allows more", () => {
      const result = filterSystemPrompt(LARGE_PROMPT, {
        tier: OptimizationTier.MINIMAL,
        maxTokens: 5000,
      });

      expect(result.stats.filteredTokens).toBeLessThanOrEqual(5000);
    });

    test("should not exceed maxTokens for any tier", () => {
      const tiers = [
        OptimizationTier.MINIMAL,
        OptimizationTier.MODERATE,
        OptimizationTier.AGGRESSIVE,
        OptimizationTier.EXTREME,
      ];

      tiers.forEach((tier) => {
        const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
          tier,
          maxTokens: 3000,
        });

        expect(result.stats.filteredTokens).toBeLessThanOrEqual(3000);
      });
    });

    test("should preserve critical sections even with tight maxTokens", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.EXTREME,
        maxTokens: 500,
      });

      // Should still pass validation (P0 patterns present)
      expect(result.validation.isValid || result.fallbackOccurred).toBe(true);
    });
  });

  describe("Token budget per tier is respected", () => {
    test("MINIMAL tier should not exceed ~15k tokens", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.MINIMAL,
      });

      expect(result.stats.filteredTokens).toBeLessThanOrEqual(16000);
    });

    test("MODERATE tier should not exceed ~10k tokens", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      expect(result.stats.filteredTokens).toBeLessThanOrEqual(11000);
    });

    test("AGGRESSIVE tier should not exceed ~6k tokens", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      expect(result.stats.filteredTokens).toBeLessThanOrEqual(7000);
    });

    test("EXTREME tier should not exceed ~3k tokens", () => {
      const result = filterSystemPrompt(VERY_LARGE_PROMPT, {
        tier: OptimizationTier.EXTREME,
      });

      expect(result.stats.filteredTokens).toBeLessThanOrEqual(4000);
    });
  });
});

// Test Suite: Section Dependency Detection
describe("Section Dependency Detection", () => {
  describe("Detect dependent sections", () => {
    test("should identify tool schemas depend on tool usage policy", () => {
      const promptWithSchema = `# Tool usage policy\nJSON format\n\n# Tool: Read\nfile_path: string`;
      const result = filterSystemPrompt(promptWithSchema, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // If tool schemas present, tool usage policy must be present
      if (result.filteredPrompt.includes("Tool:")) {
        expect(result.filteredPrompt).toContain("Tool usage policy");
      }
    });

    test("should preserve dependency chains", () => {
      const result = filterSystemPrompt(MEDIUM_PROMPT, {
        tier: OptimizationTier.MODERATE,
      });

      // Dependencies should be tracked in result
      expect(result.preservedSections).toBeDefined();
    });

    test("should warn if dependent section removed but dependency kept", () => {
      const promptWithOrphan = `# Tool: Read\nfile_path: string\n# Examples\nSome examples`;
      const result = filterSystemPrompt(promptWithOrphan, {
        tier: OptimizationTier.AGGRESSIVE,
      });

      // Should either keep both or remove both
      expect(result.validation).toBeDefined();
    });
  });
});

// Test Suite: Performance with Different Sizes
describe("Performance with Different Prompt Sizes", () => {
  test("should process small prompts (<1k tokens) in <50ms", () => {
    const start = Date.now();
    filterSystemPrompt(SMALL_PROMPT, { tier: OptimizationTier.MINIMAL });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test("should process medium prompts (1-5k tokens) in <100ms", () => {
    const start = Date.now();
    filterSystemPrompt(MEDIUM_PROMPT, { tier: OptimizationTier.MODERATE });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  test("should process large prompts (5-20k tokens) in <500ms", () => {
    const start = Date.now();
    filterSystemPrompt(LARGE_PROMPT, { tier: OptimizationTier.AGGRESSIVE });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  test("should process very large prompts (20k+ tokens) in <2000ms", () => {
    const start = Date.now();
    filterSystemPrompt(VERY_LARGE_PROMPT, { tier: OptimizationTier.EXTREME });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});

// Test Suite: Edge Cases for Tier Filtering
describe("Edge Cases for Tier Filtering", () => {
  test("should handle prompt with only P0 content", () => {
    const p0Only = `# Tool usage policy\nJSON format\n# Doing tasks\nIMPORTANT`;
    const result = filterSystemPrompt(p0Only, {
      tier: OptimizationTier.EXTREME,
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.fallbackOccurred).toBe(false);
  });

  test("should handle prompt with no filterable content", () => {
    const allCritical = `# Tool usage policy\nJSON\n# Security\nIMPORTANT`;
    const result = filterSystemPrompt(allCritical, {
      tier: OptimizationTier.AGGRESSIVE,
    });

    // Should not reduce much since all critical
    expect(result.stats.reductionPercent).toBeLessThan(50);
  });

  test("should handle empty sections gracefully", () => {
    const emptySections = `# Tool usage policy\n\n# Security\n\n# Examples\n`;
    const result = filterSystemPrompt(emptySections, {
      tier: OptimizationTier.MODERATE,
    });

    expect(result.validation.isValid).toBe(false); // Missing content
  });

  test("should handle malformed markdown", () => {
    const malformed = `##Tool usage policy\nJSON\n###Security\nContent`;
    expect(() =>
      filterSystemPrompt(malformed, { tier: OptimizationTier.MINIMAL })
    ).not.toThrow();
  });
});
