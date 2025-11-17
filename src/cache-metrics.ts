/**
 * Cache Metrics Tracking Module
 *
 * Tracks prompt caching performance and provides insights into cache utilization.
 * Works with both Anthropic API (real Claude) and MLX backends.
 */

import * as fs from "fs";
import * as path from "path";
import { debug } from "./debug";

export interface CacheMetrics {
  timestamp: string;
  mode: string;
  requestId: string;

  // Request metrics
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  // Cache metrics (Anthropic API)
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteCost?: number;
  cacheReadCost?: number;

  // Performance metrics
  timeToFirstToken?: number; // milliseconds
  totalLatency?: number; // milliseconds

  // Cache state
  cacheHit: boolean;
  cacheMiss: boolean;
  cacheControlHeaders?: Record<string, string> | undefined;
}

export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalTokens: number;
  cachedTokens: number;
  uncachedTokens: number;
  estimatedCostSavings: number;
  estimatedLatencySavings: number;
}

class CacheMetricsTracker {
  private metricsFile: string;
  private metrics: CacheMetrics[] = [];

  constructor() {
    const cacheDir = path.join(
      process.env.HOME || "/tmp",
      ".anyclaude",
      "cache-metrics"
    );

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.metricsFile = path.join(cacheDir, `${timestamp}.json`);
  }

  /**
   * Extract cache metrics from Anthropic API response headers/body
   */
  recordRequest(
    requestId: string,
    mode: string,
    body: any,
    responseHeaders: Record<string, any>,
    responseBody: any,
    latency?: number
  ): CacheMetrics {
    const metric: CacheMetrics = {
      timestamp: new Date().toISOString(),
      mode,
      requestId,
      inputTokens: responseBody?.usage?.input_tokens || 0,
      outputTokens: responseBody?.usage?.output_tokens || 0,
      totalTokens:
        (responseBody?.usage?.input_tokens || 0) +
        (responseBody?.usage?.output_tokens || 0),
      cacheHit: false,
      cacheMiss: false,
      cacheControlHeaders: this.extractCacheHeaders(body),
      totalLatency: latency,
    };

    // Extract Anthropic cache metrics from response
    if (mode === "claude" && responseBody?.usage) {
      const usage = responseBody.usage;

      if (usage.cache_creation_input_tokens) {
        metric.cacheCreationInputTokens = usage.cache_creation_input_tokens;
        metric.cacheMiss = true;
        // Cache write costs 25% more
        metric.cacheWriteCost = usage.cache_creation_input_tokens * 0.25;
      }

      if (usage.cache_read_input_tokens) {
        metric.cacheReadInputTokens = usage.cache_read_input_tokens;
        metric.cacheHit = true;
        // Cache read costs 10% of base
        metric.cacheReadCost = usage.cache_read_input_tokens * 0.1;
      }
    }

    this.metrics.push(metric);
    this.persistMetric(metric);

    return metric;
  }

