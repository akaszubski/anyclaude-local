/**
 * SearchIntentClassifier - Main orchestrator for search intent detection
 *
 * Combines caching, fast-path regex detection, and LLM-based classification
 * to determine if a user message indicates search intent.
 *
 * Classification flow:
 * 1. Check cache (instant, high confidence)
 * 2. Fast-path regex for obvious queries (instant, high confidence)
 * 3. LLM classification for ambiguous queries (slow, medium confidence)
 * 4. Fallback to regex on LLM failure (instant, low confidence)
 *
 * Features:
 * - Three-tier classification (cache -> regex -> LLM)
 * - Graceful degradation (fallback to regex on LLM failure)
 * - Performance tracking (latency, hit rates)
 * - Configurable (cache size, TTL, timeout)
 */

import { debug } from "./debug";
import { IntentCache } from "./search-intent-cache";
import { LLMClassifier } from "./llm-classifier";

export interface ClassificationResult {
  isSearchIntent: boolean;
  confidence: "high" | "medium" | "low";
  method: "cache" | "regex-positive" | "regex-negative" | "llm" | "fallback";
  latencyMs: number;
}

export interface ClassifierConfig {
  enabled: boolean;
  cacheSize: number;
  cacheTtlSeconds: number;
  llmTimeout: number;
  fallbackToRegex: boolean;
}

export interface ClassifierStats {
  totalClassifications: number;
  cacheHits: number;
  regexPositive: number;
  regexNegative: number;
  llmCalls: number;
  fallbacks: number;
  avgLatencyMs: number;
}

// Fast-path regex patterns for DEFINITELY_SEARCH (high confidence true)
// Updated with Issue #44 keywords
const DEFINITELY_SEARCH_PATTERNS = [
  /^(google|search|look up|find out|web search)/i,
  /\b(web search|internet search|online|on the web|browse)\b/i,
  // Issue #44 keywords - explicit web/internet search phrases
  /\b(search the web|search the internet|search internet|search web)\b/i,
  /\b(look up online|find online|search online)\b/i,
  /\b(google|bing|duckduckgo|searx)\b/i,
  /\bsearch\s+for\s+information\b/i,
  // Time-sensitive queries
  /\b(current|latest|recent|today|now)\b.*\b(weather|news|price|stock|version|interest rate)/i,
  /\b(what|how)\s+(is|are)\s+(the\s+)?(current|latest|weather)\b/i,
  /\bsearch\s+\w+.*\s+(in|for)\s+\w+/i,
];

// Fast-path regex patterns for DEFINITELY_NOT (high confidence false)
const DEFINITELY_NOT_PATTERNS = [
  /\b(write|read|create|delete|modify|fix|debug|refactor)\s+(?:a |the |this |an? |new |some )*(?:file|function|class|component|code|test|bug)/i,
  /\b(run|execute|build|compile|test|lint)\s+(the )?(tests?|build|project)/i,
  /\b(explain|describe)\s+(this|the|my)\s+(code|function)/i,
  /```[\s\S]*```/, // Contains code blocks
  /\b(implement|add|update|rename)\s+(?:a |the |this |an? |new |some )*\w+/i,
];

export class SearchIntentClassifier {
  private config: ClassifierConfig;
  private cache: IntentCache;
  private llmClassifier: LLMClassifier;
  private stats: {
    totalClassifications: number;
    cacheHits: number;
    regexPositive: number;
    regexNegative: number;
    llmCalls: number;
    fallbacks: number;
    totalLatencyMs: number;
  };

  constructor(config: ClassifierConfig, mode: string, backendUrl?: string) {
    this.config = config;
    this.cache = new IntentCache(config.cacheSize, config.cacheTtlSeconds);
    this.llmClassifier = new LLMClassifier(mode, backendUrl, config.llmTimeout);
    this.stats = {
      totalClassifications: 0,
      cacheHits: 0,
      regexPositive: 0,
      regexNegative: 0,
      llmCalls: 0,
      fallbacks: 0,
      totalLatencyMs: 0,
    };

    debug(2, "[SearchIntentClassifier] Created classifier", {
      config,
      mode,
      backendUrl,
    });
  }

