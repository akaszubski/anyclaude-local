/**
 * Request Timeout Configuration & Validation
 *
 * Manages the configurable request timeout for streaming requests.
 * Validates that timeout is within reasonable bounds and provides helpful warnings.
 */

const MIN_TIMEOUT_MS = 30000; // 30 seconds - minimum needed for model loading
const MAX_TIMEOUT_MS = 3600000; // 1 hour - reasonable maximum
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes - default for large models

/**
 * Configuration for timeout with warnings
 */
export interface TimeoutConfig {
  timeout: number; // milliseconds
  isValid: boolean;
  warnings: string[];
}

/**
 * Get and validate request timeout from environment variables
 *
 * Reads ANYCLAUDE_REQUEST_TIMEOUT environment variable.
 * Falls back to default if not set or invalid.
 * Provides warnings if timeout is outside reasonable bounds.
 */
export function getTimeoutConfig(): TimeoutConfig {
  const timeoutEnv = process.env.ANYCLAUDE_REQUEST_TIMEOUT;
  const warnings: string[] = [];

  // Parse timeout
  let timeout = DEFAULT_TIMEOUT_MS;
  if (timeoutEnv) {
    const parsed = parseInt(timeoutEnv, 10);
    if (isNaN(parsed)) {
      warnings.push(
        `⚠️  Invalid ANYCLAUDE_REQUEST_TIMEOUT: "${timeoutEnv}" is not a number. Using default (${DEFAULT_TIMEOUT_MS}ms)`
      );
    } else {
      timeout = parsed;
    }
  }

  const isValid = timeout >= MIN_TIMEOUT_MS && timeout <= MAX_TIMEOUT_MS;

  // Check timeout bounds
  if (timeout < MIN_TIMEOUT_MS) {
    warnings.push(
      `⚠️  Request timeout too low: ${timeout}ms (30 seconds minimum).`
    );
    warnings.push(
      `   Large models like Qwen3-Coder-30B need 30-60 seconds just to load.`
    );
    warnings.push(
      `   Set ANYCLAUDE_REQUEST_TIMEOUT to at least ${MIN_TIMEOUT_MS} to avoid premature timeouts.`
    );
  }

  if (timeout > MAX_TIMEOUT_MS) {
    const hours = Math.round(timeout / 3600000);
    warnings.push(
      `⚠️  Request timeout very high: ${timeout}ms (${hours} hour${hours > 1 ? "s" : ""}).`
    );
    warnings.push(
      `   This is unusual. Double-check your configuration: ANYCLAUDE_REQUEST_TIMEOUT=${timeoutEnv}`
    );
  }

  // Info about specific model timings
  if (timeout < 60000) {
    warnings.push(
      `   Note: Qwen3-Coder-30B takes ~45 seconds to load, +30s to process first token.`
    );
  }

  return {
    timeout,
    isValid,
    warnings,
  };
}

/**
 * Format timeout in milliseconds as human-readable string
 */
export function formatTimeout(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Get helpful info string about timeout configuration
 */
export function getTimeoutInfoString(config: TimeoutConfig): string {
  const timeoutStr = formatTimeout(config.timeout);
  const status = config.isValid ? "✓" : "⚠️ ";
  return `${status} Request timeout: ${timeoutStr} (${config.timeout}ms)`;
}
