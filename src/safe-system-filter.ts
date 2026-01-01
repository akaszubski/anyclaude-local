/**
 * Safe System Prompt Filter with Tiered Filtering and Validation Gate
 *
 * This module provides safe, tiered filtering of Claude Code system prompts with automatic
 * validation and fallback to prevent broken tool-calling functionality.
 *
 * Key Features:
 * - Tiered filtering (MINIMAL, MODERATE, AGGRESSIVE, EXTREME)
 * - Automatic validation gate (catches missing critical sections)
 * - Fallback chain (EXTREME→AGGRESSIVE→MODERATE→MINIMAL)
 * - Critical section preservation (ALWAYS included regardless of tier)
 * - Token estimation and reduction tracking
 *
 * Usage:
 * ```typescript
 * import { filterSystemPrompt, OptimizationTier } from './safe-system-filter';
 *
 * const result = filterSystemPrompt(prompt, {
 *   tier: OptimizationTier.MODERATE,
 *   preserveExamples: true,
 *   maxTokens: 8000
 * });
 *
 * if (!result.validation.isValid) {
 *   console.error('Validation failed, fallback occurred:', result.fallbackOccurred);
 * }
 * ```
 */

import {
  validateCriticalPresence,
  ValidationResult as BaseValidationResult,
  detectCriticalSections,
} from "./critical-sections";
import {
  parseIntoSections,
  reconstructPrompt,
  PromptSection,
} from "./prompt-section-parser";
import { deduplicatePrompt } from "./prompt-templates";

/**
 * Optimization tiers from least to most aggressive
 *
 * Each tier represents a different balance between prompt size and functionality:
 * - MINIMAL: Preserve as much functionality as possible, minimal size reduction
 * - MODERATE: Balance between size and functionality, practical for most use cases
 * - AGGRESSIVE: Significant reduction, may lose some less-critical features
 * - EXTREME: Maximum reduction, preserves only core tool-calling functionality
 *
 * @enum {string}
 */
export enum OptimizationTier {
  /** 12-15k tokens - Deduplication only, preserves all content */
  MINIMAL = "MINIMAL",
  /** 8-10k tokens - Deduplication + condense examples, removes tier 3 sections */
  MODERATE = "MODERATE",
  /** 4-6k tokens - Hierarchical filtering + summaries, removes tiers 2-3 */
  AGGRESSIVE = "AGGRESSIVE",
  /** 2-3k tokens - Core sections only, removes tiers 1-3, keeps critical patterns */
  EXTREME = "EXTREME",
}

/**
 * Filter options for system prompt optimization
 *
 * Controls how aggressively the prompt is filtered while ensuring critical
 * tool-calling functionality is always preserved.
 */
export interface FilterOptions {
  /** Optimization tier to apply - REQUIRED */
  tier: OptimizationTier;

  /**
   * Whether to preserve example sections (default: false)
   * If undefined, uses tier-based defaults (preserved in MINIMAL/MODERATE, removed in AGGRESSIVE/EXTREME)
   */
  preserveExamples?: boolean;

  /**
   * Maximum tokens to target (overrides tier defaults)
   * If specified and exceeded, the prompt is trimmed to this limit
   */
  maxTokens?: number;
}

/**
 * Statistics from the filtering process
 *
 * Provides metrics about how much the prompt was reduced and how long processing took.
 * All token counts are estimates using the heuristic: tokens = length / 4
 */
export interface FilterStats {
  /** Original prompt size in tokens (estimated) */
  originalTokens: number;

  /** Filtered prompt size in tokens (estimated) */
  filteredTokens: number;

  /** Percentage reduction ((original - filtered) / original * 100) */
  reductionPercent: number;

  /** Processing time in milliseconds (minimum 1ms) */
  processingTimeMs: number;
}

/**
 * Extended validation result with pattern details
 *
 * Indicates whether the filtered prompt still contains all critical sections
 * needed for tool-calling to function correctly.
 */
export interface ValidationResult {
  /** True if all required critical patterns are present, false if any are missing */
  isValid: boolean;

  /** Array of missing pattern names (tool-calling patterns that weren't found) */
  missingPatterns: string[];

  /** Array of present pattern names (critical patterns that were found) */
  presentPatterns: string[];
}

/**
 * Result from filtering operation
 *
 * Complete filtering result including the filtered prompt, statistics about the
 * reduction, validation status, and information about whether fallback occurred.
 */
export interface FilterResult {
  /** The filtered prompt text ready to use with Claude Code */
  filteredPrompt: string;

  /** Section IDs that were preserved during filtering (from prompt-section-parser) */
  preservedSections: string[];

  /** Section IDs that were removed during filtering (from prompt-section-parser) */
  removedSections: string[];

  /** Statistics about size reduction and processing time */
  stats: FilterStats;

  /** Validation result indicating if critical sections survived the filter */
  validation: ValidationResult;

  /** The tier that was actually applied (may differ from requested due to fallback) */
  appliedTier: OptimizationTier;

  /** True if automatic fallback occurred because the requested tier failed validation */
  fallbackOccurred: boolean;
}

