/**
 * Unit tests for backend migration utilities
 *
 * Tests the migration system for renaming 'lmstudio' backend to 'local'.
 *
 * Components tested:
 * 1. getMigratedEnvVar() - Environment variable migration
 * 2. getMigratedBackendConfig() - Configuration migration
 * 3. normalizeBackendMode() - Mode name normalization
 * 4. Backward compatibility - Support for old names
 * 5. Migration warnings - Deprecation warnings for old names
 *
 * Test categories:
 * - Environment variable migration
 * - Configuration object migration
 * - Mode name normalization
 * - Precedence rules (new over old)
 * - Deprecation warning integration
 * - Edge cases (empty strings, undefined, case sensitivity)
 * - Mixed old/new configurations
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  getMigratedEnvVar,
  getMigratedBackendConfig,
  normalizeBackendMode,
} from "../../src/utils/backend-migration";
import { warnDeprecation, resetWarnings } from "../../src/utils/deprecation-warnings";
import type { AnyclaudeMode } from "../../src/trace-logger";

// Mock console.warn to capture deprecation warnings
let warnCalls: string[] = [];
const originalWarn = console.warn;

beforeEach(() => {
  warnCalls = [];
  console.warn = jest.fn((...args: unknown[]) => {
    warnCalls.push(args.join(" "));
  });
  resetWarnings();

  // Clear environment variables
  delete process.env.LOCAL_URL;
  delete process.env.LMSTUDIO_URL;
  delete process.env.LOCAL_CONTEXT_LENGTH;
  delete process.env.LMSTUDIO_CONTEXT_LENGTH;
  delete process.env.LOCAL_MODEL;
  delete process.env.LMSTUDIO_MODEL;
});

afterEach(() => {
  console.warn = originalWarn;
});

// ============================================================================
// Tests: getMigratedEnvVar() - Basic functionality
// ============================================================================

describe("getMigratedEnvVar - Basic functionality", () => {
  test("should return new value when new env var is set", () => {
    process.env.LOCAL_URL = "http://new-url:1234";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("http://new-url:1234");
  });

  test("should return old value when only old env var is set", () => {
    process.env.LMSTUDIO_URL = "http://old-url:1234";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("http://old-url:1234");
  });

  test("should return undefined when neither env var is set", () => {
    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBeUndefined();
  });

  test("should prefer new value over old when both are set", () => {
    process.env.LOCAL_URL = "http://new-url:1234";
    process.env.LMSTUDIO_URL = "http://old-url:1234";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("http://new-url:1234");
  });
});

// ============================================================================
// Tests: getMigratedEnvVar() - Deprecation warnings
// ============================================================================

describe("getMigratedEnvVar - Deprecation warnings", () => {
  test("should emit warning when using old env var", () => {
    process.env.LMSTUDIO_URL = "http://old-url:1234";

    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls[0]).toContain("LMSTUDIO_URL");
    expect(warnCalls[0]).toContain("LOCAL_URL");
  });

  test("should not emit warning when using new env var", () => {
    process.env.LOCAL_URL = "http://new-url:1234";

    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(warnCalls.length).toBe(0);
  });

  test("should not emit warning when neither env var is set", () => {
    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(warnCalls.length).toBe(0);
  });

  test("should not emit warning when both are set (new takes precedence)", () => {
    process.env.LOCAL_URL = "http://new-url:1234";
    process.env.LMSTUDIO_URL = "http://old-url:1234";

    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(warnCalls.length).toBe(0);
  });

  test("should emit warning only once per old env var", () => {
    process.env.LMSTUDIO_URL = "http://old-url:1234";

    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");
    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");
    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(warnCalls.length).toBe(1);
  });
});

// ============================================================================
// Tests: getMigratedEnvVar() - Multiple environment variables
// ============================================================================

describe("getMigratedEnvVar - Multiple variables", () => {
  test("should handle URL migration", () => {
    process.env.LMSTUDIO_URL = "http://localhost:1234";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("http://localhost:1234");
  });

  test("should handle context length migration", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const result = getMigratedEnvVar("LOCAL_CONTEXT_LENGTH", "LMSTUDIO_CONTEXT_LENGTH");

    expect(result).toBe("8192");
  });

  test("should handle model migration", () => {
    process.env.LMSTUDIO_MODEL = "qwen2.5-coder";

    const result = getMigratedEnvVar("LOCAL_MODEL", "LMSTUDIO_MODEL");

    expect(result).toBe("qwen2.5-coder");
  });

  test("should track warnings independently for different variables", () => {
    process.env.LMSTUDIO_URL = "http://localhost:1234";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");
    getMigratedEnvVar("LOCAL_CONTEXT_LENGTH", "LMSTUDIO_CONTEXT_LENGTH");

    expect(warnCalls.length).toBe(2);
  });
});

// ============================================================================
// Tests: getMigratedEnvVar() - Edge cases
// ============================================================================

describe("getMigratedEnvVar - Edge cases", () => {
  test("should handle empty string in new env var", () => {
    process.env.LOCAL_URL = "";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("");
  });

  test("should handle empty string in old env var", () => {
    process.env.LMSTUDIO_URL = "";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("");
  });

  test("should prefer empty new value over non-empty old value", () => {
    process.env.LOCAL_URL = "";
    process.env.LMSTUDIO_URL = "http://localhost:1234";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("");
  });

  test("should handle whitespace-only values", () => {
    process.env.LMSTUDIO_URL = "   ";

    const result = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(result).toBe("   ");
  });
});

// ============================================================================
// Tests: getMigratedBackendConfig() - Basic functionality
// ============================================================================

describe("getMigratedBackendConfig - Basic functionality", () => {
  test("should return new config when only new config exists", () => {
    const config = {
      local: {
        url: "http://new-url:1234",
        contextLength: 8192,
      },
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({
      url: "http://new-url:1234",
      contextLength: 8192,
    });
  });

  test("should return old config when only old config exists", () => {
    const config = {
      lmstudio: {
        url: "http://old-url:1234",
        contextLength: 4096,
      },
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({
      url: "http://old-url:1234",
      contextLength: 4096,
    });
  });

  test("should return undefined when neither config exists", () => {
    const config = {};

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toBeUndefined();
  });

  test("should prefer new config over old when both exist", () => {
    const config = {
      local: {
        url: "http://new-url:1234",
        contextLength: 8192,
      },
      lmstudio: {
        url: "http://old-url:1234",
        contextLength: 4096,
      },
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({
      url: "http://new-url:1234",
      contextLength: 8192,
    });
  });
});

// ============================================================================
// Tests: getMigratedBackendConfig() - Deprecation warnings
// ============================================================================

describe("getMigratedBackendConfig - Deprecation warnings", () => {
  test("should emit warning when using old config", () => {
    const config = {
      lmstudio: {
        url: "http://old-url:1234",
      },
    };

    getMigratedBackendConfig(config, "local", "lmstudio");

    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls[0]).toContain("lmstudio");
    expect(warnCalls[0]).toContain("local");
  });

  test("should not emit warning when using new config", () => {
    const config = {
      local: {
        url: "http://new-url:1234",
      },
    };

    getMigratedBackendConfig(config, "local", "lmstudio");

    expect(warnCalls.length).toBe(0);
  });

  test("should not emit warning when neither config exists", () => {
    const config = {};

    getMigratedBackendConfig(config, "local", "lmstudio");

    expect(warnCalls.length).toBe(0);
  });

  test("should not emit warning when both configs exist (new takes precedence)", () => {
    const config = {
      local: {
        url: "http://new-url:1234",
      },
      lmstudio: {
        url: "http://old-url:1234",
      },
    };

    getMigratedBackendConfig(config, "local", "lmstudio");

    expect(warnCalls.length).toBe(0);
  });

  test("should emit warning only once per old config", () => {
    const config = {
      lmstudio: {
        url: "http://old-url:1234",
      },
    };

    getMigratedBackendConfig(config, "local", "lmstudio");
    getMigratedBackendConfig(config, "local", "lmstudio");
    getMigratedBackendConfig(config, "local", "lmstudio");

    expect(warnCalls.length).toBe(1);
  });
});

// ============================================================================
// Tests: getMigratedBackendConfig() - Edge cases
// ============================================================================

describe("getMigratedBackendConfig - Edge cases", () => {
  test("should handle empty config object in new key", () => {
    const config = {
      local: {},
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({});
  });

  test("should handle empty config object in old key", () => {
    const config = {
      lmstudio: {},
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({});
  });

  test("should handle null config object", () => {
    const config = null as any;

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toBeUndefined();
  });

  test("should handle undefined config object", () => {
    const config = undefined as any;

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toBeUndefined();
  });

  test("should preserve nested config properties", () => {
    const config = {
      lmstudio: {
        url: "http://localhost:1234",
        contextLength: 8192,
        model: "qwen2.5-coder",
        timeout: 30000,
      },
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({
      url: "http://localhost:1234",
      contextLength: 8192,
      model: "qwen2.5-coder",
      timeout: 30000,
    });
  });
});

// ============================================================================
// Tests: normalizeBackendMode() - Basic functionality
// ============================================================================

describe("normalizeBackendMode - Basic functionality", () => {
  test("should convert 'lmstudio' to 'local'", () => {
    const result = normalizeBackendMode("lmstudio");

    expect(result).toBe("local");
  });

  test("should keep 'local' as 'local'", () => {
    const result = normalizeBackendMode("local");

    expect(result).toBe("local");
  });

  test("should keep 'claude' unchanged", () => {
    const result = normalizeBackendMode("claude");

    expect(result).toBe("claude");
  });

  test("should keep 'openrouter' unchanged", () => {
    const result = normalizeBackendMode("openrouter");

    expect(result).toBe("openrouter");
  });

  test("should keep 'mlx-cluster' unchanged", () => {
    const result = normalizeBackendMode("mlx-cluster");

    expect(result).toBe("mlx-cluster");
  });
});

// ============================================================================
// Tests: normalizeBackendMode() - Case sensitivity
// ============================================================================

describe("normalizeBackendMode - Case sensitivity", () => {
  test("should handle uppercase 'LMSTUDIO'", () => {
    const result = normalizeBackendMode("LMSTUDIO" as AnyclaudeMode);

    expect(result).toBe("local");
  });

  test("should handle mixed case 'LMStudio'", () => {
    const result = normalizeBackendMode("LMStudio" as AnyclaudeMode);

    expect(result).toBe("local");
  });

  test("should handle uppercase 'LOCAL'", () => {
    const result = normalizeBackendMode("LOCAL" as AnyclaudeMode);

    expect(result).toBe("local");
  });

  test("should handle mixed case 'Local'", () => {
    const result = normalizeBackendMode("Local" as AnyclaudeMode);

    expect(result).toBe("local");
  });

  test("should handle uppercase 'CLAUDE'", () => {
    const result = normalizeBackendMode("CLAUDE" as AnyclaudeMode);

    expect(result).toBe("claude");
  });
});

// ============================================================================
// Tests: normalizeBackendMode() - Deprecation warnings
// ============================================================================

describe("normalizeBackendMode - Deprecation warnings", () => {
  test("should emit warning when normalizing 'lmstudio'", () => {
    normalizeBackendMode("lmstudio");

    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls[0]).toContain("lmstudio");
    expect(warnCalls[0]).toContain("local");
  });

  test("should not emit warning for 'local'", () => {
    normalizeBackendMode("local");

    expect(warnCalls.length).toBe(0);
  });

  test("should not emit warning for other modes", () => {
    normalizeBackendMode("claude");
    normalizeBackendMode("openrouter");
    normalizeBackendMode("mlx-cluster");

    expect(warnCalls.length).toBe(0);
  });

  test("should emit warning only once for 'lmstudio'", () => {
    normalizeBackendMode("lmstudio");
    normalizeBackendMode("lmstudio");
    normalizeBackendMode("lmstudio");

    expect(warnCalls.length).toBe(1);
  });

  test("should emit warning for case-insensitive matches", () => {
    normalizeBackendMode("LMSTUDIO" as AnyclaudeMode);

    expect(warnCalls.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tests: normalizeBackendMode() - Edge cases
// ============================================================================

describe("normalizeBackendMode - Edge cases", () => {
  test("should handle empty string", () => {
    const result = normalizeBackendMode("" as AnyclaudeMode);

    // Should return empty string or throw - implementation decides
    expect(result).toBeDefined();
  });

  test("should handle unknown mode", () => {
    const result = normalizeBackendMode("unknown" as AnyclaudeMode);

    // Should return unchanged or throw - implementation decides
    expect(result).toBeDefined();
  });

  test("should handle whitespace in mode name", () => {
    const result = normalizeBackendMode(" lmstudio " as AnyclaudeMode);

    // Should trim and normalize or reject - implementation decides
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Tests: Integration scenarios
// ============================================================================

describe("Backend migration - Integration scenarios", () => {
  test("should handle mixed old and new env vars", () => {
    process.env.LOCAL_URL = "http://new-url:1234";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const url = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");
    const contextLength = getMigratedEnvVar("LOCAL_CONTEXT_LENGTH", "LMSTUDIO_CONTEXT_LENGTH");

    expect(url).toBe("http://new-url:1234");
    expect(contextLength).toBe("8192");
    expect(warnCalls.length).toBe(1); // Only for LMSTUDIO_CONTEXT_LENGTH
  });

  test("should handle mixed old and new config sections", () => {
    const config = {
      local: {
        url: "http://new-url:1234",
      },
      lmstudio: {
        url: "http://old-url:1234",
        contextLength: 4096,
      },
    };

    const result = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(result).toEqual({
      url: "http://new-url:1234",
    });
    expect(warnCalls.length).toBe(0); // New config takes precedence
  });

  test("should handle mode normalization with env var migration", () => {
    process.env.LMSTUDIO_URL = "http://localhost:1234";

    const mode = normalizeBackendMode("lmstudio");
    const url = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");

    expect(mode).toBe("local");
    expect(url).toBe("http://localhost:1234");
    expect(warnCalls.length).toBe(2); // One for mode, one for env var
  });

  test("should handle complete migration from old to new naming", () => {
    process.env.LMSTUDIO_URL = "http://localhost:1234";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const config = {
      lmstudio: {
        model: "qwen2.5-coder",
        timeout: 30000,
      },
    };

    const mode = normalizeBackendMode("lmstudio");
    const url = getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL");
    const contextLength = getMigratedEnvVar("LOCAL_CONTEXT_LENGTH", "LMSTUDIO_CONTEXT_LENGTH");
    const backendConfig = getMigratedBackendConfig(config, "local", "lmstudio");

    expect(mode).toBe("local");
    expect(url).toBe("http://localhost:1234");
    expect(contextLength).toBe("8192");
    expect(backendConfig).toEqual({
      model: "qwen2.5-coder",
      timeout: 30000,
    });

    // Should have warnings for mode, url, contextLength, and config
    expect(warnCalls.length).toBe(4);
  });
});
