/**
 * Circuit Breaker Pattern Implementation
 *
 * States:
 * - CLOSED: Normal operation, requests go to primary service (Anthropic)
 * - OPEN: Service detected as down, requests go to fallback (LMStudio)
 * - HALF_OPEN: Testing if primary service has recovered
 *
 * Based on resilience best practices:
 * - Fast failure detection with timeouts
 * - Automatic recovery testing
 * - Configurable thresholds
 */

export enum CircuitState {
  CLOSED = "CLOSED", // Normal - using Anthropic
  OPEN = "OPEN", // Failover - using LMStudio
  HALF_OPEN = "HALF_OPEN", // Testing - trying Anthropic again
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening circuit
  successThreshold: number; // Successes in HALF_OPEN before closing
  retryTimeout: number; // Time before trying HALF_OPEN (ms)
  requestTimeout: number; // Max request time before considering failed (ms)
  latencyThresholdMs?: number; // Latency threshold for circuit breaking (0 = disabled)
  latencyConsecutiveChecks?: number; // Number of consecutive high latency checks before opening
  latencyWindowMs?: number; // Rolling window for latency samples (ms)
  autoCheckLatency?: boolean; // Automatically check latency threshold on recordLatency
  maxLatencySamples?: number; // Max samples to keep (prevents unbounded growth - DoS protection)
}

// Security: Maximum latency samples to prevent DoS via memory exhaustion
const DEFAULT_MAX_LATENCY_SAMPLES = 10000;

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  avgLatencyMs: number;
  latencySamples: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  consecutiveHighLatency: number;
  nextAttempt: string | null;
  timestamp: string;
}