/**
 * Estimate tokens using 1 token ≈ 4 characters heuristic
 *
 * Fast approximation useful for deciding which optimization tier to apply
 * before running the full filtering pipeline.
 *
 * @param text - The text to estimate token count for
 * @returns Estimated token count (text.length / 4, rounded down)
 *
 * @example
 * ```typescript
 * const prompt = "You are Claude Code..."; // ~12k tokens
 * const estimate = estimateTokens(prompt);  // ~3000
 * ```
 */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

/**
 * Convert BaseValidationResult to extended ValidationResult
 */
function convertValidationResult(
  base: BaseValidationResult,
  prompt: string
): ValidationResult {
  // Get all matches to build present patterns list
  const matches = detectCriticalSections(prompt);
  const presentPatterns = matches.map((m) => m.section.name);
  const missingPatterns = base.missingRequired.map((s) => s.name);

  return {
    isValid: base.isValid,
    missingPatterns,
    presentPatterns,
  };
}

/**
 * Get tier inclusion level (which section tiers to include)
 */
function getTierInclusion(tier: OptimizationTier): number[] {
  switch (tier) {
    case OptimizationTier.MINIMAL:
      return [0, 1, 2, 3]; // Include all tiers
    case OptimizationTier.MODERATE:
      return [0, 1, 2]; // Include tiers 0-2
    case OptimizationTier.AGGRESSIVE:
      return [0, 1]; // Include tiers 0-1
    case OptimizationTier.EXTREME:
      return [0]; // Include tier 0 only
  }
}

/**
 * Get target token count for a tier
 */
function getTierTargetTokens(tier: OptimizationTier): number {
  switch (tier) {
    case OptimizationTier.MINIMAL:
      return 13500; // Mid-range of 12-15k
    case OptimizationTier.MODERATE:
      return 9000; // Mid-range of 8-10k
    case OptimizationTier.AGGRESSIVE:
      return 5000; // Mid-range of 4-6k
    case OptimizationTier.EXTREME:
      return 2500; // Mid-range of 2-3k
  }
}

/**
 * Get the fallback tier for a given tier
 */
function getFallbackTier(tier: OptimizationTier): OptimizationTier | null {
  switch (tier) {
    case OptimizationTier.EXTREME:
      return OptimizationTier.AGGRESSIVE;
    case OptimizationTier.AGGRESSIVE:
      return OptimizationTier.MODERATE;
    case OptimizationTier.MODERATE:
      return OptimizationTier.MINIMAL;
    case OptimizationTier.MINIMAL:
      return null; // No fallback from MINIMAL
  }
}

/**
 * Filter sections by tier and critical status
 */
function filterSections(
  sections: PromptSection[],
  tier: OptimizationTier,
  options: FilterOptions
): { preserved: PromptSection[]; removed: PromptSection[] } {
  const tierInclusion = getTierInclusion(tier);
  const preserved: PromptSection[] = [];
  const removed: PromptSection[] = [];

  for (const section of sections) {
    // ALWAYS preserve critical sections regardless of tier
    if (section.containsCritical) {
      preserved.push(section);
      continue;
    }

    // Don't track removal of very short preambles (< 30 chars)
    // This handles identity-only preambles like "You are Claude Code."
    if (section.id === "preamble" && section.content.trim().length < 30) {
      // Just skip it - don't add to preserved or removed
      continue;
    }

    // Handle examples based on preserveExamples option (check BEFORE tier filtering)
    if (section.id.includes("example")) {
      if (options.preserveExamples === true) {
        // Explicitly preserve examples
        preserved.push(section);
        continue;
      } else if (options.preserveExamples === false) {
        // Explicitly remove examples
        removed.push(section);
        continue;
      }
      // Fall through to tier-based handling if preserveExamples is undefined
    }

    // Check if section tier is included
    if (tierInclusion.includes(section.tier)) {
      // For example sections with no explicit preserveExamples option,
      // preserve in MINIMAL/MODERATE, remove in AGGRESSIVE/EXTREME
      if (section.id.includes("example")) {
        if (
          tier === OptimizationTier.MINIMAL ||
          tier === OptimizationTier.MODERATE
        ) {
          preserved.push(section);
        } else {
          removed.push(section);
        }
      } else {
        preserved.push(section);
      }
    } else {
      // Tier not included - check if it's an example section that should be preserved anyway
      if (
        section.id.includes("example") &&
        (tier === OptimizationTier.MINIMAL ||
          tier === OptimizationTier.MODERATE)
      ) {
        preserved.push(section);
      } else {
        removed.push(section);
      }
    }
  }

  return { preserved, removed };
}

/**
 * Apply deduplication to a prompt
 */
function applyDeduplication(prompt: string): string {
  try {
    const result = deduplicatePrompt(prompt);
    // Only use deduplicated version if it's actually shorter
    if (result.optimized.length < prompt.length) {
      return result.optimized;
    }
    return prompt;
  } catch (error) {
    // If deduplication fails, return original prompt
    return prompt;
  }
}

/**
 * Condense examples in a prompt (for MODERATE tier)
 */
