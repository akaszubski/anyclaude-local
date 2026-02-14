/**
 * Unit tests for configurable circuit breaker thresholds per backend mode
 *
 * Tests the circuit breaker configuration system (Issue TBD):
 * 1. Per-mode default thresholds (local/mlx-cluster: 120s, cloud: 30s)
 * 2. User configuration overrides defaults
 * 3. enabled: false disables latency monitoring (latencyThresholdMs=0)
 * 4. Missing/undefined config uses mode defaults
 * 5. Backward compatibility: no circuitBreaker config works
 *
 * Test categories:
 * - Default configurations per mode
 * - User override behavior
 * - Disable latency monitoring
 * - Config merging logic
 * - Backward compatibility
 *
 * Expected: ALL TESTS FAIL (TDD red phase - getCircuitBreakerConfig doesn't exist yet)
 */

import { getCircuitBreakerConfig } from "../../src/anthropic-proxy";

// ============================================================================
// Test Suite: Default Circuit Breaker Configurations
// ============================================================================
describe("CircuitBreaker Config - Default Configurations", () => {
  describe("local mode defaults", () => {
    test("should return 120s latency threshold for local mode", () => {
      const config = getCircuitBreakerConfig("local");

      expect(config.latencyThresholdMs).toBe(120000);
    });

    test("should use default failure threshold for local mode", () => {
      const config = getCircuitBreakerConfig("local");

      expect(config.failureThreshold).toBe(5);
    });

    test("should enable circuit breaker by default for local mode", () => {
      const config = getCircuitBreakerConfig("local");

      expect(config.latencyThresholdMs).toBeGreaterThan(0);
    });
  });

  describe("mlx-cluster mode defaults", () => {
    test("should return 120s latency threshold for mlx-cluster mode", () => {
      const config = getCircuitBreakerConfig("mlx-cluster");

      expect(config.latencyThresholdMs).toBe(120000);
    });

    test("should match local mode defaults for consistency", () => {
      const localConfig = getCircuitBreakerConfig("local");
      const mlxConfig = getCircuitBreakerConfig("mlx-cluster");

      expect(mlxConfig.latencyThresholdMs).toBe(localConfig.latencyThresholdMs);
      expect(mlxConfig.failureThreshold).toBe(localConfig.failureThreshold);
    });
  });

  describe("openrouter mode defaults", () => {
    test("should return 30s latency threshold for openrouter mode", () => {
      const config = getCircuitBreakerConfig("openrouter");

      expect(config.latencyThresholdMs).toBe(30000);
    });

    test("should use shorter threshold for cloud service", () => {
      const openrouterConfig = getCircuitBreakerConfig("openrouter");
      const localConfig = getCircuitBreakerConfig("local");

      expect(openrouterConfig.latencyThresholdMs).toBeLessThan(
        localConfig.latencyThresholdMs
      );
    });
  });

  describe("claude mode defaults", () => {
    test("should return 30s latency threshold for claude mode", () => {
      const config = getCircuitBreakerConfig("claude");

      expect(config.latencyThresholdMs).toBe(30000);
    });

    test("should match openrouter defaults for cloud services", () => {
      const claudeConfig = getCircuitBreakerConfig("claude");
      const openrouterConfig = getCircuitBreakerConfig("openrouter");

      expect(claudeConfig.latencyThresholdMs).toBe(
        openrouterConfig.latencyThresholdMs
      );
    });
  });
});

// ============================================================================
// Test Suite: User Configuration Overrides
// ============================================================================

describe("CircuitBreaker Config - User Overrides", () => {
  describe("override latency threshold", () => {
    test("should override default latency threshold with user value", () => {
      const userConfig = { latencyThresholdMs: 60000 };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(60000);
    });

    test("should allow custom threshold for cloud mode", () => {
      const userConfig = { latencyThresholdMs: 45000 };
      const config = getCircuitBreakerConfig("openrouter", userConfig);

      expect(config.latencyThresholdMs).toBe(45000);
    });

    test("should accept zero as explicit override", () => {
      const userConfig = { latencyThresholdMs: 0 };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(0);
    });
  });

  describe("override failure threshold", () => {
    test("should override default failure threshold", () => {
      const userConfig = { failureThreshold: 10 };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.failureThreshold).toBe(10);
    });

    test("should merge latency and failure overrides", () => {
      const userConfig = {
        latencyThresholdMs: 90000,
        failureThreshold: 3,
      };
      const config = getCircuitBreakerConfig("mlx-cluster", userConfig);

      expect(config.latencyThresholdMs).toBe(90000);
      expect(config.failureThreshold).toBe(3);
    });
  });

  describe("partial user config", () => {
    test("should merge user config with defaults", () => {
      const userConfig = { failureThreshold: 7 };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.failureThreshold).toBe(7);
      expect(config.latencyThresholdMs).toBe(120000); // Default
    });

    test("should preserve unspecified defaults", () => {
      const userConfig = { latencyThresholdMs: 50000 };
      const config = getCircuitBreakerConfig("openrouter", userConfig);

      expect(config.latencyThresholdMs).toBe(50000);
      expect(config.failureThreshold).toBe(5); // Default
    });
  });
});