interface LatencySample {
  timestamp: number;
  latencyMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0; // For state machine logic
  private successCount: number = 0; // For state machine logic
  private totalFailureCount: number = 0; // For metrics
  private totalSuccessCount: number = 0; // For metrics
  private nextAttempt: number = Date.now();
  private config: CircuitBreakerConfig;
  private onStateChange?: (state: CircuitState, reason?: string) => void;
  private latencySamples: LatencySample[] = [];
  private consecutiveHighLatency: number = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      successThreshold: config.successThreshold ?? 2,
      retryTimeout: config.retryTimeout ?? 30000, // 30 seconds
      requestTimeout: config.requestTimeout ?? 5000, // 5 seconds
      latencyThresholdMs: config.latencyThresholdMs ?? 0, // Disabled by default
      latencyConsecutiveChecks: config.latencyConsecutiveChecks ?? 3,
      latencyWindowMs: config.latencyWindowMs ?? 1000, // 1 second window
      autoCheckLatency: config.autoCheckLatency ?? false,
      maxLatencySamples:
        config.maxLatencySamples ?? DEFAULT_MAX_LATENCY_SAMPLES,
    };
  }

  /**
   * Register callback for state changes (for logging/monitoring)
   */
  public onStateChangeListener(
    callback: (state: CircuitState, reason?: string) => void
  ): void {
    this.onStateChange = callback;
  }

  /**
   * Check if request should be allowed to primary service
   */
  public shouldAllowRequest(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if it's time to try HALF_OPEN
      if (Date.now() >= this.nextAttempt) {
        this.setState(CircuitState.HALF_OPEN);
        return true;
      }
      return false; // Use fallback
    }

    // HALF_OPEN state - allow request to test recovery
    return true;
  }

  /**
   * Record successful request
   */
  public recordSuccess(): void {
    this.failureCount = 0;
    this.totalSuccessCount++; // Track for metrics

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  /**
   * Record failed request
   */
  public recordFailure(): void {
    this.failureCount++;
    this.totalFailureCount++; // Track for metrics
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test - go back to OPEN
      this.setState(CircuitState.OPEN);
      this.scheduleRetry();
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Too many failures - open circuit
      this.setState(CircuitState.OPEN);
      this.scheduleRetry();
    }
  }

  /**
   * Manually trip the circuit (for testing)
   */
  public trip(): void {
    this.setState(CircuitState.OPEN);
    this.scheduleRetry();
  }

  /**
   * Manually reset the circuit (for testing)
   */
  public reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.totalFailureCount = 0;
    this.totalSuccessCount = 0;
    this.latencySamples = [];
    this.consecutiveHighLatency = 0;
    this.setState(CircuitState.CLOSED);
  }

  /**
   * Record latency measurement
   * Security: Validates input to prevent NaN/Infinity poisoning and enforces sample limits
   */
  public recordLatency(latencyMs: number): void {
    // Security: Complete input validation (CWE-20)
    if (latencyMs <= 0) {
      throw new Error("Latency must be positive");
    }
    if (!Number.isFinite(latencyMs)) {
      throw new Error("Latency must be a finite number");
    }
    if (latencyMs > 86400000) {
      // 24 hours max - sanity check
      throw new Error("Latency exceeds maximum allowed value (24 hours)");
    }

    // Add sample with timestamp
    this.latencySamples.push({
      timestamp: Date.now(),
      latencyMs,
    });

    // Security: Enforce max samples limit to prevent DoS via memory exhaustion (CWE-400)
    if (this.latencySamples.length > this.config.maxLatencySamples!) {
      // Remove oldest samples to stay within limit
      const excess =
        this.latencySamples.length - this.config.maxLatencySamples!;
      this.latencySamples.splice(0, excess);
    }

    // Auto-check latency threshold if enabled
    if (this.config.autoCheckLatency) {
      this.checkLatencyThreshold();
    }
  }

  /**
   * Check if average latency exceeds threshold
   */
  public checkLatencyThreshold(): void {
    // Skip if threshold disabled
    if (
      !this.config.latencyThresholdMs ||
      this.config.latencyThresholdMs === 0
    ) {
      return;
    }

    const validSamples = this.getValidLatencySamples();

    // Need samples to check
    if (validSamples.length === 0) {
      this.consecutiveHighLatency = 0;
      return;
    }

    // Get the most recent sample
    const lastSample = validSamples[validSamples.length - 1];

    // Check if last sample is above threshold (for consecutive tracking)
    if (lastSample.latencyMs >= this.config.latencyThresholdMs!) {
      this.consecutiveHighLatency++;

      // Open circuit if threshold reached
      if (
        this.consecutiveHighLatency >= this.config.latencyConsecutiveChecks!
      ) {
        this.setState(CircuitState.OPEN, "latency threshold exceeded");
        this.scheduleRetry();
      }
    } else {
      // Reset counter on normal latency
      this.consecutiveHighLatency = 0;
    }
  }

  /**
   * Get complete metrics
   */
  public getMetrics(): CircuitBreakerMetrics {
    const validSamples = this.getValidLatencySamples();
    const latencies = validSamples.map((s) => s.latencyMs);

    // Calculate basic stats - round to 2 decimal places
    const rawAvg =
      latencies.length > 0
        ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
        : 0;
    const avgLatencyMs = Math.round(rawAvg * 100) / 100;
    const minLatencyMs = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : 0;

    // Calculate percentiles
    const p50LatencyMs =
      Math.round(this.calculatePercentile(latencies, 50) * 100) / 100;
    const p95LatencyMs =
      Math.round(this.calculatePercentile(latencies, 95) * 100) / 100;
    const p99LatencyMs =
      Math.round(this.calculatePercentile(latencies, 99) * 100) / 100;

    return {
      state: this.state,
      failureCount: this.totalFailureCount,
      successCount: this.totalSuccessCount,
      avgLatencyMs,
      latencySamples: validSamples.length,
      minLatencyMs,
      maxLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      consecutiveHighLatency: this.consecutiveHighLatency,
      nextAttempt:
        this.state === CircuitState.OPEN
          ? new Date(this.nextAttempt).toISOString()
          : null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Static HTTP endpoint handler for metrics
   * Security: No CORS headers - this is an internal monitoring endpoint
   * Authentication should be handled at the proxy/gateway level
   */
  public static async handleMetricsRequest(
    breaker: CircuitBreaker,
    req: { method: string; url: string },
    res: {
      writeHead: (status: number, headers: Record<string, string>) => void;
      end: (body?: string) => void;
    }
  ): Promise<void> {
    // Check method and URL
    if (req.method !== "GET" || req.url !== "/v1/circuit-breaker/metrics") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    // Get metrics
    const metrics = breaker.getMetrics();

    // Return JSON response (no CORS - internal endpoint only)
    res.writeHead(200, {
      "Content-Type": "application/json",
    });
    res.end(JSON.stringify(metrics));
  }

  /**
   * Get valid latency samples within the rolling window
   */
  private getValidLatencySamples(): LatencySample[] {
    const now = Date.now();
    const cutoff = now - this.config.latencyWindowMs!;

    // Filter samples within window (strictly greater than cutoff to exclude boundary)
    return this.latencySamples.filter((sample) => sample.timestamp > cutoff);
  }

  /**
   * Calculate percentile from latency array using linear interpolation
   */
  private calculatePercentile(latencies: number[], percentile: number): number {
    if (latencies.length === 0) {
      return 0;
    }

    // Sort latencies
    const sorted = [...latencies].sort((a, b) => a - b);

    // For single element
    if (sorted.length === 1) {
      return sorted[0];
    }

    // Calculate index using linear interpolation between ranks
    // This gives more accurate percentiles for small datasets
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    // Interpolate between lower and upper values
    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Get current state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Get request timeout from config
   */
  public getRequestTimeout(): number {
    return this.config.requestTimeout;
  }

  /**
   * Get statistics for monitoring
   */
  public getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt:
        this.state === CircuitState.OPEN
          ? new Date(this.nextAttempt).toISOString()
          : null,
    };
  }

  private setState(newState: CircuitState, reason?: string): void {
    if (this.state !== newState) {
      this.state = newState;

      // Reset metrics when circuit closes
      if (newState === CircuitState.CLOSED) {
        this.consecutiveHighLatency = 0;
        this.totalFailureCount = 0; // Reset failure count on recovery
      }

      this.onStateChange?.(newState, reason);
    }
  }

  private scheduleRetry(): void {
    this.nextAttempt = Date.now() + this.config.retryTimeout;
  }
}