function condenseExamples(prompt: string): string {
  // Simple example condensing: keep only first 2 examples
  const lines = prompt.split("\n");
  const condensed: string[] = [];
  let exampleCount = 0;
  let skipMode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip undefined lines

    // Detect example lines
    if (/^[\s]*\d+\.\s*Example\s+\d+/i.test(line)) {
      exampleCount++;
      if (exampleCount > 2) {
        skipMode = true;
        continue;
      } else {
        skipMode = false;
      }
    }

    // Skip lines in skip mode (after 2 examples)
    if (skipMode && /^[\s]*\d+\.\s*Example\s+\d+/i.test(line)) {
      continue;
    }

    // Add back to list if not in numbered example after limit
    if (!skipMode || !line.match(/^[\s]*[\-\*]/)) {
      condensed.push(line);
    }
  }

  return condensed.join("\n");
}

/**
 * Apply tier-specific transformations
 */
function applyTierTransformations(
  prompt: string,
  tier: OptimizationTier
): string {
  let result = prompt;

  // All tiers get deduplication
  result = applyDeduplication(result);

  // MODERATE and above: condense examples
  if (
    tier === OptimizationTier.MODERATE ||
    tier === OptimizationTier.AGGRESSIVE ||
    tier === OptimizationTier.EXTREME
  ) {
    result = condenseExamples(result);
  }

  return result;
}

/**
 * Trim prompt to maxTokens if specified
 */
function trimToMaxTokens(
  prompt: string,
  maxTokens: number | undefined
): string {
  if (!maxTokens) {
    return prompt;
  }

  const currentTokens = estimateTokens(prompt);
  if (currentTokens <= maxTokens) {
    return prompt;
  }

  // Simple trimming: cut to character limit
  const targetChars = maxTokens * 4;
  return prompt.substring(0, targetChars);
}

/**
 * Filter a system prompt with tier-based filtering, validation, and automatic fallback
 *
 * Algorithm:
 * 1. Parse prompt into sections
 * 2. Filter by tier (ALWAYS include containsCritical sections)
 * 3. Apply tier-specific transformations (deduplication, etc.)
 * 4. Rebuild prompt
 * 5. VALIDATION GATE - check critical sections
 * 6. Automatic fallback if validation fails
 *
 * @param prompt - System prompt to filter
 * @param options - Filter options including tier
 * @returns FilterResult with filtered prompt, stats, and validation
 */
export function filterSystemPrompt(
  prompt: string,
  options: FilterOptions
): FilterResult {
  // Validate required options
  if (!options || !options.tier) {
    throw new Error("FilterOptions.tier is required");
  }

  const startTime = Date.now();
  const originalTokens = estimateTokens(prompt);

  // Handle empty prompts
  if (!prompt || prompt.trim().length === 0) {
    const validation = convertValidationResult(
      validateCriticalPresence(prompt),
      prompt
    );
    return {
      filteredPrompt: prompt,
      preservedSections: [],
      removedSections: [],
      stats: {
        originalTokens: 0,
        filteredTokens: 0,
        reductionPercent: 0,
        processingTimeMs: Date.now() - startTime,
      },
      validation,
      appliedTier: options.tier,
      fallbackOccurred: false,
    };
  }

  // Try filtering with the requested tier, with fallback chain
  let currentTier = options.tier;
  let fallbackOccurred = false;
  let result: FilterResult | null = null;

  while (true) {
    // 1. Parse prompt into sections
    const sections = parseIntoSections(prompt);

    // 2. Filter sections by tier (critical sections always preserved)
    const { preserved, removed } = filterSections(
      sections,
      currentTier,
      options
    );

    // 3. Rebuild prompt from preserved sections
    let filteredPrompt = reconstructPrompt(preserved);

    // 4. Apply tier-specific transformations
    filteredPrompt = applyTierTransformations(filteredPrompt, currentTier);

    // 5. Apply maxTokens limit if specified
    filteredPrompt = trimToMaxTokens(filteredPrompt, options.maxTokens);

    // 6. VALIDATION GATE
    const baseValidation = validateCriticalPresence(filteredPrompt);
    const validation = convertValidationResult(baseValidation, filteredPrompt);

    // Calculate stats
    const filteredTokens = estimateTokens(filteredPrompt);
    const reductionPercent =
      originalTokens > 0
        ? ((originalTokens - filteredTokens) / originalTokens) * 100
        : 0;

    // Ensure processing time is at least 1ms
    const processingTime = Math.max(1, Date.now() - startTime);

    result = {
      filteredPrompt,
      preservedSections: preserved.map((s) => s.id),
      removedSections: removed.map((s) => s.id),
      stats: {
        originalTokens,
        filteredTokens,
        reductionPercent,
        processingTimeMs: processingTime,
      },
      validation,
      appliedTier: currentTier,
      fallbackOccurred,
    };

    // If validation passed, we're done
    if (validation.isValid) {
      break;
    }

    // If validation failed, try fallback
    const fallbackTier = getFallbackTier(currentTier);
    if (fallbackTier === null) {
      // No more fallbacks available (we're at MINIMAL), return result even if invalid
      break;
    }

    // Try fallback tier
    currentTier = fallbackTier;
    fallbackOccurred = true;
  }

  return result!;
}
