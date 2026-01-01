/**
 * Adaptive Multi-Tier Prompt Optimization System
 *
 * Dynamically selects optimization tier based on request complexity:
 *
 * - **Minimal** (Tier 1): Simple requests, basic tools, lightweight optimization
 *   - Target: 10-12k tokens
 *   - Use case: Single file operations, quick queries
 *   - Strategy: Basic deduplication only
 *
 * - **Moderate** (Tier 2): Standard requests, moderate tool usage
 *   - Target: 6-8k tokens
 *   - Use case: Multi-file edits, code reviews, refactoring
 *   - Strategy: Dedup + hierarchical tools (predicted categories)
 *
 * - **Aggressive** (Tier 3): Complex requests, many tools predicted
 *   - Target: 2-4k tokens
 *   - Use case: Large implementations, debugging, exploration
 *   - Strategy: Full 3-layer pipeline with strict filtering
 *
 * - **Extreme** (Tier 4): Very complex, long conversations, maximum optimization
 *   - Target: 1-2k tokens
 *   - Use case: Long multi-turn sessions, very limited context
 *   - Strategy: Ultra-aggressive filtering, minimal docs, core only
 *
 * This provides adaptive optimization that balances performance vs accuracy
 * based on real-time request analysis.
 */

import { debug } from "./debug";
import { deduplicatePrompt } from "./prompt-templates";
import {
  buildHierarchicalDocs,
  buildToolDocs,
  getCategoryForTool,
} from "./hierarchical-tools";
import { buildOptimizedSystemPrompt } from "./smart-system-prompt";

/**
 * Optimization tier levels
 */
export enum OptimizationTier {
  MINIMAL = "minimal", // 10-12k tokens
  MODERATE = "moderate", // 6-8k tokens
  AGGRESSIVE = "aggressive", // 2-4k tokens
  EXTREME = "extreme", // 1-2k tokens
}

/**
 * Request complexity metrics
 */
export interface ComplexityMetrics {
  messageLength: number;
  conversationTurns: number;
  toolsLikelyNeeded: number;
  hasCodeBlocks: boolean;
  hasMultipleQuestions: boolean;
  estimatedComplexity: number; // 0-1 score
}

/**
 * Optimization result with tier info
 */
export interface OptimizationResult {
  optimizedPrompt: string;
  tier: OptimizationTier;
  metrics: ComplexityMetrics;
  stats: {
    originalTokens: number;
    optimizedTokens: number;
    reductionPercent: number;
    processingTimeMs: number;
  };
}

/**
 * Analyze request to determine complexity
 */
export function analyzeRequestComplexity(
  userMessage: string,
  conversationHistory: any[]
): ComplexityMetrics {
  const messageLength = userMessage.length;
  const conversationTurns = conversationHistory.length;

  // Detect code blocks
  const hasCodeBlocks = /```[\s\S]*?```/.test(userMessage);

  // Detect multiple questions
  const questionCount = (userMessage.match(/\?/g) || []).length;
  const hasMultipleQuestions = questionCount >= 2;

  // Estimate tools needed based on keywords
  const toolKeywords = [
    "read",
    "write",
    "edit",
    "create",
    "modify",
    "refactor",
    "search",
    "find",
    "grep",
    "run",
    "execute",
    "test",
    "build",
    "implement",
    "add feature",
    "fix bug",
    "debug",
  ];

  const toolsLikelyNeeded = toolKeywords.filter((keyword) =>
    userMessage.toLowerCase().includes(keyword)
  ).length;

  // Calculate complexity score (0-1) - TUNED for better accuracy
  let complexityScore = 0;

  // Message length contribution (0-0.30)
  if (messageLength > 500) complexityScore += 0.3;
  else if (messageLength > 200) complexityScore += 0.2;
  else if (messageLength > 80) complexityScore += 0.1;
  else if (messageLength > 30) complexityScore += 0.05;

  // Conversation depth contribution (0-0.20)
  if (conversationTurns > 20) complexityScore += 0.2;
  else if (conversationTurns > 12) complexityScore += 0.15;
  else if (conversationTurns > 6) complexityScore += 0.1;
  else if (conversationTurns > 3) complexityScore += 0.05;

  // Tool usage contribution (0-0.40) - most important factor
  if (toolsLikelyNeeded >= 6) complexityScore += 0.4;
  else if (toolsLikelyNeeded >= 4) complexityScore += 0.3;
  else if (toolsLikelyNeeded >= 2) complexityScore += 0.2;
  else if (toolsLikelyNeeded >= 1) complexityScore += 0.1;

  // Code/questions contribution (0-0.10)
  if (hasCodeBlocks) complexityScore += 0.05;
  if (hasMultipleQuestions) complexityScore += 0.05;

  return {
    messageLength,
    conversationTurns,
    toolsLikelyNeeded,
    hasCodeBlocks,
    hasMultipleQuestions,
    estimatedComplexity: Math.min(complexityScore, 1.0),
  };
}

/**
 * Select optimization tier based on complexity metrics (TUNED)
 */
