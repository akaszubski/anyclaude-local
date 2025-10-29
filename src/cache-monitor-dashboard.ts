/**
 * Cache Monitoring & Reporting
 *
 * Tracks cache performance metrics and generates reports
 * showing cache hit rate, token savings, and effectiveness.
 */

import * as fs from "fs";
import * as path from "path";
import { debug } from "./debug";

export interface CacheEntry {
  hash: string;
  systemPromptLength: number;
  toolCount: number;
  hits: number;
  misses: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastHitTime: number;
}

export interface CacheMetrics {
  startTime: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalInputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  entries: Map<string, CacheEntry>;
}

/**
 * Cache monitor singleton for tracking cache performance
 */
class CacheMonitor {
  private metrics: CacheMetrics;
  private exportPath: string;

  constructor(exportPath?: string) {
    this.metrics = {
      startTime: Date.now(),
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalInputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      entries: new Map(),
    };
    this.exportPath =
      exportPath || path.join(process.cwd(), ".anyclaude-cache-metrics.json");
  }

  /**
   * Record a cache hit
   */
  recordHit(hash: string, inputTokens: number, cacheReadTokens: number): void {
    this.metrics.totalRequests++;
    this.metrics.cacheHits++;
    this.metrics.cacheReadTokens += cacheReadTokens;
    this.metrics.totalInputTokens += inputTokens;

    const entry = this.metrics.entries.get(hash);
    if (entry) {
      entry.hits++;
      entry.cacheReadTokens += cacheReadTokens;
      entry.lastHitTime = Date.now();
    }
  }

  /**
   * Record a cache miss
   */
  recordMiss(
    hash: string,
    inputTokens: number,
    cacheCreationTokens: number,
    systemPromptLength: number,
    toolCount: number
  ): void {
    this.metrics.totalRequests++;
    this.metrics.cacheMisses++;
    this.metrics.cacheCreationTokens += cacheCreationTokens;
    this.metrics.totalInputTokens += inputTokens;

    if (!this.metrics.entries.has(hash)) {
      this.metrics.entries.set(hash, {
        hash,
        systemPromptLength,
        toolCount,
        hits: 0,
        misses: 1,
        cacheCreationTokens,
        cacheReadTokens: 0,
        lastHitTime: Date.now(),
      });
    } else {
      const entry = this.metrics.entries.get(hash)!;
      entry.misses++;
      entry.cacheCreationTokens += cacheCreationTokens;
    }
  }

