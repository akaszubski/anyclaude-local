/**
 * Semantic Deduplication System for Claude Code System Prompts
 *
 * Extracts repetitive patterns and replaces them with template references
 * to reduce token count while preserving semantic meaning.
 *
 * Strategy:
 * 1. Identify phrases appearing 3+ times in system prompt
 * 2. Create template library with parameterized versions
 * 3. Replace occurrences with template references
 * 4. Provide expansion function for model consumption
 *
 * Expected Gain: 17% reduction (18k → 15k tokens)
 */

import { debug } from "./debug";

/**
 * Template definition with pattern matching
 */
export interface PromptTemplate {
  id: string;
  pattern: string;
  template: string;
  occurrences: number;
  parameters?: string[];
}

/**
 * Configuration for pattern extraction
 */
interface ExtractionConfig {
  minOccurrences: number; // Minimum times a pattern must appear
  minLength: number; // Minimum character length to extract
  maxLength: number; // Maximum character length to extract
  ignorePatterns: RegExp[]; // Patterns to skip (e.g., code blocks)
}

const DEFAULT_CONFIG: ExtractionConfig = {
  minOccurrences: 3,
  minLength: 25,
  maxLength: 300,
  ignorePatterns: [
    /<function_calls>.*?<\/antml:function_calls>/gs,
    /```.*?```/gs,
    /<example>.*?<\/example>/gs,
  ],
};

/**
 * Extract common patterns from system prompt
 */
export function extractCommonPatterns(
  prompt: string,
  config: Partial<ExtractionConfig> = {}
): PromptTemplate[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const templates: PromptTemplate[] = [];

  // Remove ignored patterns temporarily
  let cleanedPrompt = prompt;
  const ignoredSections: string[] = [];
  cfg.ignorePatterns.forEach((pattern) => {
    cleanedPrompt = cleanedPrompt.replace(pattern, (match) => {
      const placeholder = `__IGNORED_${ignoredSections.length}__`;
      ignoredSections.push(match);
      return placeholder;
    });
  });

  // Find repeated n-grams (sequences of words)
  const phraseMap = new Map<string, number>();

  // Extract sentences and common phrases
  const sentences = cleanedPrompt.split(/[.!?]\s+/);

  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (trimmed.length >= cfg.minLength && trimmed.length <= cfg.maxLength) {
      phraseMap.set(trimmed, (phraseMap.get(trimmed) || 0) + 1);
    }

    // Also extract multi-line patterns (bullet points, instructions)
    const lines = trimmed.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (
        line &&
        line.length >= cfg.minLength &&
        line.length <= cfg.maxLength
      ) {
        phraseMap.set(line, (phraseMap.get(line) || 0) + 1);
      }

      // Try 2-line and 3-line combinations for common instruction blocks
      if (i < lines.length - 1) {
        const twoLines = [lines[i], lines[i + 1]].join("\n").trim();
        if (
          twoLines.length >= cfg.minLength &&
          twoLines.length <= cfg.maxLength
        ) {
          phraseMap.set(twoLines, (phraseMap.get(twoLines) || 0) + 1);
        }
      }
    }
  });

  // Filter to only frequently occurring patterns
  const frequentPatterns = Array.from(phraseMap.entries())
    .filter(([_, count]) => count >= cfg.minOccurrences)
    .sort((a, b) => {
      // Sort by: (occurrences * length) to prioritize high-impact patterns
      const scoreA = a[1] * a[0].length;
      const scoreB = b[1] * b[0].length;
      return scoreB - scoreA;
    });

  // Create templates
  frequentPatterns.forEach(([pattern, occurrences], idx) => {
    // Check if this pattern is a substring of a longer pattern we've already added
    const isSubstring = templates.some((t) => t.pattern.includes(pattern));
    if (isSubstring) return;

    // Detect parameters (words in curly braces or common variations)
    const parameters = extractParameters(pattern);

    templates.push({
      id: `T${idx + 1}`,
      pattern,
      template:
        parameters.length > 0
          ? parameterizePattern(pattern, parameters)
          : pattern,
      occurrences,
      parameters,
    });
  });

  debug(
    2,
    `[Template Extraction] Found ${templates.length} common patterns (${frequentPatterns.length} candidates)`
  );

  return templates;
}

/**
 * Extract parameter placeholders from a pattern
 */
function extractParameters(pattern: string): string[] {
  const params: string[] = [];

  // Common parameter patterns in Claude Code prompts
  const paramPatterns = [
    /\{(\w+)\}/g, // {param}
    /`([a-z_]+)`/g, // `file_path`
    /<(\w+)>/g, // <tool>
    /the (\w+) (parameter|tool|file)/gi, // "the file_path parameter"
  ];

  paramPatterns.forEach((regex) => {
    let match;
    while ((match = regex.exec(pattern)) !== null) {
      if (match[1] && !params.includes(match[1])) {
        params.push(match[1]);
      }
    }
  });

  return params;
}

/**
 * Convert pattern to parameterized template
 */
function parameterizePattern(pattern: string, parameters: string[]): string {
  let template = pattern;

  parameters.forEach((param) => {
    // Replace specific instances with generic {param} placeholder
    const variations = [
      new RegExp(`\\b${param}\\b`, "g"),
      new RegExp(`\`${param}\``, "g"),
      new RegExp(`<${param}>`, "g"),
    ];

    variations.forEach((regex) => {
      template = template.replace(regex, `{${param}}`);
    });
  });

  return template;
}

