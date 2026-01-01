/**
 * Configuration parsing and validation for MLX cluster management.
 *
 * This module provides:
 * - Configuration file loading and parsing
 * - Default value merging (deep merge for nested objects)
 * - Environment variable overrides
 * - Comprehensive validation (URLs, strategies, ranges, required fields)
 * - Error reporting with context
 *
 * Usage:
 * ```typescript
 * const result = parseClusterConfig('/path/to/cluster.json');
 * if (result.success) {
 *   console.log('Config loaded:', result.config);
 * } else {
 *   console.error('Config error:', result.error);
 * }
 * ```
 *
 * @module cluster-config
 */

import * as fs from "fs";
import * as path from "path";
import type {
  MLXClusterConfig,
  HealthConfig,
  CacheConfig,
  RoutingConfig,
  DiscoveryConfig,
} from "./cluster-types";
import { LoadBalanceStrategy } from "./cluster-types";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for cluster configuration issues.
 *
 * Provides structured error information including error codes and context
 * for debugging and user-friendly error messages.
 *
 * Standard error codes:
 * - INVALID_CONFIG: Configuration structure is invalid
 * - MISSING_NODES: No nodes defined for static discovery mode
 * - INVALID_URL: Node URL is malformed or uses wrong protocol
 * - PARSE_ERROR: Failed to parse configuration file (invalid JSON)
 * - FILE_NOT_FOUND: Configuration file does not exist
 * - INVALID_STRATEGY: Load balance strategy is not recognized
 */
export class ClusterConfigError extends Error {
  /**
   * Error code identifying the type of configuration error.
   */
  public readonly code: string;

  /**
   * Additional context about the error (file path, field name, etc.).
   */
  public readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ClusterConfigError";
    this.code = code;
    this.context = context;

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClusterConfigError);
    }
  }
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of configuration validation.
 *
 * Provides detailed information about validation success/failure, including
 * specific missing fields, validation errors, and warnings.
 */
export interface ValidationResult {
  /** Whether the configuration is valid and can be used */
  readonly isValid: boolean;

  /** List of required fields that are missing */
  readonly missingRequired: string[];

  /** Non-fatal warnings about suboptimal configuration */
  readonly warnings: string[];

  /** Fatal validation errors that prevent config usage */
  readonly errors: string[];
}

/**
 * Result of configuration parsing and loading.
 *
 * Discriminated union: either success with config, or failure with error.
 */
export interface ClusterConfigResult {
  /** Whether configuration was successfully loaded and validated */
  readonly success: boolean;

  /** Parsed and validated configuration (only present if success=true) */
  readonly config?: MLXClusterConfig;

  /** Error that occurred during loading (only present if success=false) */
  readonly error?: ClusterConfigError;

  /** Non-fatal warnings about configuration (always present) */
  readonly warnings: string[];
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default health check configuration.
 *
 * Conservative values designed for reliable health monitoring without
 * excessive network traffic or false positives.
 */
const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  checkIntervalMs: 10000, // 10 seconds - frequent enough to detect issues quickly
  timeoutMs: 3000, // 3 seconds - generous timeout for network variability
  maxConsecutiveFailures: 3, // 3 failures - balance between sensitivity and stability
  unhealthyThreshold: 0.5, // 50% error rate - clear indicator of problems
};

/**
 * Default cache configuration.
 *
 * Values optimized for typical LLM inference workloads with reasonable
 * memory usage and cache effectiveness.
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxCacheAgeSec: 3600, // 1 hour - long enough for conversation continuity
  minCacheHitRate: 0.5, // 50% - expect at least half of requests to hit cache
  maxCacheSizeTokens: 128000, // 128k tokens - supports long contexts
};

/**
 * Default routing configuration.
 *
 * Round-robin provides good distribution without requiring complex metrics,
 * making it ideal as a default strategy.
 */
const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  strategy: LoadBalanceStrategy.ROUND_ROBIN, // Simple and effective
  maxRetries: 3, // 3 retries - handle transient failures
  retryDelayMs: 1000, // 1 second - avoid thundering herd
};

/**
 * Default discovery configuration.
 *
 * Static mode with undefined nodes - must be overridden by user.
 */
const DEFAULT_DISCOVERY_CONFIG: Partial<DiscoveryConfig> = {
  mode: "static",
  // nodes is intentionally undefined to allow validation to detect missing vs empty
};

