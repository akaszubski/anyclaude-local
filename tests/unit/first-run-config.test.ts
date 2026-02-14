/**
 * Unit tests for first-run auto-config creation (Issue #75)
 *
 * Tests the loadConfig() function's new auto-creation behavior:
 * 1. Existing .anyclauderc.json → returns parsed config (existing behavior)
 * 2. Missing .anyclauderc.json + .anyclauderc.example.json exists → creates minimal config, returns it
 * 3. Both files missing → returns empty object
 * 4. Invalid JSON in .anyclauderc.json → logs error, returns empty object
 * 5. Write fails (permission error) → logs warning, returns empty object
 * 6. Created config has correct defaults: backend="local", backends.local.baseUrl, safeSystemFilter=true
 *
 * Test categories:
 * - Existing config file behavior
 * - Auto-creation from example file
 * - Missing both files fallback
 * - Error handling (invalid JSON, write failures)
 * - Default values in created config
 * - Backward compatibility
 *
 * Expected: ALL TESTS FAIL (TDD red phase - auto-creation doesn't exist yet)
 */

import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

// Mock fs module
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock heavy transitive dependencies to avoid tiktoken/wasm issues
jest.mock("../../src/anthropic-proxy", () => ({}));
jest.mock("../../src/debug", () => ({
  debug: jest.fn(),
  isDebugEnabled: jest.fn(() => false),
  isVerboseDebugEnabled: jest.fn(() => false),
  isTraceDebugEnabled: jest.fn(() => false),
  writeDebugToTempFile: jest.fn(),
  logDebugError: jest.fn(),
  displayDebugStartup: jest.fn(),
  logSessionContext: jest.fn(),
}));
jest.mock("../../src/setup-checker", () => ({
  displaySetupStatus: jest.fn(),
  shouldFailStartup: jest.fn(() => false),
}));
jest.mock("../../src/timeout-config", () => ({
  getTimeoutConfig: jest.fn(() => ({ warnings: [] })),
  getTimeoutInfoString: jest.fn(() => ""),
}));
jest.mock("../../src/server-launcher", () => ({
  startMLXWorkerServer: jest.fn(),
  wasServerLaunchedByUs: jest.fn(() => false),
  cleanupServerProcess: jest.fn(),
  startSearxNGContainer: jest.fn(),
}));
jest.mock("../../src/cluster/cluster-manager", () => ({
  initializeCluster: jest.fn(),
  getClusterManager: jest.fn(),
  resetClusterManager: jest.fn(),
}));
jest.mock("../../src/utils/backend-display", () => ({
  getBackendLogPrefix: jest.fn(() => "Local"),
  getBackendDisplayName: jest.fn(() => "Local"),
}));
jest.mock("../../src/utils/backend-migration", () => ({
  normalizeBackendMode: jest.fn((m: string) => m),
  getMigratedBackendConfig: jest.fn(),
  getMigratedEnvVar: jest.fn(),
}));
jest.mock("@ai-sdk/anthropic", () => ({ createAnthropic: jest.fn() }));
jest.mock("@ai-sdk/openai", () => ({ createOpenAI: jest.fn() }));
jest.mock("dotenv", () => ({ config: jest.fn() }));

// Import after mocks are set up
import { loadConfig } from "../../src/main";

// Mock console methods to capture output
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let consoleWarns: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  jest.clearAllMocks();

  // Reset console capture arrays
  consoleLogs = [];
  consoleErrors = [];
  consoleWarns = [];

  // Mock console methods
  console.log = jest.fn((...args: unknown[]) => {
    consoleLogs.push(args.join(" "));
  });
  console.error = jest.fn((...args: unknown[]) => {
    consoleErrors.push(args.join(" "));
  });
  console.warn = jest.fn((...args: unknown[]) => {
    consoleWarns.push(args.join(" "));
  });

  // Default mock: neither config file exists
  (mockFs.existsSync as jest.Mock).mockReturnValue(false);
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  jest.restoreAllMocks();
});

// ============================================================================
// Test Suite: Existing Config File Behavior
// ============================================================================

describe("First-Run Config - Existing Config", () => {
  test("should return parsed config when .anyclauderc.json exists", () => {
    const expectedConfig = {
      backend: "openrouter",
      backends: {
        openrouter: {
          enabled: true,
          apiKey: "test-key",
          model: "test-model",
        },
      },
    };

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(expectedConfig)
    );

    const config = loadConfig();

    expect(config).toEqual(expectedConfig);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".anyclauderc.json"),
      "utf8"
    );
  });

  test("should not create new file when config already exists", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ backend: "local" })
    );

    loadConfig();

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  test("should parse complex config with all backends", () => {
    const complexConfig = {
      backend: "mlx-cluster",
      debug: { level: 2 },
      backends: {
        local: { enabled: true, port: 8081 },
        openrouter: { enabled: false },
        claude: { enabled: false },
        "mlx-cluster": { enabled: true },
      },
      circuitBreaker: {
        enabled: true,
        latencyThresholdMs: 120000,
      },
    };

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(complexConfig)
    );

    const config = loadConfig();

    expect(config).toEqual(complexConfig);
  });
});

// ============================================================================
// Test Suite: Auto-Creation from Example File
// ============================================================================

