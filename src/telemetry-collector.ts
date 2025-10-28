/**
 * Telemetry Collector for vLLM-MLX
 * Captures real usage data from actual Claude Code sessions
 * Allows analyzing bottlenecks and identifying improvements
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface RequestMetric {
  timestamp: string;
  request_id: string;
  provider: string;
  model: string;

  // Request details
  message_count: number;
  message_tokens: number;
  has_system_prompt: boolean;
  has_tools: boolean;
  tool_count: number;
  stream: boolean;

  // Response details
  status: "success" | "error" | "timeout";
  finish_reason: string;
  tool_calls_made: number;

  // Timing
  request_start_ms: number;
  request_end_ms: number;
  latency_ms: number;

  // Cache info
  cache_hit: boolean;
  cache_key?: string;

  // Response characteristics
  response_tokens: number;
  response_length: number;

  // Error info (if any)
  error_message?: string;
  error_stack?: string;

  // Environment
  cpu_percent?: number;
  memory_mb?: number;
}

export interface SessionSummary {
  session_id: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;

  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  timeout_requests: number;

  total_latency_ms: number;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;

  cache_hits: number;
  cache_hit_rate: number;

  total_input_tokens: number;
  total_output_tokens: number;
  total_tool_calls: number;

  models_used: string[];
  providers_used: string[];
}

export class TelemetryCollector {
  private metricsFile: string;
  private sessionId: string;
  private sessionStartTime: number;
  private metrics: RequestMetric[] = [];
  private enabled: boolean;

  constructor(sessionId?: string) {
    // Check if telemetry is enabled
    this.enabled = process.env.ANYCLAUDE_TELEMETRY !== "0";

    this.sessionId = sessionId || this.generateSessionId();
    this.sessionStartTime = Date.now();

    // Create telemetry directory
    const telemetryDir = path.join(os.homedir(), ".anyclaude", "telemetry");
    if (!fs.existsSync(telemetryDir)) {
      fs.mkdirSync(telemetryDir, { recursive: true });
    }

    this.metricsFile = path.join(
      telemetryDir,
      `session-${this.sessionId}-metrics.jsonl`
    );

    if (this.enabled) {
      console.log(`[telemetry] Session: ${this.sessionId}`);
      console.log(`[telemetry] Metrics file: ${this.metricsFile}`);
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  recordRequest(metric: RequestMetric): void {
    if (!this.enabled) return;

    // Add session context
    metric.request_id = metric.request_id || this.generateSessionId();

    // Calculate latency if not provided
    if (metric.latency_ms === undefined) {
      metric.latency_ms = metric.request_end_ms - metric.request_start_ms;
    }

    // Store in memory
    this.metrics.push(metric);

    // Write to file (JSONL format - one JSON per line)
    try {
      fs.appendFileSync(
        this.metricsFile,
        JSON.stringify(metric) + "\n"
      );
    } catch (error) {
      console.error("[telemetry] Failed to write metric:", error);
    }

    // Log summary to console
    const cacheStatus = metric.cache_hit ? "CACHE" : "MISS";
    const statusEmoji = metric.status === "success" ? "✓" : "✗";
    console.log(
      `[telemetry] ${statusEmoji} ${metric.provider}/${metric.model} - ` +
      `${metric.latency_ms}ms (${cacheStatus})`
    );
  }

  generateSessionSummary(): SessionSummary {
    if (this.metrics.length === 0) {
      return this.createEmptySummary();
    }

    const successful = this.metrics.filter(m => m.status === "success");
    const failed = this.metrics.filter(m => m.status === "error");
    const timeouts = this.metrics.filter(m => m.status === "timeout");

    const latencies = successful.map(m => m.latency_ms).sort((a, b) => a - b);

    const cacheHits = this.metrics.filter(m => m.cache_hit).length;
    const cacheHitRate = this.metrics.length > 0
      ? (cacheHits / this.metrics.length) * 100
      : 0;

    const totalInputTokens = this.metrics.reduce((sum, m) => sum + m.message_tokens, 0);
    const totalOutputTokens = this.metrics.reduce((sum, m) => sum + m.response_tokens, 0);
    const totalToolCalls = this.metrics.reduce((sum, m) => sum + m.tool_calls_made, 0);

    const providersUsed = [...new Set(this.metrics.map(m => m.provider))];
    const modelsUsed = [...new Set(this.metrics.map(m => m.model))];

    const endTime = Date.now();
    const durationMs = endTime - this.sessionStartTime;

    return {
      session_id: this.sessionId,
      start_time: new Date(this.sessionStartTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_ms: durationMs,

      total_requests: this.metrics.length,
      successful_requests: successful.length,
      failed_requests: failed.length,
      timeout_requests: timeouts.length,

      total_latency_ms: latencies.reduce((a, b) => a + b, 0),
      avg_latency_ms: latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
      min_latency_ms: latencies[0] || 0,
      max_latency_ms: latencies[latencies.length - 1] || 0,
      p50_latency_ms: this.percentile(latencies, 50),
      p95_latency_ms: this.percentile(latencies, 95),
      p99_latency_ms: this.percentile(latencies, 99),

      cache_hits: cacheHits,
      cache_hit_rate: cacheHitRate,

      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_tool_calls: totalToolCalls,

      models_used: modelsUsed,
      providers_used: providersUsed,
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private createEmptySummary(): SessionSummary {
    const now = new Date().toISOString();
    return {
      session_id: this.sessionId,
      start_time: now,
      end_time: now,
      duration_ms: 0,
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      timeout_requests: 0,
      total_latency_ms: 0,
      avg_latency_ms: 0,
      min_latency_ms: 0,
      max_latency_ms: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
      cache_hits: 0,
      cache_hit_rate: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tool_calls: 0,
      models_used: [],
      providers_used: [],
    };
  }

  printSessionSummary(): void {
    const summary = this.generateSessionSummary();

    console.log("\n");
    console.log("╔════════════════════════════════════════╗");
    console.log("║     vLLM-MLX SESSION SUMMARY           ║");
    console.log("╚════════════════════════════════════════╝");
    console.log("");
    console.log(`Session ID: ${summary.session_id}`);
    console.log(`Duration: ${this.formatDuration(summary.duration_ms || 0)}`);
    console.log("");

    console.log("Requests:");
    console.log(`  Total: ${summary.total_requests}`);
    console.log(`  Successful: ${summary.successful_requests}`);
    console.log(`  Failed: ${summary.failed_requests}`);
    console.log(`  Timeouts: ${summary.timeout_requests}`);
    console.log("");

    console.log("Performance:");
    console.log(`  Avg latency: ${summary.avg_latency_ms.toFixed(0)}ms`);
    console.log(`  Min/Max: ${summary.min_latency_ms}ms / ${summary.max_latency_ms}ms`);
    console.log(`  P95/P99: ${summary.p95_latency_ms.toFixed(0)}ms / ${summary.p99_latency_ms.toFixed(0)}ms`);
    console.log("");

    console.log("Cache Performance:");
    console.log(`  Cache hits: ${summary.cache_hits} (${summary.cache_hit_rate.toFixed(1)}%)`);
    console.log("");

    console.log("Tokens:");
    console.log(`  Input: ${summary.total_input_tokens}`);
    console.log(`  Output: ${summary.total_output_tokens}`);
    console.log(`  Tool calls: ${summary.total_tool_calls}`);
    console.log("");

    console.log("Models:");
    summary.models_used.forEach(model => console.log(`  - ${model}`));
    console.log("");

    // Save summary to JSON file
    const summaryFile = this.metricsFile.replace("-metrics.jsonl", "-summary.json");
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📊 Full summary saved to: ${summaryFile}`);
    console.log(`📋 All metrics saved to: ${this.metricsFile}`);
    console.log("");
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static analyzeTelemetryData(metricsFile: string): void {
    if (!fs.existsSync(metricsFile)) {
      console.error(`File not found: ${metricsFile}`);
      return;
    }

    const lines = fs
      .readFileSync(metricsFile, "utf-8")
      .split("\n")
      .filter(line => line.trim());

    const metrics: RequestMetric[] = lines.map(line => JSON.parse(line));

    console.log("\n📊 Telemetry Analysis");
    console.log("════════════════════════════════════════");
    console.log("");

    // Provider breakdown
    const byProvider = this.groupBy(metrics, "provider");
    console.log("By Provider:");
    Object.entries(byProvider).forEach(([provider, items]) => {
      const avg = (items as RequestMetric[]).reduce((sum, m) => sum + m.latency_ms, 0) / items.length;
      console.log(`  ${provider}: ${items.length} requests, avg ${avg.toFixed(0)}ms`);
    });
    console.log("");

    // Cache effectiveness
    const cacheHits = metrics.filter(m => m.cache_hit).length;
    console.log(`Cache Hits: ${cacheHits}/${metrics.length} (${(cacheHits/metrics.length*100).toFixed(1)}%)`);
    console.log("");

    // Error analysis
    const errors = metrics.filter(m => m.status !== "success");
    if (errors.length > 0) {
      console.log("Errors:");
      errors.forEach(e => {
        console.log(`  - ${e.error_message}`);
      });
      console.log("");
    }

    // Slowest requests
    const slowest = metrics.sort((a, b) => b.latency_ms - a.latency_ms).slice(0, 5);
    console.log("Slowest Requests:");
    slowest.forEach(m => {
      const cacheStatus = m.cache_hit ? "cached" : "uncached";
      console.log(
        `  ${m.latency_ms}ms - ${m.model} (${cacheStatus}, ` +
        `${m.message_count} messages)`
      );
    });
  }

  private static groupBy<T extends Record<string, any>>(
    items: T[],
    key: keyof T
  ): Record<string, T[]> {
    return items.reduce((result, item) => {
      const k = String(item[key]);
      if (!result[k]) {
        result[k] = [];
      }
      result[k].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }
}