// ============================================================================
// Configuration Merging
// ============================================================================

/**
 * Merge user-provided configuration with default values.
 *
 * Performs deep merge for nested objects (health, cache, routing, discovery),
 * ensuring all required fields have values even if user provides partial config.
 *
 * @param partial - User-provided partial configuration
 * @returns Complete configuration with all fields populated
 *
 * @example
 * ```typescript
 * const config = mergeWithDefaults({
 *   discovery: {
 *     mode: 'static',
 *     nodes: [{ url: 'http://localhost:8080', id: 'node-1' }]
 *   }
 * });
 * // Result includes default health, cache, and routing config
 * ```
 */
export function mergeWithDefaults(
  partial: Partial<MLXClusterConfig>
): MLXClusterConfig {
  // Deep merge helper for nested objects
  function deepMerge<T extends object>(
    defaults: T,
    overrides: Partial<T> | null | undefined
  ): T {
    if (!overrides || typeof overrides !== "object") {
      return defaults;
    }

    const result = { ...defaults };

    for (const key in overrides) {
      const override = overrides[key];
      if (override !== undefined && override !== null) {
        result[key] = override as T[Extract<keyof T, string>];
      }
    }

    return result;
  }

  return {
    discovery: deepMerge(
      DEFAULT_DISCOVERY_CONFIG,
      partial.discovery
    ) as DiscoveryConfig,
    health: deepMerge(DEFAULT_HEALTH_CONFIG, partial.health),
    cache: deepMerge(DEFAULT_CACHE_CONFIG, partial.cache),
    routing: deepMerge(DEFAULT_ROUTING_CONFIG, partial.routing),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate cluster configuration structure and values.
 *
 * Checks:
 * - Required fields are present
 * - URLs are valid (http:// or https://)
 * - Load balance strategy is recognized
 * - Numeric values are in valid ranges
 * - Thresholds are between 0.0 and 1.0
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors, warnings, and missing fields
 *
 * @example
 * ```typescript
 * const validation = validateClusterConfig(config);
 * if (!validation.isValid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */
export function validateClusterConfig(
  config: Partial<MLXClusterConfig>
): ValidationResult {
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate discovery configuration
  if (!config.discovery) {
    missingRequired.push("discovery");
  } else {
    const { discovery } = config;

    // For static mode, nodes are required
    if (discovery.mode === "static") {
      if (!discovery.nodes) {
        // Nodes field is completely missing
        missingRequired.push("discovery.nodes");
      } else if (discovery.nodes.length === 0) {
        // Nodes field exists but is empty
        errors.push(
          "Static discovery mode requires at least one node in nodes array"
        );
      } else {
        // Validate each node URL
        for (const node of discovery.nodes) {
          if (
            !node.url.startsWith("http://") &&
            !node.url.startsWith("https://")
          ) {
            errors.push(
              `Invalid URL for node ${node.id}: must start with http:// or https://`
            );
          }
        }
      }
    }
  }

  // Validate routing configuration
  if (config.routing) {
    const { routing } = config;

    // Validate strategy is one of the allowed values
    const validStrategies = Object.values(LoadBalanceStrategy);
    if (!validStrategies.includes(routing.strategy as LoadBalanceStrategy)) {
      errors.push(
        `Invalid load balance strategy: ${routing.strategy}. Must be one of: ${validStrategies.join(", ")}`
      );
    }

    // Validate retry values are non-negative
    if (routing.maxRetries < 0) {
      errors.push("maxRetries must be non-negative");
    }

    if (routing.retryDelayMs < 0) {
      errors.push("retryDelayMs must be non-negative");
    }

    // Warn if maxRetries is very high
    if (routing.maxRetries > 5) {
      warnings.push(
        `maxRetries is set to ${routing.maxRetries}, which may cause slow failure handling`
      );
    }
  }

  // Validate health configuration
  if (config.health) {
    const { health } = config;

    // All values must be positive
    if (health.checkIntervalMs <= 0) {
      errors.push("checkIntervalMs must be positive");
    }

    if (health.timeoutMs <= 0) {
      errors.push("timeoutMs must be positive");
    }

    if (health.maxConsecutiveFailures <= 0) {
      errors.push("maxConsecutiveFailures must be positive");
    }

    // Threshold must be between 0 and 1
    if (health.unhealthyThreshold < 0 || health.unhealthyThreshold > 1) {
      errors.push("unhealthy threshold must be between 0.0 and 1.0");
    }

    // Warn if check interval is very long (>= 60 seconds)
    if (health.checkIntervalMs >= 60000) {
      warnings.push(
        `Health check interval is ${health.checkIntervalMs}ms (>= 60s), which may delay failure detection`
      );
    }
  }

  // Validate cache configuration
  if (config.cache) {
    const { cache } = config;

    // All values must be positive
    if (cache.maxCacheAgeSec <= 0) {
      errors.push("maxCacheAgeSec must be positive");
    }

    if (cache.maxCacheSizeTokens <= 0) {
      errors.push("maxCacheSizeTokens must be positive");
    }

    // Cache hit rate threshold must be between 0 and 1
    if (cache.minCacheHitRate < 0 || cache.minCacheHitRate > 1) {
      errors.push("minCacheHitRate must be between 0.0 and 1.0");
    }
  }

  return {
    isValid: errors.length === 0 && missingRequired.length === 0,
    missingRequired,
    warnings,
    errors,
  };
}

