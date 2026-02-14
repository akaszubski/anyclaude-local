/**
 * Unit tests for proxy port configuration (Issue #77)
 *
 * Tests the getProxyPort(config) function:
 * 1. ANYCLAUDE_PORT env var set to valid number → returns that number
 * 2. ANYCLAUDE_PORT set to invalid value (NaN, negative, >65535) → returns default
 * 3. config.port set → returns config value
 * 4. Both env var and config set → env var wins
 * 5. Neither set → returns 49152 (DEFAULT_PROXY_PORT)
 * 6. ANYCLAUDE_PORT set to "0" → returns default (0 is not a valid explicit port)
 *
 * Test categories:
 * - Environment variable handling
 * - Config object handling
 * - Precedence rules (env > config > default)
 * - Validation (valid port range: 1-65535)
 * - Edge cases (0, negative, out of range, NaN, empty string)
 * - Type coercion (string → number)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - getProxyPort doesn't exist yet)
 */

import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

// Import after defining the test structure
import { getProxyPort, DEFAULT_PROXY_PORT } from "../../src/utils/proxy-port";

// Store original env var
let originalEnvPort: string | undefined;

beforeEach(() => {
  jest.clearAllMocks();

  // Save original env var
  originalEnvPort = process.env.ANYCLAUDE_PORT;

  // Clear env var for clean slate
  delete process.env.ANYCLAUDE_PORT;
});

afterEach(() => {
  // Restore original env var
  if (originalEnvPort !== undefined) {
    process.env.ANYCLAUDE_PORT = originalEnvPort;
  } else {
    delete process.env.ANYCLAUDE_PORT;
  }

  jest.restoreAllMocks();
});

// ============================================================================
// Test Suite: Environment Variable - Valid Values
// ============================================================================

describe("Proxy Port - Environment Variable (Valid)", () => {
  test("should return env var port when ANYCLAUDE_PORT is valid", () => {
    process.env.ANYCLAUDE_PORT = "3000";

    const port = getProxyPort({});

    expect(port).toBe(3000);
  });

  test("should handle port 80", () => {
    process.env.ANYCLAUDE_PORT = "80";

    const port = getProxyPort({});

    expect(port).toBe(80);
  });

  test("should handle port 8080", () => {
    process.env.ANYCLAUDE_PORT = "8080";

    const port = getProxyPort({});

    expect(port).toBe(8080);
  });

  test("should handle max valid port 65535", () => {
    process.env.ANYCLAUDE_PORT = "65535";

    const port = getProxyPort({});

    expect(port).toBe(65535);
  });

  test("should handle port 1 (minimum valid)", () => {
    process.env.ANYCLAUDE_PORT = "1";

    const port = getProxyPort({});

    expect(port).toBe(1);
  });

  test("should handle common proxy ports", () => {
    process.env.ANYCLAUDE_PORT = "49152";
    expect(getProxyPort({})).toBe(49152);

    process.env.ANYCLAUDE_PORT = "8888";
    expect(getProxyPort({})).toBe(8888);

    process.env.ANYCLAUDE_PORT = "5000";
    expect(getProxyPort({})).toBe(5000);
  });
});

// ============================================================================
// Test Suite: Environment Variable - Invalid Values
// ============================================================================

describe("Proxy Port - Environment Variable (Invalid)", () => {
  test("should return default when ANYCLAUDE_PORT is 0", () => {
    process.env.ANYCLAUDE_PORT = "0";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when ANYCLAUDE_PORT is negative", () => {
    process.env.ANYCLAUDE_PORT = "-1";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when ANYCLAUDE_PORT is above 65535", () => {
    process.env.ANYCLAUDE_PORT = "65536";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when ANYCLAUDE_PORT is NaN", () => {
    process.env.ANYCLAUDE_PORT = "not-a-number";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when ANYCLAUDE_PORT is empty string", () => {
    process.env.ANYCLAUDE_PORT = "";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when ANYCLAUDE_PORT contains whitespace", () => {
    process.env.ANYCLAUDE_PORT = "  3000  ";

    // Implementation could either trim and accept, or reject
    // If trimming: expect(port).toBe(3000);
    // If rejecting: expect(port).toBe(DEFAULT_PROXY_PORT);
    const port = getProxyPort({});
    expect([3000, DEFAULT_PROXY_PORT]).toContain(port);
  });

  test("should return default when ANYCLAUDE_PORT is floating point", () => {
    process.env.ANYCLAUDE_PORT = "3000.5";

    const port = getProxyPort({});

    // Could either round or reject - either is valid
    expect([3000, 3001, DEFAULT_PROXY_PORT]).toContain(port);
  });
});

