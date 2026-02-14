/**
 * Prometheus metrics export module (Issue #62)
 *
 * Provides Prometheus text format metrics for:
 * - Request counts and latencies
 * - Circuit breaker state
 * - Cache hit rates
 * - Process metrics (CPU, memory)
 */

import { CircuitBreaker } from "./circuit-breaker";

// Metrics storage
interface MetricsState {
  requestsTotal: Map<string, number>; // key: "endpoint:status"
  requestDurations: number[]; // latencies in seconds
  cacheHits: number;
  cacheMisses: number;
}

const metrics: MetricsState = {
  requestsTotal: new Map(),
  requestDurations: [],
  cacheHits: 0,
  cacheMisses: 0,
};

// Keep only last 1000 durations to prevent memory bloat
const MAX_DURATION_SAMPLES = 1000;

/**
 * Record a request
 */
export function recordRequest(
  endpoint: string,
  status: "success" | "error",
  durationMs: number
): void {
  const key = `${endpoint}:${status}`;
  metrics.requestsTotal.set(key, (metrics.requestsTotal.get(key) || 0) + 1);

  // Record duration in seconds
  metrics.requestDurations.push(durationMs / 1000);
  if (metrics.requestDurations.length > MAX_DURATION_SAMPLES) {
    metrics.requestDurations.shift();
  }
}

/**
 * Record cache hit/miss
 */
export function recordCacheHit(): void {
  metrics.cacheHits++;
}

export function recordCacheMiss(): void {
  metrics.cacheMisses++;
}

/**
 * Calculate histogram buckets
 */
function calculateHistogram(values: number[]): Record<string, number> {
  const buckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, Infinity];
  const counts: Record<string, number> = {};

  for (const bucket of buckets) {
    const le = bucket === Infinity ? "+Inf" : bucket.toString();
    counts[le] = values.filter((v) => v <= bucket).length;
  }

  return counts;
}

/**
 * Calculate sum of values
 */
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Get process metrics
 */
function getProcessMetrics(): { cpuPercent: number; memoryMb: number } {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    // Approximate CPU percentage (user + system microseconds / 1M)
    cpuPercent: (cpuUsage.user + cpuUsage.system) / 1000000,
    memoryMb: memUsage.heapUsed / (1024 * 1024),
  };
}

/**
 * Generate Prometheus text format metrics
 */
export function generatePrometheusMetrics(
  circuitBreaker?: CircuitBreaker
): string {
  const lines: string[] = [];

  // Request counter
  lines.push("# HELP anyclaude_requests_total Total number of requests");
  lines.push("# TYPE anyclaude_requests_total counter");
  for (const [key, count] of metrics.requestsTotal) {
    const [endpoint, status] = key.split(":");
    lines.push(
      `anyclaude_requests_total{endpoint="${endpoint}",status="${status}"} ${count}`
    );
  }
  // Default if no requests yet
  if (metrics.requestsTotal.size === 0) {
    lines.push(
      `anyclaude_requests_total{endpoint="/v1/messages",status="success"} 0`
    );
  }

  // Request duration histogram
  lines.push(
    "# HELP anyclaude_request_duration_seconds Request duration in seconds"
  );
  lines.push("# TYPE anyclaude_request_duration_seconds histogram");
  const histogram = calculateHistogram(metrics.requestDurations);
  for (const [le, count] of Object.entries(histogram)) {
    lines.push(`anyclaude_request_duration_seconds_bucket{le="${le}"} ${count}`);
  }
  lines.push(
    `anyclaude_request_duration_seconds_sum ${sum(metrics.requestDurations)}`
  );
  lines.push(
    `anyclaude_request_duration_seconds_count ${metrics.requestDurations.length}`
  );

  // Circuit breaker state
  if (circuitBreaker) {
    const cbMetrics = circuitBreaker.getMetrics();
    const stateValue =
      cbMetrics.state === "CLOSED" ? 0 : cbMetrics.state === "OPEN" ? 1 : 2;

    lines.push(
      "# HELP anyclaude_circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half_open)"
    );
    lines.push("# TYPE anyclaude_circuit_breaker_state gauge");
    lines.push(`anyclaude_circuit_breaker_state ${stateValue}`);

    lines.push(
      "# HELP anyclaude_circuit_breaker_failures_total Total circuit breaker failures"
    );
    lines.push("# TYPE anyclaude_circuit_breaker_failures_total counter");
    lines.push(
      `anyclaude_circuit_breaker_failures_total ${cbMetrics.failureCount}`
    );

    lines.push(
      "# HELP anyclaude_circuit_breaker_successes_total Total circuit breaker successes"
    );
    lines.push("# TYPE anyclaude_circuit_breaker_successes_total counter");
    lines.push(
      `anyclaude_circuit_breaker_successes_total ${cbMetrics.successCount}`
    );

    if (cbMetrics.avgLatencyMs !== null) {
      lines.push(
        "# HELP anyclaude_circuit_breaker_latency_seconds Average latency in seconds"
      );
      lines.push("# TYPE anyclaude_circuit_breaker_latency_seconds gauge");
      lines.push(
        `anyclaude_circuit_breaker_latency_seconds ${cbMetrics.avgLatencyMs / 1000}`
      );
    }
  }

  // Cache metrics
  const totalCacheOps = metrics.cacheHits + metrics.cacheMisses;
  const cacheHitRate = totalCacheOps > 0 ? metrics.cacheHits / totalCacheOps : 0;

  lines.push("# HELP anyclaude_cache_hits_total Total cache hits");
  lines.push("# TYPE anyclaude_cache_hits_total counter");
  lines.push(`anyclaude_cache_hits_total ${metrics.cacheHits}`);

  lines.push("# HELP anyclaude_cache_misses_total Total cache misses");
  lines.push("# TYPE anyclaude_cache_misses_total counter");
  lines.push(`anyclaude_cache_misses_total ${metrics.cacheMisses}`);

  lines.push("# HELP anyclaude_cache_hit_rate Cache hit rate (0-1)");
  lines.push("# TYPE anyclaude_cache_hit_rate gauge");
  lines.push(`anyclaude_cache_hit_rate ${cacheHitRate.toFixed(4)}`);

  // Process metrics
  const processMetrics = getProcessMetrics();

  lines.push("# HELP anyclaude_process_cpu_seconds_total Total CPU time");
  lines.push("# TYPE anyclaude_process_cpu_seconds_total counter");
  lines.push(
    `anyclaude_process_cpu_seconds_total ${processMetrics.cpuPercent.toFixed(2)}`
  );

  lines.push(
    "# HELP anyclaude_process_memory_bytes Current memory usage in bytes"
  );
  lines.push("# TYPE anyclaude_process_memory_bytes gauge");
  lines.push(
    `anyclaude_process_memory_bytes ${Math.round(processMetrics.memoryMb * 1024 * 1024)}`
  );

  return lines.join("\n") + "\n";
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.requestsTotal.clear();
  metrics.requestDurations = [];
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
}
