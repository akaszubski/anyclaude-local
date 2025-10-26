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
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private config: CircuitBreakerConfig;
  private onStateChange?: (state: CircuitState) => void;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      successThreshold: config.successThreshold ?? 2,
      retryTimeout: config.retryTimeout ?? 30000, // 30 seconds
      requestTimeout: config.requestTimeout ?? 5000, // 5 seconds
    };
  }

  /**
   * Register callback for state changes (for logging/monitoring)
   */
  public onStateChangeListener(callback: (state: CircuitState) => void): void {
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
    this.setState(CircuitState.CLOSED);
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

  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  private scheduleRetry(): void {
    this.nextAttempt = Date.now() + this.config.retryTimeout;
  }
}