describe("First-Run Config - Auto-Creation", () => {
  test("should create minimal config when .anyclauderc.json missing and example exists", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      // .anyclauderc.json missing, .anyclauderc.example.json exists
      return p.endsWith(".anyclauderc.example.json");
    });

    const config = loadConfig();

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".anyclauderc.json"),
      expect.any(String),
      "utf8"
    );

    // Should return the created config
    expect(config).toBeDefined();
    expect(config).toHaveProperty("backend");
  });

  test("should create config with backend='local' by default", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    const config = loadConfig();

    expect(config.backend).toBe("local");
  });

  test("should create config with backends.local.baseUrl", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    const config = loadConfig();

    expect(config.backends).toBeDefined();
    expect(config.backends?.local).toBeDefined();
    expect(config.backends?.local?.baseUrl).toBe("http://localhost:8081/v1");
  });

  test("should create config with safeSystemFilter=true", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    const config = loadConfig();

    expect(config.backends?.local?.safeSystemFilter).toBe(true);
  });

  test("should log success message when creating config", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    loadConfig();

    expect(consoleLogs.length).toBeGreaterThan(0);
    expect(consoleLogs.join(" ")).toContain("Created");
    expect(consoleLogs.join(" ")).toContain(".anyclauderc.json");
  });

  test("should write valid JSON to config file", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    loadConfig();

    const writeCall = (mockFs.writeFileSync as jest.Mock).mock.calls[0];
    const writtenContent = writeCall[1] as string;

    // Should be valid JSON
    expect(() => JSON.parse(writtenContent)).not.toThrow();
  });
});

// ============================================================================
// Test Suite: Auto-Creation - Config Defaults
// ============================================================================

describe("First-Run Config - Created Config Defaults", () => {
  beforeEach(() => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });
  });

  test("should include local backend configuration", () => {
    const config = loadConfig();

    expect(config.backends?.local).toMatchObject({
      enabled: true,
      baseUrl: "http://localhost:8081/v1",
      safeSystemFilter: true,
    });
  });

  test("should set filterTier to 'auto'", () => {
    const config = loadConfig();

    expect(config.backends?.local?.filterTier).toBe("auto");
  });

  test("should disable other backends by default", () => {
    const config = loadConfig();

    expect(config.backends?.openrouter?.enabled).toBe(false);
    expect(config.backends?.claude?.enabled).toBe(false);
    expect(config.backends?.["mlx-cluster"]?.enabled).toBe(false);
  });

  test("should set debug.level to 0 by default", () => {
    const config = loadConfig();

    expect(config.debug?.level).toBe(0);
  });

  test("should enable circuitBreaker by default", () => {
    const config = loadConfig();

    expect(config.circuitBreaker?.enabled).toBe(true);
  });
});

// ============================================================================
// Test Suite: Missing Both Files Fallback
// ============================================================================

describe("First-Run Config - Missing Both Files", () => {
  test("should return empty object when both files missing", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    const config = loadConfig();

    expect(config).toEqual({});
  });

  test("should not attempt to write file when example missing", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    loadConfig();

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  test("should log info message when both files missing", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    loadConfig();

    // Should either log info or stay silent (implementation choice)
    // At minimum, should not crash
    expect(consoleErrors.length).toBe(0);
  });
});

// ============================================================================
// Test Suite: Error Handling - Invalid JSON
// ============================================================================

describe("First-Run Config - Invalid JSON", () => {
  test("should return empty object when JSON is invalid", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      "{ invalid json content"
    );

    const config = loadConfig();

    expect(config).toEqual({});
  });

  test("should log error message when JSON parse fails", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      "{ invalid json content"
    );

    loadConfig();

    expect(consoleErrors.length).toBeGreaterThan(0);
    expect(consoleErrors.join(" ")).toContain("Error");
  });

  test("should handle completely malformed JSON", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      "not json at all!!!"
    );

    const config = loadConfig();

    expect(config).toEqual({});
    expect(consoleErrors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Error Handling - Write Failures
// ============================================================================

describe("First-Run Config - Write Failures", () => {
  test("should return empty object when write fails", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const config = loadConfig();

    expect(config).toEqual({});
  });

  test("should log warning when write fails", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    loadConfig();

    const allMessages = [...consoleWarns, ...consoleErrors];
    expect(allMessages.length).toBeGreaterThan(0);
    expect(allMessages.join(" ")).toContain("permission");
  });

  test("should handle read-only filesystem gracefully", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.example.json");
    });

    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });

    const config = loadConfig();

    expect(config).toEqual({});
    expect(consoleErrors.length + consoleWarns.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Backward Compatibility
// ============================================================================

describe("First-Run Config - Backward Compatibility", () => {
  test("should support old 'lmstudio' backend in existing config", () => {
    const oldConfig = {
      backend: "lmstudio",
      backends: {
        lmstudio: {
          enabled: true,
          baseUrl: "http://localhost:1234/v1",
        },
      },
    };

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(oldConfig)
    );

    const config = loadConfig();

    expect(config.backend).toBe("lmstudio");
    expect(config.backends?.lmstudio).toBeDefined();
  });

  test("should not modify existing config structure", () => {
    const existingConfig = {
      backend: "openrouter",
      custom_field: "custom_value",
      backends: {
        openrouter: {
          enabled: true,
          custom_backend_field: 123,
        },
      },
    };

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify(existingConfig)
    );

    const config = loadConfig();

    expect(config).toEqual(existingConfig);
  });

  test("should handle empty existing config file", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p.endsWith(".anyclauderc.json");
    });

    (mockFs.readFileSync as jest.Mock).mockReturnValue("{}");

    const config = loadConfig();

    expect(config).toEqual({});
  });
});
