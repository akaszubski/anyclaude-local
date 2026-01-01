/**
 * Unit tests for cluster-config.ts
 *
 * Tests the configuration parsing and validation system for MLX cluster management:
 * 1. parseClusterConfig() - Load and parse cluster configuration
 * 2. validateClusterConfig() - Validate configuration structure and values
 * 3. mergeWithDefaults() - Merge user config with default values
 * 4. applyEnvOverrides() - Override config with environment variables
 * 5. ClusterConfigError - Custom error class for config issues
 * 6. ClusterConfigResult - Result type for config operations
 * 7. ValidationResult - Validation output structure
 *
 * Test categories:
 * - Default configuration merging
 * - Configuration validation (missing fields, invalid values)
 * - Environment variable overrides
 * - File loading and parsing
 * - Error handling and reporting
 * - Edge cases (empty config, malformed JSON, etc.)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  parseClusterConfig,
  validateClusterConfig,
  mergeWithDefaults,
  applyEnvOverrides,
  ClusterConfigError,
  ClusterConfigResult,
  ValidationResult,
} from "../../src/cluster/cluster-config";
import {
  MLXClusterConfig,
  LoadBalanceStrategy,
} from "../../src/cluster/cluster-types";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Test Data - Valid Configurations
// ============================================================================

const VALID_MINIMAL_CONFIG: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    nodes: [{ url: "http://localhost:8080", id: "node-1" }],
  },
};

const VALID_FULL_CONFIG: MLXClusterConfig = {
  discovery: {
    mode: "static" as const,
    nodes: [
      { url: "http://localhost:8080", id: "node-1" },
      { url: "http://localhost:8081", id: "node-2" },
    ],
  },
  health: {
    checkIntervalMs: 5000,
    timeoutMs: 2000,
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 0.5,
  },
  cache: {
    maxCacheAgeSec: 3600,
    minCacheHitRate: 0.5,
    maxCacheSizeTokens: 128000,
  },
  routing: {
    strategy: LoadBalanceStrategy.CACHE_AWARE,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
};

const VALID_KUBERNETES_CONFIG: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "kubernetes" as const,
    namespace: "production",
    serviceLabel: "app=mlx-worker",
  },
  routing: {
    strategy: LoadBalanceStrategy.LATENCY_BASED,
    maxRetries: 2,
    retryDelayMs: 500,
  },
};

// ============================================================================
// Test Data - Invalid Configurations
// ============================================================================

const INVALID_MISSING_NODES: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    // Missing nodes array
  },
};

const INVALID_EMPTY_NODES: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    nodes: [], // Empty array
  },
};

const INVALID_BAD_URL: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    nodes: [{ url: "not-a-valid-url", id: "node-1" }],
  },
};

const INVALID_STRATEGY: any = {
  discovery: {
    mode: "static" as const,
    nodes: [{ url: "http://localhost:8080", id: "node-1" }],
  },
  routing: {
    strategy: "INVALID_STRATEGY",
    maxRetries: 3,
    retryDelayMs: 1000,
  },
};

const INVALID_NEGATIVE_VALUES: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    nodes: [{ url: "http://localhost:8080", id: "node-1" }],
  },
  health: {
    checkIntervalMs: -1000,
    timeoutMs: -500,
    maxConsecutiveFailures: -1,
    unhealthyThreshold: -0.5,
  },
};

const INVALID_THRESHOLD_OUT_OF_RANGE: Partial<MLXClusterConfig> = {
  discovery: {
    mode: "static" as const,
    nodes: [{ url: "http://localhost:8080", id: "node-1" }],
  },
  health: {
    checkIntervalMs: 5000,
    timeoutMs: 2000,
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 1.5, // Should be 0.0-1.0
  },
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Save original environment variables and restore after each test
 */
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

/**
 * Helper to create a temporary config file for testing
 */
