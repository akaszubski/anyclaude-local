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
  detectCriticalSections,
} from "./critical-sections";
import type { ValidationResult as BaseValidationResult } from "./critical-sections";
import { parseIntoSections, reconstructPrompt } from "./prompt-section-parser";
import type { PromptSection } from "./prompt-section-parser";
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
 * Tier configuration with token budgets and inclusion rules
 */
interface TierConfig {
  /** Target token count (mid-range of tier's range) */
  targetTokens: number;
  /** Minimum token count for this tier */
  minTokens: number;
  /** Maximum token count for this tier */
  maxTokens: number;
  /** Section tiers to include (0=P0, 1=P1, 2=P2, 3=other) */
  includeTiers: number[];
  /** Description of what this tier does */
  description: string;
}

/**
 * Token budget configuration for each optimization tier
 *
 * Each tier has a target range and rules for which sections to include:
 * - MINIMAL: 12-15k tokens, includes all tiers (P0/P1/P2)
 * - MODERATE: 8-10k tokens, includes tiers 0-2 (P0/P1/P2)
 * - AGGRESSIVE: 4-6k tokens, includes tiers 0-1 (P0/P1)
 * - EXTREME: 2-3k tokens, includes tier 0 only (P0)
 */
const TIER_CONFIGS: Record<OptimizationTier, TierConfig> = {
  [OptimizationTier.MINIMAL]: {
    targetTokens: 13500,
    minTokens: 12000,
    maxTokens: 15000,
    includeTiers: [0, 1, 2, 3],
    description: "Deduplication only, preserves all content",
  },
  [OptimizationTier.MODERATE]: {
    targetTokens: 9000,
    minTokens: 8000,
    maxTokens: 10000,
    includeTiers: [0, 1, 2],
    description: "Deduplication + condense examples, removes tier 3",
  },
  [OptimizationTier.AGGRESSIVE]: {
    targetTokens: 5000,
    minTokens: 4000,
    maxTokens: 6000,
    includeTiers: [0, 1],
    description: "Hierarchical filtering, removes tiers 2-3",
  },
  [OptimizationTier.EXTREME]: {
    targetTokens: 2500,
    minTokens: 2000,
    maxTokens: 3000,
    includeTiers: [0, 1], // Include P0 and P1 for minimum viable prompt
    description:
      "Core sections only, preserves P0 critical patterns and essential P1 guidelines",
  },
};

/**
 * Filter options for system prompt optimization
 *
 * Controls how aggressively the prompt is filtered while ensuring critical
 * tool-calling functionality is always preserved.
 */
export interface FilterOptions {
  /** Optimization tier to apply - REQUIRED (or 'auto' for automatic selection) */
  tier: OptimizationTier | "auto";

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

  /** Coverage percentage (0-100) of required patterns present */
  coveragePercent: number;
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
 * Select the appropriate optimization tier based on prompt size
 *
 * Automatically selects the tier that will bring the prompt within acceptable
 * token limits while preserving as much functionality as possible.
 *
 * Selection Rules:
 * - <18k tokens: MINIMAL (deduplication only)
 * - 18k-25k tokens: MODERATE (condense examples)
 * - 25k-40k tokens: AGGRESSIVE (hierarchical filtering)
 * - >40k tokens: EXTREME (core sections only)
 *
 * @param tokenCount - Estimated token count of the prompt
 * @returns The recommended optimization tier
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens(prompt);
 * const tier = selectTierForPrompt(tokens);
 * const result = filterSystemPrompt(prompt, { tier });
 * ```
 */
export function selectTierForPrompt(tokenCount: number): OptimizationTier {
  if (tokenCount < 18000) {
    return OptimizationTier.MINIMAL;
  } else if (tokenCount < 25000) {
    return OptimizationTier.MODERATE;
  } else if (tokenCount < 40000) {
    return OptimizationTier.AGGRESSIVE;
  } else {
    return OptimizationTier.EXTREME;
  }
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
    coveragePercent: base.coveragePercent,
  };
}

/**
 * Get tier inclusion level (which section tiers to include)
 */
function getTierInclusion(tier: OptimizationTier): number[] {
  return TIER_CONFIGS[tier].includeTiers;
}

/**
 * Get target token count for a tier
 */
function getTierTargetTokens(tier: OptimizationTier): number {
  return TIER_CONFIGS[tier].targetTokens;
}

/**
 * Get maximum token count for a tier (with buffer)
 */
function getTierMaxTokens(tier: OptimizationTier): number {
  return TIER_CONFIGS[tier].maxTokens + 1000; // Allow 1k buffer
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
 * Also ensures minimum token count from tier config
 */
function trimToMaxTokens(
  prompt: string,
  maxTokens: number | undefined,
  tier: OptimizationTier
): string {
  const currentTokens = estimateTokens(prompt);

  // If maxTokens specified and exceeded, trim to it
  if (maxTokens && currentTokens > maxTokens) {
    const targetChars = maxTokens * 4;
    return prompt.substring(0, targetChars);
  }

  // Check if we're below the minimum for the tier
  const minTokens = TIER_CONFIGS[tier].minTokens;
  if (currentTokens < minTokens) {
    // Prompt is already smaller than minimum - don't trim
    // This can happen with very small prompts
    return prompt;
  }

  return prompt;
}

/**
 * Filter a system prompt with tier-based filtering, validation, and automatic fallback
 *
 * Algorithm:
 * 1. Auto-select tier if tier='auto'
 * 2. Parse prompt into sections
 * 3. Filter by tier (ALWAYS include containsCritical sections)
 * 4. Apply tier-specific transformations (deduplication, etc.)
 * 5. Rebuild prompt
 * 6. VALIDATION GATE - check critical sections
 * 7. Automatic fallback if validation fails
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

  // Auto-select tier if 'auto' specified
  let selectedTier: OptimizationTier;
  if (options.tier === "auto") {
    selectedTier = selectTierForPrompt(originalTokens);
  } else {
    selectedTier = options.tier;
  }

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
      appliedTier: selectedTier,
      fallbackOccurred: false,
    };
  }

  // Try filtering with the selected tier, with fallback chain
  let currentTier = selectedTier;
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
    filteredPrompt = trimToMaxTokens(
      filteredPrompt,
      options.maxTokens,
      currentTier
    );

    // 5.5. Check if we're below minimum viable token count (only for small prompts)
    let currentFilteredTokens = estimateTokens(filteredPrompt);
    const minViableTokens = 1000; // Minimum for a functional prompt
    // Only enforce minimum if original prompt was also small (<5000 tokens)
    if (
      originalTokens < 5000 &&
      currentFilteredTokens < minViableTokens &&
      currentFilteredTokens > 0
    ) {
      // Too aggressive for a small prompt - try to include more content
      const fallbackTier = getFallbackTier(currentTier);
      if (fallbackTier !== null && fallbackTier !== currentTier) {
        // Retry with less aggressive tier
        currentTier = fallbackTier;
        fallbackOccurred = true;
        continue;
      }
    }

    // 6. VALIDATION GATE
    const baseValidation = validateCriticalPresence(filteredPrompt);
    const validation = convertValidationResult(baseValidation, filteredPrompt);

    // Calculate stats
    const filteredTokens = currentFilteredTokens;
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