// ============================================================================
// Test Suite: Config Object - Valid Values
// ============================================================================

describe("Proxy Port - Config Object (Valid)", () => {
  test("should return config.port when set", () => {
    const config = { port: 3000 };

    const port = getProxyPort(config);

    expect(port).toBe(3000);
  });

  test("should handle config.port at minimum", () => {
    const config = { port: 1 };

    const port = getProxyPort(config);

    expect(port).toBe(1);
  });

  test("should handle config.port at maximum", () => {
    const config = { port: 65535 };

    const port = getProxyPort(config);

    expect(port).toBe(65535);
  });

  test("should handle common config ports", () => {
    expect(getProxyPort({ port: 8080 })).toBe(8080);
    expect(getProxyPort({ port: 49152 })).toBe(49152);
    expect(getProxyPort({ port: 5000 })).toBe(5000);
  });
});

// ============================================================================
// Test Suite: Config Object - Invalid Values
// ============================================================================

describe("Proxy Port - Config Object (Invalid)", () => {
  test("should return default when config.port is 0", () => {
    const config = { port: 0 };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when config.port is negative", () => {
    const config = { port: -1 };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when config.port is above 65535", () => {
    const config = { port: 70000 };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when config.port is NaN", () => {
    const config = { port: NaN };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default when config.port is undefined", () => {
    const config = { port: undefined };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });
});

// ============================================================================
// Test Suite: Precedence Rules
// ============================================================================

describe("Proxy Port - Precedence Rules", () => {
  test("should prefer env var over config when both set", () => {
    process.env.ANYCLAUDE_PORT = "3000";
    const config = { port: 5000 };

    const port = getProxyPort(config);

    expect(port).toBe(3000);
  });

  test("should use config when env var not set", () => {
    delete process.env.ANYCLAUDE_PORT;
    const config = { port: 5000 };

    const port = getProxyPort(config);

    expect(port).toBe(5000);
  });

  test("should use env var even when config is also valid", () => {
    process.env.ANYCLAUDE_PORT = "8888";
    const config = { port: 7777 };

    const port = getProxyPort(config);

    expect(port).toBe(8888);
  });

  test("should use config when env var is invalid", () => {
    process.env.ANYCLAUDE_PORT = "invalid";
    const config = { port: 5000 };

    const port = getProxyPort(config);

    expect(port).toBe(5000);
  });

  test("should use default when both env var and config are invalid", () => {
    process.env.ANYCLAUDE_PORT = "invalid";
    const config = { port: -1 };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });
});

// ============================================================================
// Test Suite: Default Value
// ============================================================================