function createTempConfigFile(config: any): string {
  const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
  const configPath = path.join(tempDir, "cluster.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Helper to clean up temp files
 */
function cleanupTempFile(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    fs.unlinkSync(filePath);
    fs.rmdirSync(dir);
  } catch (err) {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Test Suite: ClusterConfigError
// ============================================================================

describe("ClusterConfigError", () => {
  describe("Error construction", () => {
    test("should create error with code and message", () => {
      const error = new ClusterConfigError(
        "INVALID_CONFIG",
        "Config is invalid"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ClusterConfigError);
      expect(error.code).toBe("INVALID_CONFIG");
      expect(error.message).toBe("Config is invalid");
    });

    test("should create error with context", () => {
      const error = new ClusterConfigError(
        "MISSING_NODES",
        "No nodes defined",
        { configPath: "/path/to/config.json" }
      );

      expect(error.code).toBe("MISSING_NODES");
      expect(error.message).toBe("No nodes defined");
      expect(error.context).toEqual({ configPath: "/path/to/config.json" });
    });

    test("should create error without context", () => {
      const error = new ClusterConfigError(
        "PARSE_ERROR",
        "Failed to parse JSON"
      );

      expect(error.code).toBe("PARSE_ERROR");
      expect(error.context).toBeUndefined();
    });

    test("should have proper error name", () => {
      const error = new ClusterConfigError("TEST_ERROR", "Test");
      expect(error.name).toBe("ClusterConfigError");
    });

    test("should be catchable as Error", () => {
      try {
        throw new ClusterConfigError("TEST", "Test error");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(ClusterConfigError);
      }
    });
  });

  describe("Error codes", () => {
    test("should support INVALID_CONFIG code", () => {
      const error = new ClusterConfigError("INVALID_CONFIG", "Invalid");
      expect(error.code).toBe("INVALID_CONFIG");
    });

    test("should support MISSING_NODES code", () => {
      const error = new ClusterConfigError("MISSING_NODES", "No nodes");
      expect(error.code).toBe("MISSING_NODES");
    });

    test("should support INVALID_URL code", () => {
      const error = new ClusterConfigError("INVALID_URL", "Bad URL");
      expect(error.code).toBe("INVALID_URL");
    });

    test("should support INVALID_STRATEGY code", () => {
      const error = new ClusterConfigError("INVALID_STRATEGY", "Bad strategy");
      expect(error.code).toBe("INVALID_STRATEGY");
    });

    test("should support PARSE_ERROR code", () => {
      const error = new ClusterConfigError("PARSE_ERROR", "Parse failed");
      expect(error.code).toBe("PARSE_ERROR");
    });

    test("should support FILE_NOT_FOUND code", () => {
      const error = new ClusterConfigError("FILE_NOT_FOUND", "File missing");
      expect(error.code).toBe("FILE_NOT_FOUND");
    });
  });
});

// ============================================================================
// Test Suite: ValidationResult
// ============================================================================

describe("ValidationResult Interface", () => {
  describe("Structure validation", () => {
    test("should have isValid boolean", () => {
      const result: ValidationResult = {
        isValid: true,
        missingRequired: [],
        warnings: [],
        errors: [],
      };

      expect(typeof result.isValid).toBe("boolean");
    });

    test("should have missingRequired array", () => {
      const result: ValidationResult = {
        isValid: false,
        missingRequired: ["discovery.nodes"],
        warnings: [],
        errors: [],
      };

      expect(Array.isArray(result.missingRequired)).toBe(true);
      expect(result.missingRequired).toContain("discovery.nodes");
    });

    test("should have warnings array", () => {
      const result: ValidationResult = {
        isValid: true,
        missingRequired: [],
        warnings: ["Using default values for health config"],
        errors: [],
      };

      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test("should have errors array", () => {
      const result: ValidationResult = {
        isValid: false,
        missingRequired: [],
        warnings: [],
        errors: ["Invalid URL format"],
      };

      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors).toContain("Invalid URL format");
    });
  });
});

// ============================================================================
// Test Suite: ClusterConfigResult
// ============================================================================

describe("ClusterConfigResult Interface", () => {
  describe("Success result structure", () => {
    test("should have success true with config", () => {
      const result: ClusterConfigResult = {
        success: true,
        config: VALID_FULL_CONFIG,
        warnings: [],
      };

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test("should include warnings array", () => {
      const result: ClusterConfigResult = {
        success: true,
        config: VALID_FULL_CONFIG,
        warnings: ["Using default cache config"],
      };

      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Error result structure", () => {
    test("should have success false with error", () => {
      const result: ClusterConfigResult = {
        success: false,
        error: new ClusterConfigError("INVALID_CONFIG", "Config invalid"),
        warnings: [],
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ClusterConfigError);
      expect(result.config).toBeUndefined();
    });

    test("should include error details", () => {
      const error = new ClusterConfigError(
        "MISSING_NODES",
        "No nodes defined",
        { field: "discovery.nodes" }
      );

      const result: ClusterConfigResult = {
        success: false,
        error,
        warnings: [],
      };

      expect(result.error?.code).toBe("MISSING_NODES");
      expect(result.error?.message).toBe("No nodes defined");
      expect(result.error?.context).toEqual({ field: "discovery.nodes" });
    });
  });
});

// ============================================================================
// Test Suite: mergeWithDefaults()
// ============================================================================

describe("mergeWithDefaults()", () => {
  describe("Default value merging", () => {
    test("should return defaults for empty object", () => {
      const result = mergeWithDefaults({});

      expect(result).toBeDefined();
      expect(result.discovery).toBeDefined();
      expect(result.health).toBeDefined();
      expect(result.cache).toBeDefined();
      expect(result.routing).toBeDefined();
    });

    test("should preserve user-provided discovery config", () => {
      const result = mergeWithDefaults(VALID_MINIMAL_CONFIG);

      expect(result.discovery).toEqual(VALID_MINIMAL_CONFIG.discovery);
    });

    test("should add default health config if missing", () => {
      const result = mergeWithDefaults(VALID_MINIMAL_CONFIG);

      expect(result.health).toBeDefined();
      expect(result.health.checkIntervalMs).toBeGreaterThan(0);
      expect(result.health.timeoutMs).toBeGreaterThan(0);
      expect(result.health.maxConsecutiveFailures).toBeGreaterThan(0);
      expect(result.health.unhealthyThreshold).toBeGreaterThan(0);
      expect(result.health.unhealthyThreshold).toBeLessThanOrEqual(1);
    });

    test("should add default cache config if missing", () => {
      const result = mergeWithDefaults(VALID_MINIMAL_CONFIG);

      expect(result.cache).toBeDefined();
      expect(result.cache.maxCacheAgeSec).toBeGreaterThan(0);
      expect(result.cache.minCacheHitRate).toBeGreaterThanOrEqual(0);
      expect(result.cache.minCacheHitRate).toBeLessThanOrEqual(1);
      expect(result.cache.maxCacheSizeTokens).toBeGreaterThan(0);
    });

    test("should add default routing config if missing", () => {
      const result = mergeWithDefaults(VALID_MINIMAL_CONFIG);

      expect(result.routing).toBeDefined();
      expect(result.routing.strategy).toBeDefined();
      expect(Object.values(LoadBalanceStrategy)).toContain(
        result.routing.strategy
      );
      expect(result.routing.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result.routing.retryDelayMs).toBeGreaterThanOrEqual(0);
    });

    test("should preserve user values over defaults", () => {
      const result = mergeWithDefaults(VALID_FULL_CONFIG);

      expect(result.health.checkIntervalMs).toBe(5000);
      expect(result.cache.maxCacheAgeSec).toBe(3600);
      expect(result.routing.strategy).toBe(LoadBalanceStrategy.CACHE_AWARE);
    });
  });

  describe("Deep merging", () => {
    test("should deep merge nested objects", () => {
      const partialConfig: Partial<MLXClusterConfig> = {
        discovery: VALID_MINIMAL_CONFIG.discovery,
        health: {
          checkIntervalMs: 10000,
          // Other health fields should be filled with defaults
        } as any,
      };

      const result = mergeWithDefaults(partialConfig);

      expect(result.health.checkIntervalMs).toBe(10000);
      expect(result.health.timeoutMs).toBeDefined();
      expect(result.health.maxConsecutiveFailures).toBeDefined();
      expect(result.health.unhealthyThreshold).toBeDefined();
    });

    test("should not override user values in nested objects", () => {
      const customConfig: Partial<MLXClusterConfig> = {
        discovery: VALID_MINIMAL_CONFIG.discovery,
        cache: {
          maxCacheAgeSec: 7200,
          minCacheHitRate: 0.8,
          maxCacheSizeTokens: 256000,
        },
      };

      const result = mergeWithDefaults(customConfig);

      expect(result.cache.maxCacheAgeSec).toBe(7200);
      expect(result.cache.minCacheHitRate).toBe(0.8);
      expect(result.cache.maxCacheSizeTokens).toBe(256000);
    });

    test("should handle partial routing config", () => {
      const partialConfig: Partial<MLXClusterConfig> = {
        discovery: VALID_MINIMAL_CONFIG.discovery,
        routing: {
          strategy: LoadBalanceStrategy.ROUND_ROBIN,
          // maxRetries and retryDelayMs should get defaults
        } as any,
      };

      const result = mergeWithDefaults(partialConfig);

      expect(result.routing.strategy).toBe(LoadBalanceStrategy.ROUND_ROBIN);
      expect(result.routing.maxRetries).toBeDefined();
      expect(result.routing.retryDelayMs).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    test("should handle null values", () => {
      const result = mergeWithDefaults({ discovery: null } as any);
      expect(result.discovery).toBeDefined();
    });

    test("should handle undefined values", () => {
      const result = mergeWithDefaults({ health: undefined } as any);
      expect(result.health).toBeDefined();
    });

    test("should not mutate input config", () => {
      const input = { ...VALID_MINIMAL_CONFIG };
      const inputCopy = JSON.parse(JSON.stringify(input));

      mergeWithDefaults(input);

      expect(input).toEqual(inputCopy);
    });

    test("should handle config with extra unknown fields", () => {
      const configWithExtra: any = {
        ...VALID_MINIMAL_CONFIG,
        unknownField: "should be ignored",
      };

      const result = mergeWithDefaults(configWithExtra);
      expect(result).toBeDefined();
    });
  });

  describe("Default values", () => {
    test("should use sensible health check defaults", () => {
      const result = mergeWithDefaults({});

      // Health check interval should be 5-30 seconds
      expect(result.health.checkIntervalMs).toBeGreaterThanOrEqual(5000);
      expect(result.health.checkIntervalMs).toBeLessThanOrEqual(30000);

      // Timeout should be less than check interval
      expect(result.health.timeoutMs).toBeLessThan(
        result.health.checkIntervalMs
      );

      // Reasonable failure threshold
      expect(result.health.maxConsecutiveFailures).toBeGreaterThanOrEqual(2);
      expect(result.health.maxConsecutiveFailures).toBeLessThanOrEqual(5);
    });

    test("should use sensible cache defaults", () => {
      const result = mergeWithDefaults({});

      // Cache age: 30 min - 2 hours
      expect(result.cache.maxCacheAgeSec).toBeGreaterThanOrEqual(1800);
      expect(result.cache.maxCacheAgeSec).toBeLessThanOrEqual(7200);

      // Cache hit rate threshold: 0.3 - 0.7
      expect(result.cache.minCacheHitRate).toBeGreaterThanOrEqual(0.3);
      expect(result.cache.minCacheHitRate).toBeLessThanOrEqual(0.7);

      // Max cache size: 64k - 256k tokens
      expect(result.cache.maxCacheSizeTokens).toBeGreaterThanOrEqual(64000);
      expect(result.cache.maxCacheSizeTokens).toBeLessThanOrEqual(256000);
    });

    test("should use sensible routing defaults", () => {
      const result = mergeWithDefaults({});

      // Default strategy should be one of the valid strategies
      expect(Object.values(LoadBalanceStrategy)).toContain(
        result.routing.strategy
      );

      // Retries: 1-5
      expect(result.routing.maxRetries).toBeGreaterThanOrEqual(1);
      expect(result.routing.maxRetries).toBeLessThanOrEqual(5);

      // Retry delay: 100ms - 2000ms
      expect(result.routing.retryDelayMs).toBeGreaterThanOrEqual(100);
      expect(result.routing.retryDelayMs).toBeLessThanOrEqual(2000);
    });
  });
});

// ============================================================================
// Test Suite: validateClusterConfig()
// ============================================================================

describe("validateClusterConfig()", () => {
  describe("Valid configuration validation", () => {
    test("should validate minimal valid config", () => {
      const merged = mergeWithDefaults(VALID_MINIMAL_CONFIG);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingRequired).toHaveLength(0);
    });

    test("should validate full valid config", () => {
      const result = validateClusterConfig(VALID_FULL_CONFIG);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingRequired).toHaveLength(0);
    });

    test("should validate Kubernetes config", () => {
      const merged = mergeWithDefaults(VALID_KUBERNETES_CONFIG);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should return empty warnings for valid config", () => {
      const result = validateClusterConfig(VALID_FULL_CONFIG);

      // May have warnings, but should be an array
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("Invalid configuration detection", () => {
    test("should fail when nodes array is missing for static mode", () => {
      const merged = mergeWithDefaults(INVALID_MISSING_NODES);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.missingRequired.length).toBeGreaterThan(0);
      expect(result.missingRequired).toContain("discovery.nodes");
    });

    test("should fail when nodes array is empty for static mode", () => {
      const merged = mergeWithDefaults(INVALID_EMPTY_NODES);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e: string) => e.includes("nodes"))).toBe(true);
    });

    test("should fail when node URL is invalid", () => {
      const merged = mergeWithDefaults(INVALID_BAD_URL);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e: string) => e.toLowerCase().includes("url"))
      ).toBe(true);
    });

    test("should fail when strategy is invalid", () => {
      const merged = mergeWithDefaults(INVALID_STRATEGY);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e: string) => e.toLowerCase().includes("strategy"))
      ).toBe(true);
    });

    test("should fail when health values are negative", () => {
      const merged = mergeWithDefaults(INVALID_NEGATIVE_VALUES);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("should fail when threshold is out of range", () => {
      const merged = mergeWithDefaults(INVALID_THRESHOLD_OUT_OF_RANGE);
      const result = validateClusterConfig(merged);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e: string) => e.includes("threshold"))).toBe(
        true
      );
    });
  });

  describe("URL validation", () => {
    test("should accept http URLs", () => {
      const config = mergeWithDefaults({
        discovery: {
          mode: "static" as const,
          nodes: [{ url: "http://localhost:8080", id: "node-1" }],
        },
      });

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should accept https URLs", () => {
      const config = mergeWithDefaults({
        discovery: {
          mode: "static" as const,
          nodes: [{ url: "https://mlx.example.com:443", id: "node-1" }],
        },
      });

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should reject URLs without protocol", () => {
      const config = mergeWithDefaults({
        discovery: {
          mode: "static" as const,
          nodes: [{ url: "localhost:8080", id: "node-1" }],
        },
      });

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });

    test("should reject URLs with invalid protocol", () => {
      const config = mergeWithDefaults({
        discovery: {
          mode: "static" as const,
          nodes: [{ url: "ftp://localhost:8080", id: "node-1" }],
        },
      });

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });

    test("should accept URLs with path", () => {
      const config = mergeWithDefaults({
        discovery: {
          mode: "static" as const,
          nodes: [{ url: "http://localhost:8080/v1/api", id: "node-1" }],
        },
      });

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });
  });

  describe("Strategy validation", () => {
    test("should accept ROUND_ROBIN strategy", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          strategy: LoadBalanceStrategy.ROUND_ROBIN,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should accept LEAST_LOADED strategy", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          strategy: LoadBalanceStrategy.LEAST_LOADED,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should accept CACHE_AWARE strategy", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          strategy: LoadBalanceStrategy.CACHE_AWARE,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should accept LATENCY_BASED strategy", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          strategy: LoadBalanceStrategy.LATENCY_BASED,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should reject unknown strategy", () => {
      const config: any = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          strategy: "UNKNOWN_STRATEGY",
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });
  });

  describe("Range validation", () => {
    test("should validate checkIntervalMs is positive", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        health: {
          ...VALID_FULL_CONFIG.health,
          checkIntervalMs: -1000,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });

    test("should validate unhealthyThreshold is between 0 and 1", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        health: {
          ...VALID_FULL_CONFIG.health,
          unhealthyThreshold: 2.0,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });

    test("should validate minCacheHitRate is between 0 and 1", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        cache: {
          ...VALID_FULL_CONFIG.cache,
          minCacheHitRate: -0.1,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(false);
    });

    test("should accept 0 retries", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          maxRetries: 0,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });

    test("should accept 0 retry delay", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          retryDelayMs: 0,
        },
      };

      const result = validateClusterConfig(config);
      expect(result.isValid).toBe(true);
    });
  });

  describe("Warnings generation", () => {
    test("should warn if checkIntervalMs is very long", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        health: {
          ...VALID_FULL_CONFIG.health,
          checkIntervalMs: 60000, // 1 minute
        },
      };

      const result = validateClusterConfig(config);

      // May generate warnings for long intervals
      if (result.warnings.length > 0) {
        expect(
          result.warnings.some((w: string) => w.includes("interval"))
        ).toBe(true);
      }
    });

    test("should warn if maxRetries is very high", () => {
      const config: MLXClusterConfig = {
        ...VALID_FULL_CONFIG,
        routing: {
          ...VALID_FULL_CONFIG.routing,
          maxRetries: 10,
        },
      };

      const result = validateClusterConfig(config);

      // May generate warnings for many retries
      if (result.warnings.length > 0) {
        expect(Array.isArray(result.warnings)).toBe(true);
      }
    });
  });
});