  /**
   * Calculate cache hit rate as percentage
   */
  getHitRate(): number {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.cacheHits / this.metrics.totalRequests) * 100;
  }

  /**
   * Calculate token savings as percentage
   */
  getTokenSavingsRate(): number {
    if (this.metrics.cacheCreationTokens === 0) return 0;
    // Assume cache reads cost 10% of normal token cost
    const regularCost =
      this.metrics.cacheCreationTokens + this.metrics.cacheReadTokens * 10;
    const savedCost = this.metrics.cacheReadTokens * 9; // 90% savings per cache read
    return (savedCost / regularCost) * 100;
  }

  /**
   * Get top cache entries by hit count
   */
  getTopEntries(limit: number = 10): CacheEntry[] {
    return Array.from(this.metrics.entries.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }

  /**
   * Generate human-readable cache report
   */
  generateReport(): string {
    const hitRate = this.getHitRate();
    const tokenSavings = this.getTokenSavingsRate();
    const runtime = ((Date.now() - this.metrics.startTime) / 1000).toFixed(1);

    let report = "";
    report += "╔══════════════════════════════════════════════════════════╗\n";
    report += "║         ANYCLAUDE CACHE PERFORMANCE REPORT               ║\n";
    report +=
      "╚══════════════════════════════════════════════════════════╝\n\n";

    report += "OVERALL STATISTICS\n";
    report += "──────────────────────────────────────────────────────────\n";
    report += `  Total Requests:       ${this.metrics.totalRequests}\n`;
    report += `  Cache Hits:           ${this.metrics.cacheHits}\n`;
    report += `  Cache Misses:         ${this.metrics.cacheMisses}\n`;
    report += `  Hit Rate:             ${hitRate.toFixed(1)}%\n`;
    report += `  Runtime:              ${runtime}s\n\n`;

    report += "TOKEN USAGE\n";
    report += "──────────────────────────────────────────────────────────\n";
    report += `  Total Input Tokens:   ${this.metrics.totalInputTokens.toLocaleString()}\n`;
    report += `  Cache Creation:       ${this.metrics.cacheCreationTokens.toLocaleString()}\n`;
    report += `  Cache Reads:          ${this.metrics.cacheReadTokens.toLocaleString()}\n`;
    report += `  Token Savings:        ~${tokenSavings.toFixed(1)}%\n\n`;

    const topEntries = this.getTopEntries(5);
    if (topEntries.length > 0) {
      report += "TOP CACHED PROMPTS\n";
      report += "──────────────────────────────────────────────────────────\n";
      topEntries.forEach((entry, i) => {
        const ratio =
          entry.hits > 0
            ? ((entry.hits / (entry.hits + entry.misses)) * 100).toFixed(0)
            : "0";
        report += `  ${i + 1}. Hash: ${entry.hash.substring(0, 8)}...\n`;
        report += `     Tools: ${entry.toolCount} | Hit Rate: ${ratio}% | Hits: ${entry.hits}\n`;
      });
      report += "\n";
    }

    return report;
  }

  /**
   * Export metrics to JSON file
   */
  exportToJSON(): string {
    const exported = {
      exportedAt: new Date().toISOString(),
      runtime: Date.now() - this.metrics.startTime,
      metrics: {
        totalRequests: this.metrics.totalRequests,
        cacheHits: this.metrics.cacheHits,
        cacheMisses: this.metrics.cacheMisses,
        hitRate: this.getHitRate().toFixed(2),
        tokenSavings: this.getTokenSavingsRate().toFixed(2),
        totalInputTokens: this.metrics.totalInputTokens,
        cacheCreationTokens: this.metrics.cacheCreationTokens,
        cacheReadTokens: this.metrics.cacheReadTokens,
      },
      topEntries: this.getTopEntries(20).map((e) => ({
        hash: e.hash,
        tools: e.toolCount,
        hits: e.hits,
        misses: e.misses,
        hitRate:
          e.hits > 0 ? ((e.hits / (e.hits + e.misses)) * 100).toFixed(1) : "0",
        cacheTokens: e.cacheCreationTokens + e.cacheReadTokens,
      })),
    };

    return JSON.stringify(exported, null, 2);
  }

  /**
   * Export metrics to CSV file
   */
  exportToCSV(): string {
    let csv =
      "timestamp,total_requests,cache_hits,cache_misses,hit_rate,token_savings\n";

    const hitRate = this.getHitRate();
    const tokenSavings = this.getTokenSavingsRate();
    const timestamp = new Date().toISOString();

    csv += `${timestamp},${this.metrics.totalRequests},${this.metrics.cacheHits},${this.metrics.cacheMisses},${hitRate.toFixed(2)},${tokenSavings.toFixed(2)}\n`;

    return csv;
  }

  /**
   * Save metrics to file
   */
  save(): void {
    try {
      const json = this.exportToJSON();
      fs.writeFileSync(this.exportPath, json, "utf-8");
      debug(1, `[Cache Monitor] Saved metrics to ${this.exportPath}`);
    } catch (error) {
      debug(
        1,
        `[Cache Monitor] Failed to save metrics: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Display cache report in console
   */
  displayReport(): void {
    const report = this.generateReport();
    console.log("\n" + report);
  }

  /**
   * Get raw metrics
   */
  getMetrics(): CacheMetrics {
    return this.metrics;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      startTime: Date.now(),
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalInputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      entries: new Map(),
    };
  }
}

// Singleton instance
let instance: CacheMonitor | null = null;

/**
 * Get or create cache monitor singleton
 */
export function getCacheMonitor(exportPath?: string): CacheMonitor {
  if (!instance) {
    instance = new CacheMonitor(exportPath);
  }
  return instance;
}

/**
 * Reset cache monitor (for testing)
 */
export function resetCacheMonitor(): void {
  instance = null;
}
