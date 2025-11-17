/**
 * Cache Performance Monitor
 *
 * Tracks and displays cache hit rates, token savings, and other performance metrics
 * from both vLLM-MLX server and Anthropic API responses.
 */

import * as fs from "fs";
import * as path from "path";

export interface CacheMetrics {
  hitCount: number;
  missCount: number;
  totalRequests: number;
  totalInputTokens: number;
  cacheReadTokens: number; // Tokens from cache (90% cheaper reads)
  cacheCreateTokens: number; // Tokens that created cache
  estimatedCost: {
    rawCost: number;
    withCacheCost: number;
    savings: number;
    savingsPercent: number;
  };
}

class CacheMonitor {
  private metrics: CacheMetrics = {
    hitCount: 0,
    missCount: 0,
    totalRequests: 0,
    totalInputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    estimatedCost: {
      rawCost: 0,
      withCacheCost: 0,
      savings: 0,
      savingsPercent: 0,
    },
  };

  private vllmCacheStats: any = null;
  private lastUpdateTime: Date = new Date();

  /**
   * Record a cache hit
   */
  recordHit(inputTokens: number = 0, cachedTokens: number = 0): void {
    this.metrics.hitCount++;
    this.metrics.totalRequests++;
    this.metrics.totalInputTokens += inputTokens;
    this.metrics.cacheReadTokens += cachedTokens;
    this.updateEstimatedCost();
  }

  /**
   * Record a cache miss
   */
  recordMiss(inputTokens: number = 0): void {
    this.metrics.missCount++;
    this.metrics.totalRequests++;
    this.metrics.totalInputTokens += inputTokens;
    this.updateEstimatedCost();
  }

  /**
   * Update cache statistics from vLLM-MLX server
   */
  updateVLLMStats(stats: any): void {
    this.vllmCacheStats = stats;
    this.lastUpdateTime = new Date();
  }

  /**
   * Calculate hit rate percentage
   */
  getHitRate(): number {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.hitCount / this.metrics.totalRequests) * 100;
  }

  /**
   * Update estimated cost calculations
   * Anthropic pricing: $0.80 per 1M input tokens, cache reads are 90% cheaper
   */
  private updateEstimatedCost(): void {
    const PRICE_PER_INPUT_TOKEN = 0.8 / 1_000_000;
    const CACHE_READ_DISCOUNT = 0.9; // 90% cheaper

    // Cost without caching
    const rawCost = this.metrics.totalInputTokens * PRICE_PER_INPUT_TOKEN;

    // Cost with caching (cache reads are 90% cheaper)
    const regularCost =
      (this.metrics.totalInputTokens - this.metrics.cacheReadTokens) *
      PRICE_PER_INPUT_TOKEN;
    const cachedCost =
      this.metrics.cacheReadTokens *
      PRICE_PER_INPUT_TOKEN *
      CACHE_READ_DISCOUNT;
    const withCacheCost = regularCost + cachedCost;

    const savings = rawCost - withCacheCost;
    const savingsPercent = rawCost > 0 ? (savings / rawCost) * 100 : 0;

    this.metrics.estimatedCost = {
      rawCost,
      withCacheCost,
      savings,
      savingsPercent,
    };
  }

  /**
   * Get all metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get formatted cache statistics for display
   */
  getFormattedStats(): string {
    const hitRate = this.getHitRate();
    const vllmInfo = this.vllmCacheStats
      ? `\n  vLLM-MLX Cache:\n    Hit Rate: ${this.vllmCacheStats.hit_rate}\n    Cached Items: ${this.vllmCacheStats.cached_items}/${this.vllmCacheStats.total_requests}`
      : "";

    return `
✅ Cache Performance Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Requests: ${this.metrics.totalRequests}
  Cache Hits: ${this.metrics.hitCount}
  Cache Misses: ${this.metrics.missCount}
  Hit Rate: ${hitRate.toFixed(1)}%

📊 Token Usage:
  Total Input Tokens: ${this.metrics.totalInputTokens.toLocaleString()}
  Tokens from Cache: ${this.metrics.cacheReadTokens.toLocaleString()}
  Cache Creation Tokens: ${this.metrics.cacheCreateTokens.toLocaleString()}

💰 Estimated Cost Savings:
  Without Cache: $${this.metrics.estimatedCost.rawCost.toFixed(4)}
  With Cache: $${this.metrics.estimatedCost.withCacheCost.toFixed(4)}
  Savings: $${this.metrics.estimatedCost.savings.toFixed(4)} (${this.metrics.estimatedCost.savingsPercent.toFixed(1)}%)${vllmInfo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  /**
   * Save metrics to file for persistence
   */
  saveMetrics(outputDir: string = "."): string {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = path.join(
        outputDir,
        `.anyclaude-cache-metrics-${timestamp}.json`
      );

      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(filename, JSON.stringify(this.getMetrics(), null, 2));
      return filename;
    } catch (error) {
      console.error("Failed to save cache metrics:", error);
      return "";
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      hitCount: 0,
      missCount: 0,
      totalRequests: 0,
      totalInputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      estimatedCost: {
        rawCost: 0,
        withCacheCost: 0,
        savings: 0,
        savingsPercent: 0,
      },
    };
    this.vllmCacheStats = null;
  }
}

// Export singleton instance
export const cacheMonitor = new CacheMonitor();
