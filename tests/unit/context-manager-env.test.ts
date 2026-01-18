/**
 * Unit tests for context-manager.ts environment variable fallback logic
 *
 * Tests the environment variable fallback for LOCAL_CONTEXT_LENGTH and LMSTUDIO_CONTEXT_LENGTH.
 * Part of Issue #64: Documentation Fixes.
 *
 * Components tested:
 * 1. getContextLimit() - Environment variable priority and fallback
 * 2. Fallback logic - LOCAL_CONTEXT_LENGTH -> LMSTUDIO_CONTEXT_LENGTH
 * 3. Deprecation warnings - Warn when using LMSTUDIO_CONTEXT_LENGTH
 * 4. Priority rules - LOCAL_CONTEXT_LENGTH takes precedence
 * 5. Model table fallback - Use model table when no env vars set
 * 6. Value validation - Handle invalid/negative/non-numeric values
 *
 * Test categories:
 * - Basic environment variable reading
 * - Fallback behavior (LOCAL -> LMSTUDIO)
 * - Precedence rules (LOCAL over LMSTUDIO)
 * - Deprecation warning integration
 * - Invalid value handling
 * - Edge cases (empty strings, zero, negative, non-numeric)
 * - Model table integration
 * - Debug output validation
 *
 * Environment variable priority (highest to lowest):
 * 1. LOCAL_CONTEXT_LENGTH (new, preferred)
 * 2. LMSTUDIO_CONTEXT_LENGTH (old, deprecated)
 * 3. Model table lookup
 * 4. Conservative default (32K)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { getContextLimit } from "../../src/context-manager";
import { resetWarnings } from "../../src/utils/deprecation-warnings";
import * as debugModule from "../../src/debug";

// Mock debug output capture
let debugCalls: Array<{ level: number; message: string }> = [];

// Mock console.warn for deprecation warnings
let warnCalls: string[] = [];
const originalWarn = console.warn;

// Spy on the debug function
let debugSpy: jest.SpyInstance;

beforeEach(() => {
  debugCalls = [];
  warnCalls = [];

  // Reset deprecation warning state
  resetWarnings();

  // Mock the debug function from debug module
  debugSpy = jest.spyOn(debugModule, "debug").mockImplementation((level: 1 | 2 | 3, message: string, data?: any) => {
    const fullMessage = data !== undefined ? `${message} ${JSON.stringify(data)}` : message;
    debugCalls.push({
      level,
      message: fullMessage,
    });
  });

  console.warn = jest.fn((...args: unknown[]) => {
    warnCalls.push(args.join(" "));
  });

  // Clear environment variables
  delete process.env.LOCAL_CONTEXT_LENGTH;
  delete process.env.LMSTUDIO_CONTEXT_LENGTH;
  delete process.env.ANYCLAUDE_DEBUG;
});

afterEach(() => {
  debugSpy.mockRestore();
  console.warn = originalWarn;
});

// ============================================================================
// Tests: Basic Environment Variable Reading
// ============================================================================

describe("getContextLimit - LOCAL_CONTEXT_LENGTH (new)", () => {
  test("should use LOCAL_CONTEXT_LENGTH when set", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const result = getContextLimit("test-model");

    expect(result).toBe(16384);
  });

  test("should parse LOCAL_CONTEXT_LENGTH as integer", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "8192";

    const result = getContextLimit("test-model");

    expect(result).toBe(8192);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should handle large context values", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "131072"; // 128K

    const result = getContextLimit("test-model");

    expect(result).toBe(131072);
  });

  test("should not emit deprecation warning for LOCAL_CONTEXT_LENGTH", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    getContextLimit("test-model");

    const hasDeprecationWarning = warnCalls.some(
      (msg) => msg.includes("DEPRECATED") || msg.includes("deprecated")
    );
    expect(hasDeprecationWarning).toBe(false);
  });

  test("should emit debug message when using LOCAL_CONTEXT_LENGTH", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.ANYCLAUDE_DEBUG = "1"; // Enable debug output

    getContextLimit("test-model");

    const hasDebugMessage = debugCalls.some(
      (call) => call.message.includes("env override") && call.message.includes("16384")
    );
    expect(hasDebugMessage).toBe(true);
  });
});

// ============================================================================
// Tests: LMSTUDIO_CONTEXT_LENGTH Fallback (deprecated)
// ============================================================================

describe("getContextLimit - LMSTUDIO_CONTEXT_LENGTH fallback", () => {
  test("should use LMSTUDIO_CONTEXT_LENGTH when LOCAL_CONTEXT_LENGTH not set", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const result = getContextLimit("test-model");

    expect(result).toBe(8192);
  });

  test("should parse LMSTUDIO_CONTEXT_LENGTH as integer", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "4096";

    const result = getContextLimit("test-model");

    expect(result).toBe(4096);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should emit deprecation warning when using LMSTUDIO_CONTEXT_LENGTH", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getContextLimit("test-model");

    expect(warnCalls.length).toBeGreaterThan(0);
    const warning = warnCalls[0];
    expect(warning).toContain("LMSTUDIO_CONTEXT_LENGTH");
    expect(warning).toContain("LOCAL_CONTEXT_LENGTH");
    expect(warning.toLowerCase()).toContain("deprecated");
  });

  test("should include helpful migration message in warning", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getContextLimit("test-model");

    const warning = warnCalls[0];
    expect(warning).toContain("LMSTUDIO_CONTEXT_LENGTH");
    expect(warning).toContain("LOCAL_CONTEXT_LENGTH");
  });

  test("should emit deprecation warning only once per session", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getContextLimit("test-model");
    getContextLimit("test-model");
    getContextLimit("test-model");

    // Should warn only once due to deduplication
    const deprecationWarnings = warnCalls.filter((msg) =>
      msg.includes("LMSTUDIO_CONTEXT_LENGTH")
    );
    expect(deprecationWarnings.length).toBe(1);
  });

  test("should emit debug message when using LMSTUDIO_CONTEXT_LENGTH", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";
    process.env.ANYCLAUDE_DEBUG = "1";

    getContextLimit("test-model");

    const hasDebugMessage = debugCalls.some(
      (call) => call.message.includes("env override") && call.message.includes("8192")
    );
    expect(hasDebugMessage).toBe(true);
  });
});

// ============================================================================
// Tests: Precedence Rules (LOCAL_CONTEXT_LENGTH over LMSTUDIO_CONTEXT_LENGTH)
// ============================================================================

describe("getContextLimit - Precedence rules", () => {
  test("should prefer LOCAL_CONTEXT_LENGTH over LMSTUDIO_CONTEXT_LENGTH", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const result = getContextLimit("test-model");

    expect(result).toBe(16384);
    expect(result).not.toBe(8192);
  });

  test("should not emit deprecation warning when both env vars set", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getContextLimit("test-model");

    const hasDeprecationWarning = warnCalls.some((msg) =>
      msg.includes("LMSTUDIO_CONTEXT_LENGTH")
    );
    expect(hasDeprecationWarning).toBe(false);
  });

  test("should ignore LMSTUDIO_CONTEXT_LENGTH when LOCAL_CONTEXT_LENGTH set", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "32768";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "4096";

    const result = getContextLimit("test-model");

    expect(result).toBe(32768);
  });

  test("should use LOCAL_CONTEXT_LENGTH even if it is smaller", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "2048";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "16384";

    const result = getContextLimit("test-model");

    expect(result).toBe(2048);
  });

  test("should use LOCAL_CONTEXT_LENGTH even if it is larger", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "262144"; // 256K
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const result = getContextLimit("test-model");

    expect(result).toBe(262144);
  });
});

// ============================================================================
// Tests: Model Table Fallback
// ============================================================================

describe("getContextLimit - Model table fallback", () => {
  test("should use model table when no env vars set", () => {
    const result = getContextLimit("qwen2.5-coder-7b");

    // qwen2.5-coder-7b is 32768 in MODEL_CONTEXT_LIMITS
    expect(result).toBe(32768);
  });

  test("should prefer env var over model table", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const result = getContextLimit("qwen2.5-coder-7b");

    expect(result).toBe(16384);
    expect(result).not.toBe(32768); // Model table value
  });

  test("should use default when model not in table and no env vars", () => {
    const result = getContextLimit("unknown-model");

    // Conservative default is 32768
    expect(result).toBe(32768);
  });

  test("should handle model name case-insensitivity", () => {
    const result = getContextLimit("QWEN2.5-CODER-7B");

    expect(result).toBe(32768);
  });

  test("should handle partial model name matching", () => {
    const result = getContextLimit("some-qwen2.5-coder-7b-variant");

    expect(result).toBe(32768);
  });
});

// ============================================================================
// Tests: Invalid Value Handling
// ============================================================================

describe("getContextLimit - Invalid value handling", () => {
  describe("Non-numeric values", () => {
    test("should fallback when LOCAL_CONTEXT_LENGTH is non-numeric", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "not-a-number";

      const result = getContextLimit("qwen2.5-coder-7b");

      // Should fallback to model table or default
      expect(result).toBe(32768);
    });

    test("should fallback when LMSTUDIO_CONTEXT_LENGTH is non-numeric", () => {
      process.env.LMSTUDIO_CONTEXT_LENGTH = "invalid";

      const result = getContextLimit("qwen2.5-coder-7b");

      // Should fallback to model table or default
      expect(result).toBe(32768);
    });

    test("should handle empty string in LOCAL_CONTEXT_LENGTH", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "";

      const result = getContextLimit("qwen2.5-coder-7b");

      expect(result).toBe(32768);
    });

    test("should handle whitespace-only value", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "   ";

      const result = getContextLimit("qwen2.5-coder-7b");

      expect(result).toBe(32768);
    });

    test("should handle string with leading/trailing spaces", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "  8192  ";

      const result = getContextLimit("test-model");

      // parseInt should handle trimming
      expect(result).toBe(8192);
    });
  });

  describe("Negative and zero values", () => {
    test("should reject negative LOCAL_CONTEXT_LENGTH", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "-8192";

      const result = getContextLimit("qwen2.5-coder-7b");

      // Should fallback to model table or default
      expect(result).toBe(32768);
    });

    test("should reject zero LOCAL_CONTEXT_LENGTH", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "0";

      const result = getContextLimit("qwen2.5-coder-7b");

      expect(result).toBe(32768);
    });

    test("should reject negative LMSTUDIO_CONTEXT_LENGTH", () => {
      process.env.LMSTUDIO_CONTEXT_LENGTH = "-4096";

      const result = getContextLimit("qwen2.5-coder-7b");

      expect(result).toBe(32768);
    });

    test("should reject zero LMSTUDIO_CONTEXT_LENGTH", () => {
      process.env.LMSTUDIO_CONTEXT_LENGTH = "0";

      const result = getContextLimit("qwen2.5-coder-7b");

      expect(result).toBe(32768);
    });
  });

  describe("Floating point values", () => {
    test("should truncate floating point LOCAL_CONTEXT_LENGTH", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "8192.5";

      const result = getContextLimit("test-model");

      // parseInt truncates decimals
      expect(result).toBe(8192);
    });

    test("should truncate floating point LMSTUDIO_CONTEXT_LENGTH", () => {
      process.env.LMSTUDIO_CONTEXT_LENGTH = "4096.99";

      const result = getContextLimit("test-model");

      expect(result).toBe(4096);
    });
  });

  describe("Special numeric values", () => {
    test("should handle very large values", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "999999999";

      const result = getContextLimit("test-model");

      expect(result).toBe(999999999);
    });

    test("should handle 1 as minimum valid value", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "1";

      const result = getContextLimit("test-model");

      expect(result).toBe(1);
    });

    test("should handle hexadecimal string", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "0x2000"; // 8192 in hex

      const result = getContextLimit("test-model");

      // parseInt with explicit radix 10 doesn't parse hex - stops at 'x', returns 0
      // Invalid value falls back to default (32768)
      expect(result).toBe(32768);
    });

    test("should handle scientific notation", () => {
      process.env.LOCAL_CONTEXT_LENGTH = "1e4"; // 10000

      const result = getContextLimit("test-model");

      // parseInt doesn't handle scientific notation well
      expect(result).toBe(1);
    });
  });
});

// ============================================================================
// Tests: Integration with LMStudio API Parameter
// ============================================================================

describe("getContextLimit - LMStudio API parameter integration", () => {
  test("should prefer env var over LMStudio API parameter", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    const lmstudioApiValue = 8192;

    const result = getContextLimit("test-model", lmstudioApiValue);

    expect(result).toBe(16384);
    expect(result).not.toBe(8192);
  });

  test("should use LMStudio API parameter when no env vars set", () => {
    const lmstudioApiValue = 8192;

    const result = getContextLimit("test-model", lmstudioApiValue);

    expect(result).toBe(8192);
  });

  test("should prefer LMSTUDIO_CONTEXT_LENGTH over LMStudio API parameter", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "16384";
    const lmstudioApiValue = 8192;

    const result = getContextLimit("test-model", lmstudioApiValue);

    expect(result).toBe(16384);
  });

  test("should fallback to model table when LMStudio API parameter invalid", () => {
    const lmstudioApiValue = -1;

    const result = getContextLimit("qwen2.5-coder-7b", lmstudioApiValue);

    expect(result).toBe(32768);
  });

  test("should fallback to model table when LMStudio API parameter is zero", () => {
    const lmstudioApiValue = 0;

    const result = getContextLimit("qwen2.5-coder-7b", lmstudioApiValue);

    expect(result).toBe(32768);
  });
});

// ============================================================================
// Tests: Debug Output
// ============================================================================

describe("getContextLimit - Debug output", () => {
  test("should log source when using LOCAL_CONTEXT_LENGTH", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.ANYCLAUDE_DEBUG = "1";

    getContextLimit("test-model");

    const hasDebugLog = debugCalls.some(
      (call) => call.message.includes("env override") && call.message.includes("16384")
    );
    expect(hasDebugLog).toBe(true);
  });

  test("should log source when using LMSTUDIO_CONTEXT_LENGTH", () => {
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";
    process.env.ANYCLAUDE_DEBUG = "1";

    getContextLimit("test-model");

    const hasDebugLog = debugCalls.some(
      (call) => call.message.includes("env override") && call.message.includes("8192")
    );
    expect(hasDebugLog).toBe(true);
  });

  test("should log source when using LMStudio API parameter", () => {
    process.env.ANYCLAUDE_DEBUG = "1";
    const lmstudioApiValue = 8192;

    getContextLimit("test-model", lmstudioApiValue);

    const hasDebugLog = debugCalls.some(
      (call) => call.message.includes("LMStudio reported") && call.message.includes("8192")
    );
    expect(hasDebugLog).toBe(true);
  });

  test("should log source when using model table", () => {
    process.env.ANYCLAUDE_DEBUG = "1";

    getContextLimit("qwen2.5-coder-7b");

    const hasDebugLog = debugCalls.some(
      (call) => call.message.includes("model table") || call.message.includes("lookup")
    );
    expect(hasDebugLog).toBe(true);
  });

  test("should log source when using default", () => {
    process.env.ANYCLAUDE_DEBUG = "1";

    getContextLimit("unknown-model");

    const hasDebugLog = debugCalls.some(
      (call) => call.message.includes("default") && call.message.includes("32768")
    );
    expect(hasDebugLog).toBe(true);
  });
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe("getContextLimit - Edge cases", () => {
  test("should handle undefined model name", () => {
    const result = getContextLimit(undefined as any);

    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should handle empty model name", () => {
    const result = getContextLimit("");

    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should handle null model name", () => {
    const result = getContextLimit(null as any);

    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should handle model name with special characters", () => {
    const result = getContextLimit("model@#$%^&*()");

    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should handle very long model name", () => {
    const longName = "model-" + "a".repeat(1000);

    const result = getContextLimit(longName);

    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test("should be deterministic (same inputs -> same output)", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const result1 = getContextLimit("test-model");
    const result2 = getContextLimit("test-model");
    const result3 = getContextLimit("test-model");

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  test("should handle concurrent calls", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const results = [
      getContextLimit("test-model"),
      getContextLimit("test-model"),
      getContextLimit("test-model"),
    ];

    expect(results[0]).toBe(16384);
    expect(results[1]).toBe(16384);
    expect(results[2]).toBe(16384);
  });
});

// ============================================================================
// Tests: Regression Scenarios (Real-world use cases)
// ============================================================================

describe("getContextLimit - Regression scenarios", () => {
  test("should support migration from LMSTUDIO_CONTEXT_LENGTH to LOCAL_CONTEXT_LENGTH", () => {
    // User initially uses old env var
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const oldResult = getContextLimit("test-model");
    expect(oldResult).toBe(8192);
    expect(warnCalls.length).toBeGreaterThan(0);

    // User migrates to new env var
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const newResult = getContextLimit("test-model");
    expect(newResult).toBe(16384);
  });

  test("should handle gradual migration (both env vars during transition)", () => {
    // During migration, user sets both env vars
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    const result = getContextLimit("test-model");

    // New value should be used, no deprecation warning
    expect(result).toBe(16384);
    const hasDeprecationWarning = warnCalls.some((msg) =>
      msg.includes("LMSTUDIO_CONTEXT_LENGTH")
    );
    expect(hasDeprecationWarning).toBe(false);
  });

  test("should allow override of small model context", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "32768";

    // Model has small context in table
    const result = getContextLimit("deepseek-coder-33b"); // 16384 in table

    expect(result).toBe(32768);
    expect(result).not.toBe(16384);
  });

  test("should allow override of large model context", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "8192";

    // Model has large context in table
    const result = getContextLimit("hermes-3"); // 131072 in table

    expect(result).toBe(8192);
    expect(result).not.toBe(131072);
  });

  test("should handle user correcting invalid env var value", () => {
    // User initially sets invalid value
    process.env.LOCAL_CONTEXT_LENGTH = "invalid";

    const invalidResult = getContextLimit("test-model");
    expect(invalidResult).toBe(32768); // Fallback

    // User corrects the value
    process.env.LOCAL_CONTEXT_LENGTH = "16384";

    const validResult = getContextLimit("test-model");
    expect(validResult).toBe(16384);
  });
});

// ============================================================================
// Tests: Documentation Compliance
// ============================================================================

describe("getContextLimit - Documentation compliance", () => {
  test("should follow documented priority order", () => {
    // Priority: LOCAL_CONTEXT_LENGTH > LMSTUDIO_CONTEXT_LENGTH > Model table > Default

    // 1. LOCAL_CONTEXT_LENGTH highest priority
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";
    expect(getContextLimit("qwen2.5-coder-7b", 4096)).toBe(16384);

    delete process.env.LOCAL_CONTEXT_LENGTH;

    // 2. LMSTUDIO_CONTEXT_LENGTH second priority
    expect(getContextLimit("qwen2.5-coder-7b", 4096)).toBe(8192);

    delete process.env.LMSTUDIO_CONTEXT_LENGTH;

    // 3. LMStudio API parameter third priority
    expect(getContextLimit("qwen2.5-coder-7b", 4096)).toBe(4096);

    // 4. Model table fourth priority
    expect(getContextLimit("qwen2.5-coder-7b")).toBe(32768);

    // 5. Default last priority
    expect(getContextLimit("unknown-model")).toBe(32768);
  });

  test("should emit warning only for LMSTUDIO_CONTEXT_LENGTH fallback", () => {
    // No warning for LOCAL_CONTEXT_LENGTH
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    getContextLimit("test-model");
    expect(warnCalls.length).toBe(0);

    delete process.env.LOCAL_CONTEXT_LENGTH;

    // Warning for LMSTUDIO_CONTEXT_LENGTH
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";
    getContextLimit("test-model");
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  test("should not warn when LOCAL_CONTEXT_LENGTH set (even if LMSTUDIO_CONTEXT_LENGTH also set)", () => {
    process.env.LOCAL_CONTEXT_LENGTH = "16384";
    process.env.LMSTUDIO_CONTEXT_LENGTH = "8192";

    getContextLimit("test-model");

    const hasWarning = warnCalls.some((msg) => msg.includes("LMSTUDIO_CONTEXT_LENGTH"));
    expect(hasWarning).toBe(false);
  });
});
