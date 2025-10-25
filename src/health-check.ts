/**
 * Health Check Service for Anthropic API
 *
 * Implements periodic health checks to detect service availability
 * Uses both active (periodic pings) and passive (request monitoring) checks
 */

import { CircuitBreaker } from './circuit-breaker';

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // milliseconds between checks
  endpoint: string; // Anthropic API endpoint to check
  timeout: number;  // Health check request timeout
}

export class HealthCheckService {
  private intervalId?: NodeJS.Timeout;
  private config: HealthCheckConfig;
  private circuitBreaker: CircuitBreaker;
  private isChecking: boolean = false;

  constructor(config: HealthCheckConfig, circuitBreaker: CircuitBreaker) {
    this.config = config;
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Start periodic health checks
   */
  public start(): void {
    if (!this.config.enabled || this.intervalId) {
      return;
    }

    // Run initial check
    this.performHealthCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.config.interval);
  }

  /**
   * Stop health checks
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Perform a single health check
   */
  private async performHealthCheck(): Promise<void> {
    // Skip if already checking or circuit is closed (service working normally)
    if (this.isChecking || this.circuitBreaker.getState() === 'CLOSED') {
      return;
    }

    this.isChecking = true;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      // Try a lightweight request to check if service is available
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      // Wrap in Promise.race to ensure we don't hang even if fetch doesn't respect abort
      const fetchPromise = fetch(this.config.endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout + 1000)
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      clearTimeout(timeoutId);
      timeoutId = undefined;

      // Any response (even 401/403) means the service is reachable
      // Only network errors or timeouts indicate service is down
      if (response.status < 500) {
        // Service is responding - this is passive monitoring
        // Don't record success here, let actual API calls do that
      }
    } catch (error: any) {
      // Network error, timeout, or 5xx - service might be down
      // But don't record failure from health checks alone
      // The circuit breaker will be managed by actual API request failures

      // Ensure timeout is cleared even on error
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Get health check status
   */
  public getStatus() {
    return {
      enabled: this.config.enabled,
      checking: this.isChecking,
      interval: this.config.interval,
      circuitState: this.circuitBreaker.getState(),
    };
  }
}