// ============================================================================
// Test Suite: Disable Latency Monitoring
// ============================================================================

describe("CircuitBreaker Config - Disable Monitoring", () => {
  describe("enabled: false disables latency", () => {
    test("should set latencyThresholdMs to 0 when enabled: false", () => {
      const userConfig = { enabled: false };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(0);
    });

    test("should disable for cloud mode too", () => {
      const userConfig = { enabled: false };
      const config = getCircuitBreakerConfig("openrouter", userConfig);

      expect(config.latencyThresholdMs).toBe(0);
    });

    test("should override explicit latencyThresholdMs when disabled", () => {
      const userConfig = {
        enabled: false,
        latencyThresholdMs: 60000,
      };
      const config = getCircuitBreakerConfig("local", userConfig);

      // enabled: false takes precedence
      expect(config.latencyThresholdMs).toBe(0);
    });

    test("should preserve failure threshold when latency disabled", () => {
      const userConfig = {
        enabled: false,
        failureThreshold: 3,
      };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(0);
      expect(config.failureThreshold).toBe(3);
    });
  });

  describe("enabled: true preserves defaults", () => {
    test("should use defaults when enabled: true", () => {
      const userConfig = { enabled: true };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(120000);
    });

    test("should allow overrides when enabled: true", () => {
      const userConfig = {
        enabled: true,
        latencyThresholdMs: 90000,
      };
      const config = getCircuitBreakerConfig("local", userConfig);

      expect(config.latencyThresholdMs).toBe(90000);
    });
  });
});

// ============================================================================
// Test Suite: Missing/Undefined Config
// ============================================================================

describe("CircuitBreaker Config - Missing Config", () => {
  describe("undefined user config", () => {
    test("should use mode defaults when userConfig undefined", () => {
      const config = getCircuitBreakerConfig("local", undefined);

      expect(config.latencyThresholdMs).toBe(120000);
      expect(config.failureThreshold).toBe(5);
    });

    test("should work with no second argument", () => {
      const config = getCircuitBreakerConfig("openrouter");

      expect(config.latencyThresholdMs).toBe(30000);
    });
  });

  describe("empty user config object", () => {
    test("should use mode defaults when userConfig is {}", () => {
      const config = getCircuitBreakerConfig("local", {});

      expect(config.latencyThresholdMs).toBe(120000);
      expect(config.failureThreshold).toBe(5);
    });
  });

  describe("null user config", () => {
    test("should treat null as undefined and use defaults", () => {
      const config = getCircuitBreakerConfig("mlx-cluster", null as any);

      expect(config.latencyThresholdMs).toBe(120000);
    });
  });
});

// ============================================================================
// Test Suite: Backward Compatibility
// ============================================================================

describe("CircuitBreaker Config - Backward Compatibility", () => {
  describe("no circuitBreaker config section", () => {
    test("should work when anyclauderc has no circuitBreaker section", () => {
      const config = getCircuitBreakerConfig("local");

      expect(config).toBeDefined();
      expect(config.latencyThresholdMs).toBe(120000);
    });

    test("should use defaults for all modes without user config", () => {
      const modes = ["local", "openrouter", "claude", "mlx-cluster"] as const;

      modes.forEach((mode) => {
        const config = getCircuitBreakerConfig(mode);
        expect(config).toBeDefined();
        expect(config.latencyThresholdMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("old configs without latency settings", () => {
    test("should add latency defaults to old config", () => {
      const oldUserConfig = { failureThreshold: 3 };
      const config = getCircuitBreakerConfig("local", oldUserConfig);

      expect(config.failureThreshold).toBe(3);
      expect(config.latencyThresholdMs).toBe(120000); // New default added
    });

    test("should work with only enabled flag", () => {
      const oldUserConfig = { enabled: true };
      const config = getCircuitBreakerConfig("openrouter", oldUserConfig);

      expect(config.latencyThresholdMs).toBe(30000);
    });
  });

  describe("deprecated lmstudio mode", () => {
    test("should treat lmstudio mode as local mode", () => {
      const config = getCircuitBreakerConfig("lmstudio" as any);

      expect(config.latencyThresholdMs).toBe(120000); // Same as local
    });

    test("should support lmstudio with user overrides", () => {
      const userConfig = { latencyThresholdMs: 90000 };
      const config = getCircuitBreakerConfig("lmstudio" as any, userConfig);

      expect(config.latencyThresholdMs).toBe(90000);
    });
  });
});
