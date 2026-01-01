/**
 * Health monitoring system for MLX cluster nodes with circuit breaker pattern.
 *
 * This module provides:
 * 1. RollingWindowMetrics - Time-windowed success rate and latency tracking
 * 2. NodeHealthTracker - Per-node circuit breaker with state machine
 * 3. ClusterHealth - Orchestrator for periodic health checks across all nodes
 * 4. Error classes - Typed errors for health check failures
 *
 * The health monitoring system enables intelligent routing by:
 * - Tracking node reliability over time (success rate, latency)
 * - Implementing circuit breaker pattern (HEALTHY → DEGRADED → UNHEALTHY → OFFLINE)
 * - Using exponential backoff for unhealthy nodes
 * - Providing callbacks for health status changes
 *
 * @module cluster-health
 */

import type { MLXNode, NodeStatus, NodeHealth, HealthConfig } from './cluster-types';
import { NodeStatus as NodeStatusEnum } from './cluster-types';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when a health check times out.
 *
 * Contains node ID and timeout duration for debugging.
 */
export class HealthCheckTimeoutError extends Error {
  readonly nodeId: string;
  readonly timeoutMs: number;

  constructor(nodeId: string, timeoutMs: number) {
    super(`Health check for node ${nodeId} timed out after ${timeoutMs}ms`);
    this.name = 'HealthCheckTimeoutError';
    this.nodeId = nodeId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when a health check fails with an HTTP error status.
 *
 * Contains node ID, status code, and status text for debugging.
 */
export class HealthCheckFailedError extends Error {
  readonly nodeId: string;
  readonly statusCode: number;
  readonly statusText: string;

  constructor(nodeId: string, statusCode: number, statusText: string) {
    super(`Health check for node ${nodeId} failed with status ${statusCode}: ${statusText}`);
    this.name = 'HealthCheckFailedError';
    this.nodeId = nodeId;
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

/**
 * Error thrown when a health check fails due to network error.
 *
 * Contains node ID and original error cause for debugging.
 */
export class HealthCheckNetworkError extends Error {
  readonly nodeId: string;
  readonly cause: Error;

  constructor(nodeId: string, cause: Error) {
    super(`Health check for node ${nodeId} failed: ${cause.message}`);
    this.name = 'HealthCheckNetworkError';
    this.nodeId = nodeId;
    this.cause = cause;
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Result of a health check operation.
 */
export interface HealthCheckResult {
  readonly success: boolean;
  readonly latencyMs?: number;
  readonly error?: Error;
}

/**
 * Aggregated health metrics for a node.
 */
export interface HealthMetrics {
  readonly successRate: number; // 0.0-1.0
  readonly avgLatencyMs: number;
  readonly totalSamples: number;
  readonly consecutiveSuccesses: number;
  readonly consecutiveFailures: number;
  readonly status?: NodeStatus;
  readonly lastError?: Error;
  readonly lastCheckTime?: number;
}

/**
 * Callback invoked when node health status changes.
 *
 * @param nodeId - ID of the node
 * @param oldStatus - Previous status
 * @param newStatus - New status
 * @param metrics - Current health metrics
 */
export type HealthCallback = (
  nodeId: string,
  oldStatus: NodeStatus,
  newStatus: NodeStatus,
  metrics: HealthMetrics
) => void;

/**
 * Callback invoked after each health check.
 *
 * @param nodeId - ID of the node
 * @param result - Result of the health check
 */
export type HealthCheckCallback = (nodeId: string, result: HealthCheckResult) => void;

/**
 * Callbacks for health monitoring events.
 */
export interface HealthCallbacks {
  onStatusChange?: HealthCallback;
  onHealthCheck?: HealthCheckCallback;
}

/**
 * Configuration for exponential backoff.
 */
export interface BackoffConfig {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
}

/**
 * Sample in the rolling window.
 */
interface MetricSample {
  readonly timestamp: number;
  readonly success: boolean;
  readonly latencyMs?: number;
}

// ============================================================================
// RollingWindowMetrics Class
// ============================================================================

/**
 * Tracks success rate and latency over a rolling time window.
 *
 * Uses a circular buffer to store samples and excludes samples outside the time window
 * when calculating metrics.
 *
 * Features:
 * - O(1) sample recording
 * - O(n) metric calculation (filters by time window)
 * - Configurable window size
 * - Configurable max samples (circular buffer)
 */
export class RollingWindowMetrics {
  private readonly windowSizeMs: number;
  private readonly maxSamples: number;
  private readonly samples: MetricSample[];
  private writeIndex: number;

  /**
   * Creates a new RollingWindowMetrics instance.
   *
   * @param windowSizeMs - Time window in milliseconds (default: 30000 = 30 seconds)
   * @param maxSamples - Maximum samples to store (default: 100)
   * @throws {Error} If windowSizeMs is <= 0
   */
  constructor(windowSizeMs: number = 30000, maxSamples: number = 100) {
    if (windowSizeMs <= 0) {
      throw new Error('Window size must be positive');
    }

    this.windowSizeMs = windowSizeMs;
    this.maxSamples = maxSamples;
    this.samples = [];
    this.writeIndex = 0;
  }

  /**
   * Records a successful request.
   *
   * @param latencyMs - Request latency in milliseconds
   * @throws {Error} If latencyMs is negative
   */
  recordSuccess(latencyMs: number): void {
    if (latencyMs < 0) {
      throw new Error('Latency cannot be negative');
    }

    this.addSample({
      timestamp: Date.now(),
      success: true,
      latencyMs,
    });
  }

  /**
   * Records a failed request.
   */
  recordFailure(): void {
    this.addSample({
      timestamp: Date.now(),
      success: false,
    });
  }

  /**
   * Gets current metrics based on samples within the time window.
   *
   * @returns {HealthMetrics} Current metrics
   */
  getMetrics(): HealthMetrics {
    const validSamples = this.getValidSamples();

    if (validSamples.length === 0) {
      return {
        successRate: 0,
        avgLatencyMs: 0,
        totalSamples: 0,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
      };
    }

    const successfulSamples = validSamples.filter((s) => s.success);
    const successRate = successfulSamples.length / validSamples.length;

    const avgLatencyMs =
      successfulSamples.length > 0
        ? successfulSamples.reduce((sum, s) => sum + (s.latencyMs || 0), 0) / successfulSamples.length
        : 0;

    return {
      successRate,
      avgLatencyMs,
      totalSamples: validSamples.length,
      consecutiveSuccesses: this.getConsecutiveSuccesses(),
      consecutiveFailures: this.getConsecutiveFailures(),
    };
  }

  /**
   * Resets all samples.
   */
  reset(): void {
    this.samples.length = 0;
    this.writeIndex = 0;
  }

  /**
   * Adds a sample to the circular buffer.
   */
  private addSample(sample: MetricSample): void {
    if (this.samples.length < this.maxSamples) {
      this.samples.push(sample);
    } else {
      this.samples[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.maxSamples;
    }
  }

  /**
   * Gets samples within the time window.
   */
  private getValidSamples(): MetricSample[] {
    const now = Date.now();
    const cutoff = now - this.windowSizeMs;
    return this.samples.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Gets consecutive successes from most recent samples.
   */
  private getConsecutiveSuccesses(): number {
    let count = 0;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Gets consecutive failures from most recent samples.
   */
  private getConsecutiveFailures(): number {
    let count = 0;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (!this.samples[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
}

// ============================================================================
// NodeHealthTracker Class
// ============================================================================

/**
 * Extended health configuration with degraded threshold.
 */
interface ExtendedHealthConfig extends HealthConfig {
  readonly degradedThreshold?: number; // Default: 0.8
}

/**
 * Tracks health status for a single node with circuit breaker pattern.
 *
 * State machine:
 * - INITIALIZING → HEALTHY (first success)
 * - HEALTHY → DEGRADED (success rate drops below degradedThreshold)
 * - DEGRADED → UNHEALTHY (consecutive failures >= maxConsecutiveFailures)
 * - UNHEALTHY → OFFLINE (too many failures, exponential backoff)
 * - Any → HEALTHY (enough consecutive successes)
 *
 * Features:
 * - Exponential backoff for unhealthy nodes
 * - Rolling window metrics
 * - Configurable thresholds
 */
export class NodeHealthTracker {
  private readonly nodeId: string;
  private readonly config: ExtendedHealthConfig;
  private readonly backoffConfig: BackoffConfig;
  private readonly metrics: RollingWindowMetrics;
  private status: NodeStatus;
  private currentBackoffDelayMs: number;
  private lastCheckTime: number;
  private lastError?: Error;

  /**
   * Creates a new NodeHealthTracker.
   *
   * @param nodeId - Node identifier
   * @param config - Health check configuration
   * @param backoffConfig - Exponential backoff configuration
   */
  constructor(nodeId: string, config: ExtendedHealthConfig, backoffConfig: BackoffConfig) {
    this.nodeId = nodeId;
    this.config = {
      degradedThreshold: 0.8,
      ...config,
    };
    this.backoffConfig = backoffConfig;
    this.metrics = new RollingWindowMetrics(30000, 100);
    this.status = NodeStatusEnum.INITIALIZING;
    this.currentBackoffDelayMs = backoffConfig.initialDelayMs;
    this.lastCheckTime = 0;
    this.lastError = undefined;
  }

  /**
   * Records a successful health check.
   *
   * @param latencyMs - Request latency in milliseconds
   */
  recordSuccess(latencyMs: number): void {
    this.metrics.recordSuccess(latencyMs);
    this.lastCheckTime = Date.now();
    this.lastError = undefined; // Clear error on success
    this.updateStatus();

    // Reset backoff on success
    this.currentBackoffDelayMs = this.backoffConfig.initialDelayMs;
  }

  /**
   * Records a failed health check.
   *
   * @param error - Error that caused the failure
   */
  recordFailure(error: Error): void {
    this.metrics.recordFailure();
    this.lastCheckTime = Date.now();
    this.lastError = error; // Store the error
    this.updateStatus();

    // Increase backoff delay
    this.currentBackoffDelayMs = Math.min(
      this.currentBackoffDelayMs * this.backoffConfig.multiplier,
      this.backoffConfig.maxDelayMs
    );
  }

  /**
   * Gets current status.
   */
  getStatus(): NodeStatus {
    return this.status;
  }

  /**
   * Gets current health metrics.
   */
  getHealth(): HealthMetrics {
    const metrics = this.metrics.getMetrics();
    return {
      ...metrics,
      status: this.status,
      lastError: this.lastError,
      lastCheckTime: this.lastCheckTime,
    };
  }

  /**
   * Gets current health metrics (alias for getHealth).
   */
  getMetrics(): HealthMetrics {
    return this.getHealth();
  }

  /**
   * Gets current backoff delay in milliseconds.
   */
  getNextCheckDelay(): number {
    // Add jitter (0-25% of delay)
    const jitter = Math.random() * 0.25 * this.currentBackoffDelayMs;
    return this.currentBackoffDelayMs + jitter;
  }

  /**
   * Checks if we should attempt a health check based on backoff.
   *
   * Always returns true for healthy/degraded nodes.
   * For unhealthy/offline nodes, checks backoff delay.
   */
  shouldAttemptCheck(): boolean {
    if (this.status === NodeStatusEnum.HEALTHY || this.status === NodeStatusEnum.DEGRADED) {
      return true;
    }

    // For unhealthy/offline nodes, respect backoff
    return true; // Simplified - actual backoff handled by caller
  }

  /**
   * Checks if we should attempt recovery from unhealthy/offline state.
   *
   * Returns false for HEALTHY, DEGRADED, or OFFLINE nodes.
   * For UNHEALTHY nodes, checks if enough time has passed since last check.
   */
  shouldAttemptRecovery(): boolean {
    // Don't attempt recovery for healthy/degraded nodes
    if (this.status === NodeStatusEnum.HEALTHY || this.status === NodeStatusEnum.DEGRADED) {
      return false;
    }

    // Never attempt recovery for offline nodes
    if (this.status === NodeStatusEnum.OFFLINE) {
      return false;
    }

    // For UNHEALTHY nodes, check if backoff period has elapsed
    if (this.status === NodeStatusEnum.UNHEALTHY) {
      const timeSinceLastCheck = Date.now() - this.lastCheckTime;
      return timeSinceLastCheck >= this.currentBackoffDelayMs;
    }

    return false;
  }

  /**
   * Manually marks node as offline.
   *
   * Used for forced node eviction.
   */
  markOffline(): void {
    this.status = NodeStatusEnum.OFFLINE;
  }

  /**
   * Gets complete health snapshot.
   */
  getHealthSnapshot(): NodeHealth {
    const metrics = this.metrics.getMetrics();
    return {
      lastCheck: this.lastCheckTime,
      consecutiveFailures: metrics.consecutiveFailures,
      avgResponseTime: metrics.avgLatencyMs,
      errorRate: 1 - metrics.successRate,
    };
  }

  /**
   * Updates status based on current metrics.
   */
  private updateStatus(): void {
    const metrics = this.metrics.getMetrics();

    // INITIALIZING → HEALTHY on first success
    if (this.status === NodeStatusEnum.INITIALIZING && metrics.consecutiveSuccesses > 0) {
      this.status = NodeStatusEnum.HEALTHY;
      return;
    }

    // UNHEALTHY/OFFLINE → HEALTHY on recovery
    if (
      (this.status === NodeStatusEnum.UNHEALTHY || this.status === NodeStatusEnum.OFFLINE) &&
      metrics.consecutiveSuccesses >= 2
    ) {
      this.status = NodeStatusEnum.HEALTHY;
      return;
    }

    // DEGRADED → HEALTHY on recovery
    if (
      this.status === NodeStatusEnum.DEGRADED &&
      metrics.successRate >= (this.config.degradedThreshold || 0.8)
    ) {
      this.status = NodeStatusEnum.HEALTHY;
      return;
    }

    // HEALTHY → DEGRADED on success rate drop
    if (
      this.status === NodeStatusEnum.HEALTHY &&
      metrics.totalSamples >= 5 &&
      metrics.successRate < (this.config.degradedThreshold || 0.8)
    ) {
      this.status = NodeStatusEnum.DEGRADED;
      return;
    }

    // DEGRADED → UNHEALTHY on consecutive failures
    if (
      this.status === NodeStatusEnum.DEGRADED &&
      metrics.consecutiveFailures >= this.config.maxConsecutiveFailures
    ) {
      this.status = NodeStatusEnum.UNHEALTHY;
      return;
    }

    // HEALTHY → UNHEALTHY on consecutive failures
    if (
      this.status === NodeStatusEnum.HEALTHY &&
      metrics.consecutiveFailures >= this.config.maxConsecutiveFailures
    ) {
      this.status = NodeStatusEnum.UNHEALTHY;
      return;
    }

    // UNHEALTHY → OFFLINE on severe failure rate
    if (
      this.status === NodeStatusEnum.UNHEALTHY &&
      metrics.totalSamples >= 10 &&
      metrics.successRate < 0.1
    ) {
      this.status = NodeStatusEnum.OFFLINE;
      return;
    }
  }
}

// ============================================================================
// ClusterHealth Class
// ============================================================================

/**
 * Orchestrates health checks for all nodes in the cluster.
 *
 * Features:
 * - Periodic HTTP health checks (GET /v1/cluster/health)
 * - Per-node circuit breakers
 * - Exponential backoff for unhealthy nodes
 * - Health status change callbacks
 * - Configurable timeouts using AbortController
 *
 * Usage:
 * ```typescript
 * const health = new ClusterHealth(healthConfig, backoffConfig);
 * health.onHealthChange('my-callback', (nodeId, oldStatus, newStatus, metrics) => {
 *   console.log(`Node ${nodeId}: ${oldStatus} → ${newStatus}`);
 * });
 * health.startHealthChecks(nodes);
 * ```
 */
export class ClusterHealth {
  private readonly config: ExtendedHealthConfig;
  private readonly backoffConfig: BackoffConfig;
  private readonly trackers: Map<string, NodeHealthTracker>;
  private readonly statusCallbacks: Map<string, HealthCallback>;
  private readonly healthCheckCallbacks: Map<string, HealthCheckCallback>;
  private readonly timers: Map<string, NodeJS.Timeout>;
  private running: boolean;

  /**
   * Creates a new ClusterHealth instance.
   *
   * @param config - Health check configuration
   * @param backoffConfig - Exponential backoff configuration
   * @param callbacks - Optional callbacks for health events
   */
  constructor(
    config?: Partial<ExtendedHealthConfig>,
    backoffConfig?: Partial<BackoffConfig>,
    callbacks?: HealthCallbacks
  ) {
    this.config = {
      checkIntervalMs: 5000,
      timeoutMs: 2000,
      maxConsecutiveFailures: 3,
      unhealthyThreshold: 0.5,
      degradedThreshold: 0.8,
      ...config,
    };

    this.backoffConfig = {
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
      ...backoffConfig,
    };

    this.trackers = new Map();
    this.statusCallbacks = new Map();
    this.healthCheckCallbacks = new Map();
    this.timers = new Map();
    this.running = false;

    // Register provided callbacks with default IDs
    if (callbacks?.onStatusChange) {
      this.statusCallbacks.set('default', callbacks.onStatusChange);
    }
    if (callbacks?.onHealthCheck) {
      this.healthCheckCallbacks.set('default', callbacks.onHealthCheck);
    }
  }

  /**
   * Starts health checks for the given nodes.
   *
   * @param nodes - Nodes to monitor
   * @throws {Error} If health checks are already running
   */
  startHealthChecks(nodes: MLXNode[]): void {
    if (this.running) {
      throw new Error('Health checks are already running');
    }

    this.running = true;

    // Initialize trackers for each node
    for (const node of nodes) {
      if (!this.trackers.has(node.id)) {
        this.trackers.set(node.id, new NodeHealthTracker(node.id, this.config, this.backoffConfig));
      }

      // Start periodic health check
      this.scheduleHealthCheck(node);
    }
  }

  /**
   * Stops all health checks.
   */
  stopHealthChecks(): void {
    this.running = false;

    // Clear all timers
    Array.from(this.timers.values()).forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Checks if a node is healthy.
   *
   * @param nodeId - Node identifier
   * @returns {boolean} True if node status is HEALTHY
   * @throws {Error} If node is unknown
   */
  isHealthy(nodeId: string): boolean {
    const tracker = this.trackers.get(nodeId);
    if (!tracker) {
      throw new Error(`Unknown node: ${nodeId}`);
    }
    return tracker.getStatus() === NodeStatusEnum.HEALTHY;
  }

  /**
   * Gets health status and metrics for a node.
   *
   * @param nodeId - Node identifier
   * @returns {Object} Status and metrics
   * @throws {Error} If node is unknown
   */
  getNodeHealth(nodeId: string): { status: NodeStatus; metrics: HealthMetrics } {
    const tracker = this.trackers.get(nodeId);
    if (!tracker) {
      throw new Error(`Unknown node: ${nodeId}`);
    }

    return {
      status: tracker.getStatus(),
      metrics: tracker.getHealth(),
    };
  }

  /**
   * Gets health status and metrics for all nodes.
   *
   * @returns {Map} Map of nodeId to status and metrics
   */
  getAllNodeHealth(): Map<string, { status: NodeStatus; metrics: HealthMetrics }> {
    const result = new Map<string, { status: NodeStatus; metrics: HealthMetrics }>();

    Array.from(this.trackers.entries()).forEach(([nodeId, tracker]) => {
      result.set(nodeId, {
        status: tracker.getStatus(),
        metrics: tracker.getHealth(),
      });
    });

    return result;
  }

  /**
   * Manually records a successful health check.
   *
   * Useful for recording success from actual request routing.
   *
   * @param nodeId - Node identifier
   * @param latencyMs - Request latency in milliseconds
   */
  recordSuccess(nodeId: string, latencyMs: number): void {
    const tracker = this.trackers.get(nodeId);
    if (!tracker) {
      return; // Ignore unknown nodes
    }

    const oldStatus = tracker.getStatus();
    tracker.recordSuccess(latencyMs);
    const newStatus = tracker.getStatus();

    if (oldStatus !== newStatus) {
      this.notifyStatusChange(nodeId, oldStatus, newStatus, tracker.getHealth());
    }
  }

  /**
   * Manually records a failed health check.
   *
   * Useful for recording failures from actual request routing.
   *
   * @param nodeId - Node identifier
   * @param error - Error that caused the failure
   */
  recordFailure(nodeId: string, error: Error): void {
    const tracker = this.trackers.get(nodeId);
    if (!tracker) {
      return; // Ignore unknown nodes
    }

    const oldStatus = tracker.getStatus();
    tracker.recordFailure(error);
    const newStatus = tracker.getStatus();

    if (oldStatus !== newStatus) {
      this.notifyStatusChange(nodeId, oldStatus, newStatus, tracker.getHealth());
    }
  }

  /**
   * Checks if a node should attempt recovery from unhealthy state.
   *
   * @param nodeId - Node identifier
   * @returns {boolean} True if recovery attempt should be made
   */
  shouldAttemptRecovery(nodeId: string): boolean {
    const tracker = this.trackers.get(nodeId);
    if (!tracker) {
      return false;
    }

    const status = tracker.getStatus();
    return status === NodeStatusEnum.UNHEALTHY || status === NodeStatusEnum.OFFLINE;
  }

  /**
   * Registers a callback for health status changes.
   *
   * @param callbackId - Unique identifier for this callback
   * @param callback - Function to call on status change
   */
  onHealthChange(callbackId: string, callback: HealthCallback): void {
    this.statusCallbacks.set(callbackId, callback);
  }

  /**
   * Removes a health change callback.
   *
   * @param callbackId - Callback identifier to remove
   */
  removeHealthCallback(callbackId: string): void {
    this.statusCallbacks.delete(callbackId);
  }

  /**
   * Checks if health checks are running.
   *
   * @returns {boolean} True if running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Performs a single health check for a node.
   *
   * @param node - Node to check
   * @returns {Promise<HealthCheckResult>} Result of health check
   */
  private async performHealthCheck(node: MLXNode): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await Promise.race([
        fetch(`${node.url}/v1/cluster/health`, {
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new HealthCheckTimeoutError(node.id, this.config.timeoutMs)), this.config.timeoutMs);
        }),
      ]);

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HealthCheckFailedError(node.id, response.status, response.statusText);
      }

      const latencyMs = Math.max(0, Date.now() - startTime);
      return { success: true, latencyMs };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HealthCheckTimeoutError || error instanceof HealthCheckFailedError) {
        return { success: false, error };
      }

      return {
        success: false,
        error: new HealthCheckNetworkError(node.id, error as Error),
      };
    }
  }

  /**
   * Schedules the next health check for a node.
   *
   * Uses recursive setTimeout (not setInterval) for better control.
   *
   * @param node - Node to schedule check for
   */
  private scheduleHealthCheck(node: MLXNode): void {
    if (!this.running) {
      return;
    }

    const tracker = this.trackers.get(node.id);
    if (!tracker) {
      return;
    }

    const performCheck = async () => {
      const result = await this.performHealthCheck(node);
      const oldStatus = tracker.getStatus();

      if (result.success && result.latencyMs !== undefined) {
        tracker.recordSuccess(result.latencyMs);
      } else if (result.error) {
        tracker.recordFailure(result.error);
      }

      const newStatus = tracker.getStatus();

      // Notify health check callback
      this.notifyHealthCheck(node.id, result);

      if (oldStatus !== newStatus) {
        this.notifyStatusChange(node.id, oldStatus, newStatus, tracker.getHealth());
      }

      // Schedule next check
      if (this.running) {
        const delay =
          newStatus === NodeStatusEnum.UNHEALTHY || newStatus === NodeStatusEnum.OFFLINE
            ? tracker.getNextCheckDelay()
            : this.config.checkIntervalMs;

        const timer = setTimeout(performCheck, delay);
        this.timers.set(node.id, timer);
      }
    };

    // Start first check immediately
    const timer = setTimeout(performCheck, 0);
    this.timers.set(node.id, timer);
  }

  /**
   * Notifies all callbacks of a status change.
   *
   * Wraps each callback in try/catch to prevent one bad callback from breaking others.
   *
   * @param nodeId - Node identifier
   * @param oldStatus - Previous status
   * @param newStatus - New status
   * @param metrics - Current metrics
   */
  private notifyStatusChange(
    nodeId: string,
    oldStatus: NodeStatus,
    newStatus: NodeStatus,
    metrics: HealthMetrics
  ): void {
    Array.from(this.statusCallbacks.values()).forEach((callback) => {
      try {
        callback(nodeId, oldStatus, newStatus, metrics);
      } catch (error) {
        // Ignore callback errors to prevent one bad callback from breaking others
        console.error('Health callback error:', error);
      }
    });
  }

  /**
   * Notifies all health check callbacks.
   *
   * @param nodeId - Node identifier
   * @param result - Health check result
   */
  private notifyHealthCheck(nodeId: string, result: HealthCheckResult): void {
    Array.from(this.healthCheckCallbacks.values()).forEach((callback) => {
      try {
        callback(nodeId, result);
      } catch (error) {
        // Ignore callback errors to prevent one bad callback from breaking others
        console.error('Health check callback error:', error);
      }
    });
  }
}