  async classify(message: string): Promise<ClassificationResult> {
    const startTime = performance.now();

    // If classifier is disabled, skip classification
    if (!this.config.enabled) {
      const result: ClassificationResult = {
        isSearchIntent: false,
        confidence: "low",
        method: "fallback",
        latencyMs: performance.now() - startTime,
      };
      this.stats.totalClassifications++;
      this.stats.fallbacks++;
      this.stats.totalLatencyMs += result.latencyMs;
      return result;
    }

    // Step 1: Check cache
    const cached = this.cache.get(message);
    if (cached !== null) {
      const result: ClassificationResult = {
        isSearchIntent: cached,
        confidence: "high",
        method: "cache",
        latencyMs: performance.now() - startTime,
      };
      this.stats.totalClassifications++;
      this.stats.cacheHits++;
      this.stats.totalLatencyMs += result.latencyMs;
      debug(3, "[SearchIntentClassifier] Cache hit", { message, cached });
      return result;
    }

    // Step 2: Fast-path positive (definitely search)
    for (const pattern of DEFINITELY_SEARCH_PATTERNS) {
      if (pattern.test(message)) {
        const result: ClassificationResult = {
          isSearchIntent: true,
          confidence: "high",
          method: "regex-positive",
          latencyMs: performance.now() - startTime,
        };
        this.cache.set(message, true);
        this.stats.totalClassifications++;
        this.stats.regexPositive++;
        this.stats.totalLatencyMs += result.latencyMs;
        debug(3, "[SearchIntentClassifier] Regex positive match", { message });
        return result;
      }
    }

    // Step 3: Fast-path negative (definitely not search)
    for (const pattern of DEFINITELY_NOT_PATTERNS) {
      if (pattern.test(message)) {
        const result: ClassificationResult = {
          isSearchIntent: false,
          confidence: "high",
          method: "regex-negative",
          latencyMs: performance.now() - startTime,
        };
        this.cache.set(message, false);
        this.stats.totalClassifications++;
        this.stats.regexNegative++;
        this.stats.totalLatencyMs += result.latencyMs;
        debug(3, "[SearchIntentClassifier] Regex negative match", { message });
        return result;
      }
    }

    // Step 4: Slow-path LLM classification (ambiguous)
    try {
      const isSearchIntent = await this.llmClassifier.classify(message);

      // Validate LLM returned a boolean
      if (typeof isSearchIntent !== "boolean") {
        throw new Error(
          `Invalid LLM response: expected boolean, got ${typeof isSearchIntent}`
        );
      }

      const result: ClassificationResult = {
        isSearchIntent,
        confidence: "medium",
        method: "llm",
        latencyMs: performance.now() - startTime,
      };
      this.cache.set(message, isSearchIntent);
      this.stats.totalClassifications++;
      this.stats.llmCalls++;
      this.stats.totalLatencyMs += result.latencyMs;
      debug(3, "[SearchIntentClassifier] LLM classification", {
        message,
        isSearchIntent,
      });
      return result;
    } catch (error: any) {
      // Step 5: Fallback to conservative default on LLM failure
      const result: ClassificationResult = {
        isSearchIntent: false,
        confidence: "low",
        method: "fallback",
        latencyMs: performance.now() - startTime,
      };
      // Cache fallback result to avoid repeated LLM calls for same query
      this.cache.set(message, false);
      this.stats.totalClassifications++;
      this.stats.fallbacks++;
      this.stats.totalLatencyMs += result.latencyMs;
      debug(2, "[SearchIntentClassifier] LLM failed, using fallback", {
        message,
        error: error.message,
      });
      return result;
    }
  }

  getStats(): ClassifierStats {
    const avgLatencyMs =
      this.stats.totalClassifications === 0
        ? 0
        : this.stats.totalLatencyMs / this.stats.totalClassifications;

    return {
      totalClassifications: this.stats.totalClassifications,
      cacheHits: this.stats.cacheHits,
      regexPositive: this.stats.regexPositive,
      regexNegative: this.stats.regexNegative,
      llmCalls: this.stats.llmCalls,
      fallbacks: this.stats.fallbacks,
      avgLatencyMs,
    };
  }

  clearCache(): void {
    this.cache.clear();
    debug(2, "[SearchIntentClassifier] Cache cleared");
  }
}