// ============================================================================
// Environment Variable Overrides
// ============================================================================

/**
 * Apply environment variable overrides to configuration.
 *
 * Supported environment variables:
 * - MLX_CLUSTER_NODES: JSON array of node objects
 * - MLX_CLUSTER_STRATEGY: Load balance strategy
 * - MLX_CLUSTER_HEALTH_INTERVAL: Health check interval in milliseconds
 * - MLX_CLUSTER_ENABLED: Enable/disable clustering (boolean)
 *
 * Environment variables take precedence over file configuration.
 *
 * @param config - Base configuration to override
 * @returns New configuration with environment overrides applied
 * @throws {Error} If environment variable has invalid format or value
 *
 * @example
 * ```typescript
 * process.env.MLX_CLUSTER_STRATEGY = 'cache-aware';
 * const config = applyEnvOverrides(baseConfig);
 * // config.routing.strategy === LoadBalanceStrategy.CACHE_AWARE
 * ```
 */
export function applyEnvOverrides(config: MLXClusterConfig): MLXClusterConfig {
  // Start with a copy of the config
  let discovery = { ...config.discovery };
  let health = { ...config.health };
  let cache = { ...config.cache };
  let routing = { ...config.routing };
  let enabled: boolean | undefined;

  // Override nodes from environment
  if (process.env.MLX_CLUSTER_NODES) {
    try {
      const nodes = JSON.parse(process.env.MLX_CLUSTER_NODES);
      if (!Array.isArray(nodes)) {
        throw new Error("MLX_CLUSTER_NODES must be a JSON array");
      }
      discovery = {
        ...discovery,
        nodes,
      };
    } catch (err) {
      throw new Error(
        `Invalid MLX_CLUSTER_NODES environment variable: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Override strategy from environment
  if (process.env.MLX_CLUSTER_STRATEGY) {
    const strategy = process.env.MLX_CLUSTER_STRATEGY;
    const validStrategies = Object.values(LoadBalanceStrategy);

    if (!validStrategies.includes(strategy as LoadBalanceStrategy)) {
      throw new Error(
        `Invalid MLX_CLUSTER_STRATEGY: ${strategy}. Must be one of: ${validStrategies.join(", ")}`
      );
    }

    routing = {
      ...routing,
      strategy: strategy as LoadBalanceStrategy,
    };
  }

  // Override health check interval from environment
  if (process.env.MLX_CLUSTER_HEALTH_INTERVAL) {
    const interval = parseInt(process.env.MLX_CLUSTER_HEALTH_INTERVAL, 10);

    if (isNaN(interval)) {
      throw new Error(`Invalid MLX_CLUSTER_HEALTH_INTERVAL: must be a number`);
    }

    if (interval <= 0) {
      throw new Error(`Invalid MLX_CLUSTER_HEALTH_INTERVAL: must be positive`);
    }

    health = {
      ...health,
      checkIntervalMs: interval,
    };
  }

  // Override enabled flag from environment
  if (process.env.MLX_CLUSTER_ENABLED) {
    const enabledStr = process.env.MLX_CLUSTER_ENABLED.toLowerCase();

    if (enabledStr === "true") {
      enabled = true;
    } else if (enabledStr === "false") {
      enabled = false;
    } else {
      throw new Error(`Invalid MLX_CLUSTER_ENABLED: must be 'true' or 'false'`);
    }
  }

  // Build result object
  const result: MLXClusterConfig & { enabled?: boolean } = {
    discovery,
    health,
    cache,
    routing,
  };

  // Add enabled if it was set
  if (enabled !== undefined) {
    result.enabled = enabled;
  }

  return result;
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load, parse, and validate cluster configuration from file.
 *
 * This is the main entry point for configuration loading. It performs the
 * complete pipeline:
 * 1. Load configuration file (if path provided)
 * 2. Merge with default values
 * 3. Apply environment variable overrides
 * 4. Validate final configuration
 *
 * @param configFilePath - Path to configuration file (optional)
 * @returns Result object with success flag, config/error, and warnings
 *
 * @example
 * ```typescript
 * const result = parseClusterConfig('/etc/cluster.json');
 * if (result.success) {
 *   startCluster(result.config);
 * } else {
 *   console.error('Config error:', result.error.message);
 * }
 * ```
 */
export function parseClusterConfig(
  configFilePath?: string
): ClusterConfigResult {
  let parsedConfig: Partial<MLXClusterConfig> = {};

  // Step 1: Load configuration file (if provided)
  if (configFilePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        return {
          success: false,
          error: new ClusterConfigError(
            "FILE_NOT_FOUND",
            `Configuration file not found: ${configFilePath}`,
            { configPath: path.resolve(configFilePath) }
          ),
          warnings: [],
        };
      }

      // Read and parse file
      const fileContent = fs.readFileSync(configFilePath, "utf-8");

      // Handle empty or whitespace-only files
      if (!fileContent.trim()) {
        return {
          success: false,
          error: new ClusterConfigError(
            "PARSE_ERROR",
            "Configuration file is empty",
            { configPath: path.resolve(configFilePath) }
          ),
          warnings: [],
        };
      }

      parsedConfig = JSON.parse(fileContent);

      // Validate it's an object
      if (
        typeof parsedConfig !== "object" ||
        parsedConfig === null ||
        Array.isArray(parsedConfig)
      ) {
        return {
          success: false,
          error: new ClusterConfigError(
            "PARSE_ERROR",
            "Configuration must be a JSON object",
            { configPath: path.resolve(configFilePath) }
          ),
          warnings: [],
        };
      }
    } catch (err) {
      return {
        success: false,
        error: new ClusterConfigError(
          "PARSE_ERROR",
          `Failed to parse configuration file: ${err instanceof Error ? err.message : String(err)}`,
          { configPath: path.resolve(configFilePath) }
        ),
        warnings: [],
      };
    }
  }

  // Step 2: Merge with defaults
  let mergedConfig: MLXClusterConfig;
  try {
    mergedConfig = mergeWithDefaults(parsedConfig);
  } catch (err) {
    return {
      success: false,
      error: new ClusterConfigError(
        "INVALID_CONFIG",
        `Failed to merge configuration with defaults: ${err instanceof Error ? err.message : String(err)}`
      ),
      warnings: [],
    };
  }

  // Step 3: Apply environment variable overrides
  try {
    mergedConfig = applyEnvOverrides(mergedConfig);
  } catch (err) {
    return {
      success: false,
      error: new ClusterConfigError(
        "INVALID_CONFIG",
        `Failed to apply environment overrides: ${err instanceof Error ? err.message : String(err)}`
      ),
      warnings: [],
    };
  }

  // Step 4: Validate final configuration
  const validation = validateClusterConfig(mergedConfig);

  if (!validation.isValid) {
    // Construct error message from validation errors
    const errorMessages = [
      ...validation.errors,
      ...validation.missingRequired.map(
        (field) => `Missing required field: ${field}`
      ),
    ];

    return {
      success: false,
      error: new ClusterConfigError(
        "INVALID_CONFIG",
        `Configuration validation failed: ${errorMessages.join(", ")}`,
        {
          errors: validation.errors,
          missingRequired: validation.missingRequired,
        }
      ),
      warnings: validation.warnings,
    };
  }

  // Success!
  return {
    success: true,
    config: mergedConfig,
    warnings: validation.warnings,
  };
}