// ============================================================================
// Test Suite: applyEnvOverrides()
// ============================================================================

describe("applyEnvOverrides()", () => {
  describe("Environment variable overrides", () => {
    test("should override nodes from MLX_CLUSTER_NODES", () => {
      const nodesJson = JSON.stringify([
        { url: "http://env-node-1:8080", id: "env-node-1" },
        { url: "http://env-node-2:8081", id: "env-node-2" },
      ]);
      process.env.MLX_CLUSTER_NODES = nodesJson;

      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result.discovery.nodes).toHaveLength(2);
      expect(result.discovery.nodes?.[0].id).toBe("env-node-1");
      expect(result.discovery.nodes?.[1].id).toBe("env-node-2");
    });

    test("should override strategy from MLX_CLUSTER_STRATEGY", () => {
      process.env.MLX_CLUSTER_STRATEGY = "latency-based";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result.routing.strategy).toBe(LoadBalanceStrategy.LATENCY_BASED);
    });

    test("should override health interval from MLX_CLUSTER_HEALTH_INTERVAL", () => {
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "10000";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result.health.checkIntervalMs).toBe(10000);
    });

    test("should not modify config if no env vars set", () => {
      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result).toEqual(VALID_FULL_CONFIG);
    });

    test("should handle multiple env overrides together", () => {
      process.env.MLX_CLUSTER_STRATEGY = "round-robin";
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "15000";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result.routing.strategy).toBe(LoadBalanceStrategy.ROUND_ROBIN);
      expect(result.health.checkIntervalMs).toBe(15000);
    });
  });

  describe("Invalid environment values", () => {
    test("should throw on invalid JSON in MLX_CLUSTER_NODES", () => {
      process.env.MLX_CLUSTER_NODES = "not-valid-json";

      expect(() => {
        applyEnvOverrides(VALID_FULL_CONFIG);
      }).toThrow();
    });

    test("should throw on invalid strategy value", () => {
      process.env.MLX_CLUSTER_STRATEGY = "INVALID_STRATEGY";

      expect(() => {
        applyEnvOverrides(VALID_FULL_CONFIG);
      }).toThrow();
    });

    test("should throw on invalid number format", () => {
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "not-a-number";

      expect(() => {
        applyEnvOverrides(VALID_FULL_CONFIG);
      }).toThrow();
    });

    test("should throw on negative health interval", () => {
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "-5000";

      expect(() => {
        applyEnvOverrides(VALID_FULL_CONFIG);
      }).toThrow();
    });
  });

  describe("Type conversion", () => {
    test("should parse boolean from MLX_CLUSTER_ENABLED", () => {
      process.env.MLX_CLUSTER_ENABLED = "true";

      const config: any = { ...VALID_FULL_CONFIG, enabled: false };
      const result = applyEnvOverrides(config);

      if ("enabled" in result) {
        expect(result.enabled).toBe(true);
      }
    });

    test("should parse false boolean from MLX_CLUSTER_ENABLED", () => {
      process.env.MLX_CLUSTER_ENABLED = "false";

      const config: any = { ...VALID_FULL_CONFIG, enabled: true };
      const result = applyEnvOverrides(config);

      if ("enabled" in result) {
        expect(result.enabled).toBe(false);
      }
    });

    test("should parse integers correctly", () => {
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "5000";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);

      expect(result.health.checkIntervalMs).toBe(5000);
      expect(typeof result.health.checkIntervalMs).toBe("number");
    });
  });

  describe("Immutability", () => {
    test("should not mutate original config", () => {
      const original = { ...VALID_FULL_CONFIG };
      const originalCopy = JSON.parse(JSON.stringify(original));

      process.env.MLX_CLUSTER_STRATEGY = "round-robin";
      applyEnvOverrides(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe("Supported environment variables", () => {
    test("should support MLX_CLUSTER_NODES", () => {
      const nodesJson = JSON.stringify([
        { url: "http://test:8080", id: "test" },
      ]);
      process.env.MLX_CLUSTER_NODES = nodesJson;

      const result = applyEnvOverrides(VALID_FULL_CONFIG);
      expect(result.discovery.nodes?.[0].id).toBe("test");
    });

    test("should support MLX_CLUSTER_STRATEGY", () => {
      process.env.MLX_CLUSTER_STRATEGY = "least-loaded";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);
      expect(result.routing.strategy).toBe(LoadBalanceStrategy.LEAST_LOADED);
    });

    test("should support MLX_CLUSTER_HEALTH_INTERVAL", () => {
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "8000";

      const result = applyEnvOverrides(VALID_FULL_CONFIG);
      expect(result.health.checkIntervalMs).toBe(8000);
    });

    test("should support MLX_CLUSTER_ENABLED", () => {
      process.env.MLX_CLUSTER_ENABLED = "false";

      const config: any = { ...VALID_FULL_CONFIG, enabled: true };
      const result = applyEnvOverrides(config);

      if ("enabled" in result) {
        expect(result.enabled).toBe(false);
      }
    });
  });
});

// ============================================================================
// Test Suite: parseClusterConfig()
// ============================================================================

describe("parseClusterConfig()", () => {
  describe("File loading", () => {
    test("should load valid config file", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.discovery).toEqual(VALID_FULL_CONFIG.discovery);

      cleanupTempFile(configPath);
    });

    test("should handle missing file", () => {
      const result = parseClusterConfig("/nonexistent/path/config.json");

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ClusterConfigError);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
    });

    test("should handle invalid JSON", () => {
      const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
      const configPath = path.join(tempDir, "invalid.json");
      fs.writeFileSync(configPath, "{ invalid json }");

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ClusterConfigError);
      expect(result.error?.code).toBe("PARSE_ERROR");

      cleanupTempFile(configPath);
    });

    test("should return absolute path in error context", () => {
      const result = parseClusterConfig("/nonexistent/config.json");

      expect(result.error?.context?.configPath).toBe(
        "/nonexistent/config.json"
      );
    });
  });

  describe("Configuration merging", () => {
    test("should merge file config with defaults", () => {
      const configPath = createTempConfigFile(VALID_MINIMAL_CONFIG);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config?.health).toBeDefined();
      expect(result.config?.cache).toBeDefined();
      expect(result.config?.routing).toBeDefined();

      cleanupTempFile(configPath);
    });

    test("should preserve file config values", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config?.health.checkIntervalMs).toBe(5000);
      expect(result.config?.routing.strategy).toBe(
        LoadBalanceStrategy.CACHE_AWARE
      );

      cleanupTempFile(configPath);
    });
  });

  describe("Environment variable integration", () => {
    test("should apply env overrides to loaded config", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);
      process.env.MLX_CLUSTER_STRATEGY = "round-robin";

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config?.routing.strategy).toBe(
        LoadBalanceStrategy.ROUND_ROBIN
      );

      cleanupTempFile(configPath);
    });

    test("should prioritize env vars over file config", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);
      process.env.MLX_CLUSTER_HEALTH_INTERVAL = "20000";

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config?.health.checkIntervalMs).toBe(20000);
      expect(result.config?.health.checkIntervalMs).not.toBe(5000); // Original value

      cleanupTempFile(configPath);
    });
  });

  describe("Validation integration", () => {
    test("should validate merged config", () => {
      const configPath = createTempConfigFile(INVALID_EMPTY_NODES);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONFIG");

      cleanupTempFile(configPath);
    });

    test("should fail on invalid merged config", () => {
      const configPath = createTempConfigFile(INVALID_BAD_URL);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);

      cleanupTempFile(configPath);
    });

    test("should include validation errors in result", () => {
      const configPath = createTempConfigFile(INVALID_STRATEGY);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      cleanupTempFile(configPath);
    });
  });

  describe("Complete pipeline", () => {
    test("should execute full pipeline: load → merge → override → validate", () => {
      const configPath = createTempConfigFile(VALID_MINIMAL_CONFIG);
      process.env.MLX_CLUSTER_STRATEGY = "cache-aware";

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();

      // From file
      expect(result.config?.discovery.mode).toBe("static");

      // From defaults
      expect(result.config?.health).toBeDefined();

      // From env override
      expect(result.config?.routing.strategy).toBe(
        LoadBalanceStrategy.CACHE_AWARE
      );

      cleanupTempFile(configPath);
    });

    test("should include warnings in successful result", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);

      cleanupTempFile(configPath);
    });

    test("should handle config with no warnings", () => {
      const configPath = createTempConfigFile(VALID_FULL_CONFIG);

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();

      cleanupTempFile(configPath);
    });
  });

  describe("Edge cases", () => {
    test("should handle empty file", () => {
      const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
      const configPath = path.join(tempDir, "empty.json");
      fs.writeFileSync(configPath, "");

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);

      cleanupTempFile(configPath);
    });

    test("should handle file with only whitespace", () => {
      const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
      const configPath = path.join(tempDir, "whitespace.json");
      fs.writeFileSync(configPath, "   \n\n\t  ");

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);

      cleanupTempFile(configPath);
    });

    test("should handle file with null content", () => {
      const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
      const configPath = path.join(tempDir, "null.json");
      fs.writeFileSync(configPath, "null");

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);

      cleanupTempFile(configPath);
    });

    test("should handle file with array instead of object", () => {
      const tempDir = fs.mkdtempSync(path.join("/tmp", "cluster-config-test-"));
      const configPath = path.join(tempDir, "array.json");
      fs.writeFileSync(configPath, "[]");

      const result = parseClusterConfig(configPath);

      expect(result.success).toBe(false);

      cleanupTempFile(configPath);
    });
  });
});