/**
 * Apply templates to system prompt (replace patterns with references)
 */
export function applyTemplates(
  prompt: string,
  templates: PromptTemplate[]
): { optimized: string; templateLibrary: string } {
  let optimized = prompt;
  const usedTemplates: PromptTemplate[] = [];

  // Sort templates by length (longest first) to avoid partial replacements
  const sortedTemplates = [...templates].sort(
    (a, b) => b.pattern.length - a.pattern.length
  );

  sortedTemplates.forEach((template) => {
    const regex = new RegExp(
      template.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );

    let replacementCount = 0;
    optimized = optimized.replace(regex, (match) => {
      replacementCount++;
      // Keep first occurrence, replace subsequent ones with reference
      if (replacementCount === 1) {
        return match; // Keep original for context
      }
      return `[${template.id}]`;
    });

    if (replacementCount > 1) {
      usedTemplates.push(template);
    }
  });

  // Build template library section
  const templateLibrary = buildTemplateLibrary(usedTemplates);

  // Calculate savings
  const originalSize = prompt.length;
  const optimizedSize = optimized.length + templateLibrary.length;
  const savings = originalSize - optimizedSize;
  const savingsPercent = ((savings / originalSize) * 100).toFixed(1);

  debug(
    1,
    `[Template Application] Applied ${usedTemplates.length} templates, saved ${savings} chars (${savingsPercent}%)`
  );

  return {
    optimized,
    templateLibrary,
  };
}

/**
 * Build template library section for prompt
 */
function buildTemplateLibrary(templates: PromptTemplate[]): string {
  if (templates.length === 0) return "";

  let library = "\n\n## Template Library\n\n";
  library +=
    "The following templates are used throughout this prompt for brevity:\n\n";

  templates.forEach((template) => {
    library += `**[${template.id}]**: ${template.template}\n`;
    if (template.parameters && template.parameters.length > 0) {
      library += `  Parameters: ${template.parameters.join(", ")}\n`;
    }
    library += "\n";
  });

  return library;
}

/**
 * Expand template references back to full text (for debugging/analysis)
 */
export function expandTemplates(
  optimized: string,
  templates: PromptTemplate[]
): string {
  let expanded = optimized;

  templates.forEach((template) => {
    const regex = new RegExp(`\\[${template.id}\\]`, "g");
    expanded = expanded.replace(regex, template.pattern);
  });

  return expanded;
}

/**
 * Validate that template application preserves semantic meaning
 */
export function validateTemplateAccuracy(
  original: string,
  optimized: string,
  templates: PromptTemplate[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Expand optimized back to original
  const expanded = expandTemplates(optimized, templates);

  // Remove template library section from optimized for comparison
  const libraryStart = optimized.indexOf("## Template Library");
  const optimizedWithoutLibrary =
    libraryStart > 0 ? optimized.substring(0, libraryStart) : optimized;

  // Check that all critical sections are preserved
  const criticalPatterns = [
    "You are Claude Code",
    "# Tool usage policy",
    "# Doing tasks",
    "IMPORTANT:",
    "VERY IMPORTANT:",
  ];

  criticalPatterns.forEach((pattern) => {
    if (
      original.includes(pattern) &&
      !optimizedWithoutLibrary.includes(pattern)
    ) {
      errors.push(`Critical pattern missing: "${pattern}"`);
    }
  });

  // Check that expansion roughly matches original size
  const sizeDifference = Math.abs(expanded.length - original.length);
  const tolerance = original.length * 0.05; // 5% tolerance

  if (sizeDifference > tolerance) {
    errors.push(
      `Expansion size mismatch: ${sizeDifference} chars difference (>${tolerance} tolerance)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Main entry point: Apply semantic deduplication to system prompt
 */
export function deduplicatePrompt(
  prompt: string,
  config?: Partial<ExtractionConfig>
): { optimized: string; stats: DeduplicationStats } {
  const startTime = Date.now();

  // Extract common patterns
  const templates = extractCommonPatterns(prompt, config);

  // Apply templates
  const { optimized, templateLibrary } = applyTemplates(prompt, templates);

  // Add template library to prompt
  const finalPrompt = optimized + templateLibrary;

  // Validate
  const validation = validateTemplateAccuracy(prompt, optimized, templates);

  const stats: DeduplicationStats = {
    originalTokens: Math.floor(prompt.length / 4),
    optimizedTokens: Math.floor(finalPrompt.length / 4),
    templatesUsed: templates.length,
    reductionPercent:
      ((prompt.length - finalPrompt.length) / prompt.length) * 100,
    processingTimeMs: Date.now() - startTime,
    valid: validation.valid,
    errors: validation.errors,
  };

  debug(
    1,
    `[Semantic Dedup] ${stats.originalTokens} → ${stats.optimizedTokens} tokens (${stats.reductionPercent.toFixed(1)}% reduction)`
  );

  if (!stats.valid) {
    debug(1, `[Semantic Dedup] Validation errors:`, stats.errors);
  }

  return {
    optimized: finalPrompt,
    stats,
  };
}

/**
 * Statistics from deduplication process
 */
export interface DeduplicationStats {
  originalTokens: number;
  optimizedTokens: number;
  templatesUsed: number;
  reductionPercent: number;
  processingTimeMs: number;
  valid: boolean;
  errors: string[];
}