describe("Proxy Port - Default Value", () => {
  test("should return DEFAULT_PROXY_PORT when nothing set", () => {
    delete process.env.ANYCLAUDE_PORT;

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return 49152 as DEFAULT_PROXY_PORT", () => {
    expect(DEFAULT_PROXY_PORT).toBe(49152);
  });

  test("should return default with empty config", () => {
    const port = getProxyPort({});

    expect(port).toBe(49152);
  });

  test("should return default with undefined config", () => {
    const port = getProxyPort(undefined as any);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should return default with null config", () => {
    const port = getProxyPort(null as any);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe("Proxy Port - Edge Cases", () => {
  test("should handle config with other properties", () => {
    const config = {
      port: 3000,
      backend: "local",
      debug: { level: 1 },
    };

    const port = getProxyPort(config);

    expect(port).toBe(3000);
  });

  test("should ignore non-port config properties", () => {
    const config = {
      backend: "openrouter",
      debug: { level: 2 },
    };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should handle string port in config (type coercion)", () => {
    const config = { port: "3000" as any };

    const port = getProxyPort(config);

    // Could either coerce or reject - implementation decides
    expect([3000, DEFAULT_PROXY_PORT]).toContain(port);
  });

  test("should handle very large invalid port numbers", () => {
    process.env.ANYCLAUDE_PORT = "999999999";

    const port = getProxyPort({});

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });

  test("should handle hexadecimal string in env var", () => {
    process.env.ANYCLAUDE_PORT = "0x3000";

    const port = getProxyPort({});

    // Could either parse as hex (12288) or reject as NaN
    const result = parseInt("0x3000", 10);
    if (isNaN(result)) {
      expect(port).toBe(DEFAULT_PROXY_PORT);
    } else {
      expect([result, DEFAULT_PROXY_PORT]).toContain(port);
    }
  });
});

// ============================================================================
// Test Suite: Type Coercion and Validation
// ============================================================================

describe("Proxy Port - Type Coercion", () => {
  test("should parse string env var to number", () => {
    process.env.ANYCLAUDE_PORT = "3000";

    const port = getProxyPort({});

    expect(typeof port).toBe("number");
    expect(port).toBe(3000);
  });

  test("should handle leading zeros in env var", () => {
    process.env.ANYCLAUDE_PORT = "008080";

    const port = getProxyPort({});

    expect(port).toBe(8080);
  });

  test("should validate number range after coercion", () => {
    process.env.ANYCLAUDE_PORT = "80";

    const port = getProxyPort({});

    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
  });

  test("should handle numeric config value directly", () => {
    const config = { port: 3000 };

    const port = getProxyPort(config);

    expect(typeof port).toBe("number");
    expect(port).toBe(3000);
  });
});

// ============================================================================
// Test Suite: Real-World Scenarios
// ============================================================================

describe("Proxy Port - Real-World Scenarios", () => {
  test("should use default for typical first-run scenario", () => {
    delete process.env.ANYCLAUDE_PORT;
    const config = {};

    const port = getProxyPort(config);

    expect(port).toBe(49152);
  });

  test("should respect user config for custom port", () => {
    const config = { port: 8080 };

    const port = getProxyPort(config);

    expect(port).toBe(8080);
  });

  test("should allow env var override for testing", () => {
    process.env.ANYCLAUDE_PORT = "9999";
    const config = { port: 8080 };

    const port = getProxyPort(config);

    expect(port).toBe(9999);
  });

  test("should handle CI/CD environment with env var", () => {
    process.env.ANYCLAUDE_PORT = "5000";

    const port = getProxyPort({});

    expect(port).toBe(5000);
  });

  test("should fall back gracefully when port conflict detected", () => {
    // Simulate user trying invalid port
    process.env.ANYCLAUDE_PORT = "0";
    const config = { port: 0 };

    const port = getProxyPort(config);

    expect(port).toBe(DEFAULT_PROXY_PORT);
  });
});

// ============================================================================
// Test Suite: Integration with Config Types
// ============================================================================

describe("Proxy Port - Config Type Integration", () => {
  test("should work with minimal config", () => {
    const config = { port: 3000 };

    const port = getProxyPort(config);

    expect(port).toBe(3000);
  });

  test("should work with full AnyclaudeConfig structure", () => {
    const config = {
      backend: "local",
      port: 8080,
      debug: { level: 1 },
      backends: {
        local: { enabled: true },
      },
    };

    const port = getProxyPort(config);

    expect(port).toBe(8080);
  });

  test("should extract port from nested structure if needed", () => {
    // If port is at top level
    const config = { port: 5000 };

    const port = getProxyPort(config);

    expect(port).toBe(5000);
  });
});