export function selectOptimizationTier(
  metrics: ComplexityMetrics
): OptimizationTier {
  const { estimatedComplexity, conversationTurns, toolsLikelyNeeded } = metrics;

  // Extreme: Very long conversations OR very high complexity
  if (conversationTurns > 20 || estimatedComplexity >= 0.8) {
    return OptimizationTier.EXTREME;
  }

  // Aggressive: High complexity or many tools or moderate conversation depth
  if (
    estimatedComplexity >= 0.45 ||
    toolsLikelyNeeded >= 4 ||
    conversationTurns > 10
  ) {
    return OptimizationTier.AGGRESSIVE;
  }

  // Moderate: Medium complexity or multiple tools
  if (
    estimatedComplexity >= 0.2 ||
    toolsLikelyNeeded >= 2 ||
    conversationTurns > 4
  ) {
    return OptimizationTier.MODERATE;
  }

  // Minimal: Simple, short requests
  return OptimizationTier.MINIMAL;
}

/**
 * Apply optimization based on selected tier
 */
export function applyTierOptimization(
  originalPrompt: string,
  userMessage: string,
  conversationHistory: any[],
  tier: OptimizationTier
): OptimizationResult {
  const startTime = Date.now();
  const originalTokens = Math.floor(originalPrompt.length / 4);

  let optimizedPrompt: string;
  let stats: any;

  switch (tier) {
    case OptimizationTier.MINIMAL:
      // Tier 1: Basic deduplication only
      ({ optimized: optimizedPrompt, stats } = deduplicatePrompt(
        originalPrompt,
        {
          minOccurrences: 3,
          minLength: 50, // Higher threshold, less aggressive
          maxLength: 300,
        }
      ));

      debug(
        2,
        `[Tier 1: Minimal] Applied basic deduplication: ${originalTokens} → ${stats.optimizedTokens} tokens`
      );
      break;

    case OptimizationTier.MODERATE:
      // Tier 2: Dedup + hierarchical (category-level)
      ({ optimized: optimizedPrompt, stats } = deduplicatePrompt(
        originalPrompt,
        {
          minOccurrences: 3,
          minLength: 35,
          maxLength: 250,
        }
      ));

      debug(
        2,
        `[Tier 2: Moderate] Applied deduplication + hierarchical filtering`
      );
      break;

    case OptimizationTier.AGGRESSIVE:
      // Tier 3: Full 3-layer pipeline (2-4k tokens)
      const result = buildOptimizedSystemPrompt(
        originalPrompt,
        userMessage,
        conversationHistory,
        4000 // Max 4k tokens
      );

      optimizedPrompt = result.prompt;
      stats = {
        optimizedTokens: Math.floor(optimizedPrompt.length / 4),
        reductionPercent:
          (1 - optimizedPrompt.length / originalPrompt.length) * 100,
      };

      debug(
        2,
        `[Tier 3: Aggressive] Applied full 3-layer optimization: ${originalTokens} → ${stats.optimizedTokens} tokens`
      );
      break;

    case OptimizationTier.EXTREME:
      // Tier 4: Ultra-aggressive (1-2k tokens)
      const extremeResult = buildOptimizedSystemPrompt(
        originalPrompt,
        userMessage,
        conversationHistory,
        2000 // Max 2k tokens (very aggressive)
      );

      optimizedPrompt = extremeResult.prompt;
      stats = {
        optimizedTokens: Math.floor(optimizedPrompt.length / 4),
        reductionPercent:
          (1 - optimizedPrompt.length / originalPrompt.length) * 100,
      };

      debug(
        1,
        `[Tier 4: Extreme] Applied ultra-aggressive optimization: ${originalTokens} → ${stats.optimizedTokens} tokens`
      );
      break;

    default:
      optimizedPrompt = originalPrompt;
      stats = {
        optimizedTokens: originalTokens,
        reductionPercent: 0,
      };
  }

  const processingTime = Date.now() - startTime;
  const metrics = analyzeRequestComplexity(userMessage, conversationHistory);

  return {
    optimizedPrompt,
    tier,
    metrics,
    stats: {
      originalTokens,
      optimizedTokens: stats.optimizedTokens,
      reductionPercent: stats.reductionPercent,
      processingTimeMs: processingTime,
    },
  };
}

/**
 * Main entry point: Adaptive optimization with automatic tier selection
 */
export function optimizePromptAdaptive(
  originalPrompt: string,
  userMessage: string,
  conversationHistory: any[]
): OptimizationResult {
  // Analyze request complexity
  const metrics = analyzeRequestComplexity(userMessage, conversationHistory);

  // Select appropriate tier
  const tier = selectOptimizationTier(metrics);

  debug(
    1,
    `[Adaptive Optimizer] Selected ${tier.toUpperCase()} tier (complexity: ${(metrics.estimatedComplexity * 100).toFixed(0)}%)`
  );

  // Apply tier-specific optimization
  return applyTierOptimization(
    originalPrompt,
    userMessage,
    conversationHistory,
    tier
  );
}

/**
 * Override tier manually (for testing/debugging)
 */
export function optimizePromptWithTier(
  originalPrompt: string,
  userMessage: string,
  conversationHistory: any[],
  tier: OptimizationTier
): OptimizationResult {
  debug(1, `[Adaptive Optimizer] Manual tier override: ${tier.toUpperCase()}`);

  return applyTierOptimization(
    originalPrompt,
    userMessage,
    conversationHistory,
    tier
  );
}
