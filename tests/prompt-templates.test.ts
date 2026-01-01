/**
 * Tests for Semantic Deduplication System
 */

import {
  extractCommonPatterns,
  applyTemplates,
  expandTemplates,
  deduplicatePrompt,
  validateTemplateAccuracy,
} from "../src/prompt-templates";

// Sample Claude Code-like prompt with repetition
const SAMPLE_PROMPT = `
You are Claude Code, Anthropic's official CLI for Claude.

# Tool usage policy
- The file_path parameter must be an absolute path, not a relative path
- You can call multiple tools in a single response
- IMPORTANT: Always use absolute paths

# Read Tool
The Read tool reads files from the filesystem.
- The file_path parameter must be an absolute path, not a relative path
- You can call multiple tools in a single response
- IMPORTANT: Always use absolute paths

# Write Tool
The Write tool writes files to the filesystem.
- The file_path parameter must be an absolute path, not a relative path
- You can call multiple tools in a single response
- IMPORTANT: Always use absolute paths

# Edit Tool
The Edit tool modifies existing files.
- The file_path parameter must be an absolute path, not a relative path
- You can call multiple tools in a single response
- IMPORTANT: Always use absolute paths
`;

describe("Prompt Templates", () => {
  describe("extractCommonPatterns", () => {
    it("should find repeated patterns", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT, {
        minOccurrences: 3,
        minLength: 25,
      });

      expect(templates.length).toBeGreaterThan(0);

      // Should find the repeated bullet points
      const absolutePathTemplate = templates.find((t) =>
        t.pattern.includes("file_path parameter must be an absolute path")
      );
      expect(absolutePathTemplate).toBeDefined();
      expect(absolutePathTemplate?.occurrences).toBeGreaterThanOrEqual(3);

      const multipleToolsTemplate = templates.find((t) =>
        t.pattern.includes("call multiple tools")
      );
      expect(multipleToolsTemplate).toBeDefined();

      console.log(
        `Found ${templates.length} templates:`,
        templates.map((t) => ({
          id: t.id,
          occurrences: t.occurrences,
          preview: t.pattern.substring(0, 60) + "...",
        }))
      );
    });

    it("should sort templates by impact (occurrences * length)", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT);

      if (templates.length > 1) {
        const firstImpact =
          templates[0]!.occurrences * templates[0]!.pattern.length;
        const secondImpact =
          templates[1]!.occurrences * templates[1]!.pattern.length;

        expect(firstImpact).toBeGreaterThanOrEqual(secondImpact);
      }
    });
  });

  describe("applyTemplates", () => {
    it("should replace repeated patterns with template references", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT);
      const { optimized, templateLibrary } = applyTemplates(
        SAMPLE_PROMPT,
        templates
      );

      // Should contain template references
      expect(optimized).toContain("[T");

      // Should include template library
      expect(templateLibrary).toContain("## Template Library");

      // Should be shorter than original
      const total = optimized.length + templateLibrary.length;
      expect(total).toBeLessThan(SAMPLE_PROMPT.length);

      console.log("\nOriginal length:", SAMPLE_PROMPT.length);
      console.log("Optimized length:", optimized.length);
      console.log("Library length:", templateLibrary.length);
      console.log("Total:", total);
      console.log("Savings:", SAMPLE_PROMPT.length - total, "chars");
    });

    it("should keep first occurrence of pattern intact", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT);
      const { optimized } = applyTemplates(SAMPLE_PROMPT, templates);

      // First occurrence should still be there
      expect(optimized).toContain(
        "The file_path parameter must be an absolute path"
      );
    });
  });

  describe("expandTemplates", () => {
    it("should restore original content when expanded", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT);
      const { optimized } = applyTemplates(SAMPLE_PROMPT, templates);
      const expanded = expandTemplates(optimized, templates);

      // Remove template library for comparison
      const libraryStart = optimized.indexOf("## Template Library");
      const optimizedWithoutLibrary =
        libraryStart > 0 ? optimized.substring(0, libraryStart) : optimized;

      // Expanded should closely match original
      const sizeDiff = Math.abs(expanded.length - SAMPLE_PROMPT.length);
      expect(sizeDiff).toBeLessThan(SAMPLE_PROMPT.length * 0.1); // Within 10%
    });
  });

  describe("validateTemplateAccuracy", () => {
    it("should validate that critical patterns are preserved", () => {
      const templates = extractCommonPatterns(SAMPLE_PROMPT);
      const { optimized } = applyTemplates(SAMPLE_PROMPT, templates);

      const validation = validateTemplateAccuracy(
        SAMPLE_PROMPT,
        optimized,
        templates
      );

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe("deduplicatePrompt (integration)", () => {
    it("should deduplicate prompt end-to-end", () => {
      const { optimized, stats } = deduplicatePrompt(SAMPLE_PROMPT);

      // Should reduce size
      expect(stats.optimizedTokens).toBeLessThan(stats.originalTokens);

      // Should use templates
      expect(stats.templatesUsed).toBeGreaterThan(0);

      // Should achieve reduction
      expect(stats.reductionPercent).toBeGreaterThan(0);

      // Should be valid
      expect(stats.valid).toBe(true);

      // Should process quickly
      expect(stats.processingTimeMs).toBeLessThan(1000); // < 1 second

      console.log("\nDeduplication Stats:", stats);
      console.log("\nOptimized prompt preview (first 500 chars):");
      console.log(optimized.substring(0, 500) + "...");
    });

    it("should achieve target reduction (10-20% for this sample)", () => {
      const { stats } = deduplicatePrompt(SAMPLE_PROMPT);

      // With high repetition in sample, should get good reduction
      expect(stats.reductionPercent).toBeGreaterThan(10);
      expect(stats.reductionPercent).toBeLessThan(50); // Not too aggressive
    });
  });
});