  /**
   * Extract cache_control directives from request
   */
  private extractCacheHeaders(body: any): Record<string, string> | undefined {
    const headers: Record<string, string> = {};

    if (body?.system) {
      const systemBlocks = Array.isArray(body.system)
        ? body.system
        : [body.system];
      const hasCacheControl = systemBlocks.some(
        (block: any) => block.cache_control?.type === "ephemeral"
      );
      if (hasCacheControl) headers["system_cache"] = "ephemeral";
    }

    if (body?.messages) {
      let userMessagesWithCache = 0;
      body.messages.forEach((msg: any) => {
        if (msg.content && Array.isArray(msg.content)) {
          msg.content.forEach((block: any) => {
            if (block.cache_control?.type === "ephemeral") {
              userMessagesWithCache++;
            }
          });
        }
      });
      if (userMessagesWithCache > 0) {
        headers["user_cache_blocks"] = userMessagesWithCache.toString();
      }
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  /**
   * Calculate statistics from collected metrics
   */
  getStats(): CacheStats {
    const stats: CacheStats = {
      totalRequests: this.metrics.length,
      cacheHits: this.metrics.filter((m) => m.cacheHit).length,
      cacheMisses: this.metrics.filter((m) => m.cacheMiss).length,
      hitRate: 0,
      totalTokens: this.metrics.reduce((sum, m) => sum + m.totalTokens, 0),
      cachedTokens: this.metrics.reduce(
        (sum, m) => sum + (m.cacheReadInputTokens || 0),
        0
      ),
      uncachedTokens: this.metrics.reduce(
        (sum, m) => sum + (m.cacheCreationInputTokens || 0),
        0
      ),
      estimatedCostSavings: 0,
      estimatedLatencySavings: 0,
    };

    if (stats.totalRequests > 0) {
      stats.hitRate = stats.cacheHits / stats.totalRequests;

      // Cost calculation: cache reads are 90% cheaper than normal
      stats.estimatedCostSavings = stats.cachedTokens * 0.9;

      // Latency savings: ~85% according to Anthropic docs
      const nonCachedLatencies = this.metrics
        .filter((m) => m.cacheMiss && m.totalLatency)
        .map((m) => m.totalLatency!);

      if (nonCachedLatencies.length > 0) {
        const avgLatency =
          nonCachedLatencies.reduce((a, b) => a + b, 0) /
          nonCachedLatencies.length;
        stats.estimatedLatencySavings = avgLatency * 0.85;
      }
    }

    return stats;
  }

  /**
   * Log metrics to file for analysis
   */
  private persistMetric(metric: CacheMetrics): void {
    try {
      let existing: CacheMetrics[] = [];

      if (fs.existsSync(this.metricsFile)) {
        const data = fs.readFileSync(this.metricsFile, "utf-8");
        existing = JSON.parse(data);
      }

      fs.writeFileSync(
        this.metricsFile,
        JSON.stringify([...existing, metric], null, 2)
      );
    } catch (error) {
      debug(1, "[Cache Metrics] Failed to persist metrics:", error);
    }
  }

  /**
   * Display formatted cache statistics
   */
  displayStats(): void {
    const stats = this.getStats();

    if (stats.totalRequests === 0) {
      console.log("No cache metrics collected yet.");
      return;
    }

    console.log("\n📊 Cache Performance Metrics");
    console.log("─".repeat(50));
    console.log(`Total Requests:         ${stats.totalRequests}`);
    console.log(
      `Cache Hits:             ${stats.cacheHits} (${(stats.hitRate * 100).toFixed(1)}%)`
    );
    console.log(`Cache Misses:           ${stats.cacheMisses}`);
    console.log(`\nToken Statistics:`);
    console.log(`  Total Tokens:         ${stats.totalTokens}`);
    console.log(
      `  Cached Tokens:        ${stats.cachedTokens} (${((stats.cachedTokens / stats.totalTokens) * 100 || 0).toFixed(1)}%)`
    );
    console.log(`  Uncached Tokens:      ${stats.uncachedTokens}`);
    console.log(`\nEstimated Savings:`);
    console.log(
      `  Cost Reduction:       ~${(stats.estimatedCostSavings * 100).toFixed(0)}% per cached token`
    );
    console.log(
      `  Latency Reduction:    ~${stats.estimatedLatencySavings.toFixed(0)}ms per cache hit`
    );
    console.log("─".repeat(50) + "\n");
  }

  /**
   * Get path to metrics file for manual inspection
   */
  getMetricsPath(): string {
    return this.metricsFile;
  }
}

// Singleton instance
let tracker: CacheMetricsTracker | null = null;

export function initializeCacheTracking(): CacheMetricsTracker {
  if (!tracker) {
    tracker = new CacheMetricsTracker();
  }
  return tracker;
}

export function getCacheTracker(): CacheMetricsTracker {
  if (!tracker) {
    tracker = initializeCacheTracking();
  }
  return tracker;
}

/**
 * Helper to display cache metrics at shutdown
 */
export function displayCacheMetricsOnExit(): void {
  const tracker = getCacheTracker();
  process.on("exit", () => {
    tracker.displayStats();
  });
}
