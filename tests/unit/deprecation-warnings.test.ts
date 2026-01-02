/**
 * Unit tests for deprecation-warnings.ts
 *
 * Tests the deprecation warning system for managing migration from 'lmstudio' to 'local' backend.
 *
 * Components tested:
 * 1. warnDeprecation() - Emit deprecation warning with tracking
 * 2. Warning deduplication - Show warning only once per session
 * 3. Warning message formatting - Correct structure and content
 * 4. Independent warning tracking - Multiple warnings tracked separately
 * 5. Warning state management - Session-based tracking
 *
 * Test categories:
 * - Basic warning emission
 * - Deduplication (no spam)
 * - Message format validation
 * - Multiple independent warnings
 * - Edge cases (empty strings, undefined, special characters)
 * - Console output validation
 * - State reset testing
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import { warnDeprecation, resetWarnings } from "../../src/utils/deprecation-warnings";

// Mock console.warn to capture output
let warnCalls: Array<{ message: string; timestamp: number }> = [];
const originalWarn = console.warn;

beforeEach(() => {
  warnCalls = [];
  console.warn = jest.fn((...args: unknown[]) => {
    warnCalls.push({
      message: args.join(" "),
      timestamp: Date.now(),
    });
  });
  resetWarnings();
});

afterEach(() => {
  console.warn = originalWarn;
});

// ============================================================================
// Tests: Basic Warning Emission
// ============================================================================

describe("warnDeprecation - Basic emission", () => {
  test("should emit warning when called", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0].message).toContain("DEPRECATED");
  });

  test("should include deprecated name in warning", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    expect(warnCalls[0].message).toContain("lmstudio");
  });

  test("should include replacement name in warning", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    expect(warnCalls[0].message).toContain("local");
  });

  test("should include custom message in warning", () => {
    const customMessage = "Backend mode 'lmstudio' is deprecated. Use 'local' instead.";
    warnDeprecation("lmstudio", "local", customMessage);

    expect(warnCalls[0].message).toContain(customMessage);
  });

  test("should format warning with clear structure", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    const message = warnCalls[0].message;
    expect(message).toMatch(/DEPRECATED/i);
    expect(message).toMatch(/lmstudio/);
    expect(message).toMatch(/local/);
  });
});

// ============================================================================
// Tests: Warning Deduplication
// ============================================================================

describe("warnDeprecation - Deduplication", () => {
  test("should emit warning only once for same deprecated name", () => {
    const message = "Backend mode 'lmstudio' is deprecated. Use 'local' instead.";

    warnDeprecation("lmstudio", "local", message);
    warnDeprecation("lmstudio", "local", message);
    warnDeprecation("lmstudio", "local", message);

    expect(warnCalls.length).toBe(1);
  });

  test("should not emit warning on second call", () => {
    const message = "Backend mode 'lmstudio' is deprecated. Use 'local' instead.";

    warnDeprecation("lmstudio", "local", message);
    const firstCallCount = warnCalls.length;

    warnDeprecation("lmstudio", "local", message);
    const secondCallCount = warnCalls.length;

    expect(firstCallCount).toBe(1);
    expect(secondCallCount).toBe(1);
  });

  test("should track warnings per deprecated name", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    expect(warnCalls.length).toBe(2);
  });

  test("should allow different deprecated names to emit independently", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    expect(warnCalls.length).toBe(2);
  });
});

// ============================================================================
// Tests: Multiple Independent Warnings
// ============================================================================

describe("warnDeprecation - Independent tracking", () => {
  test("should track mode warnings separately from env var warnings", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );
    warnDeprecation(
      "LMSTUDIO_CONTEXT_LENGTH",
      "LOCAL_CONTEXT_LENGTH",
      "Env var 'LMSTUDIO_CONTEXT_LENGTH' is deprecated. Use 'LOCAL_CONTEXT_LENGTH' instead."
    );

    expect(warnCalls.length).toBe(3);
    expect(warnCalls[0].message).toContain("lmstudio");
    expect(warnCalls[1].message).toContain("LMSTUDIO_URL");
    expect(warnCalls[2].message).toContain("LMSTUDIO_CONTEXT_LENGTH");
  });

  test("should track config warnings separately", () => {
    warnDeprecation(
      "lmstudio.url",
      "local.url",
      "Config 'lmstudio.url' is deprecated. Use 'local.url' instead."
    );
    warnDeprecation(
      "lmstudio.contextLength",
      "local.contextLength",
      "Config 'lmstudio.contextLength' is deprecated. Use 'local.contextLength' instead."
    );

    expect(warnCalls.length).toBe(2);
  });

  test("should deduplicate each warning type independently", () => {
    // First set of warnings
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    // Duplicate warnings - should not emit
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    expect(warnCalls.length).toBe(2);
  });
});

// ============================================================================
// Tests: Message Format
// ============================================================================

describe("warnDeprecation - Message format", () => {
  test("should include DEPRECATED marker", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    expect(warnCalls[0].message).toMatch(/DEPRECATED/i);
  });

  test("should format message clearly", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    const message = warnCalls[0].message;
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain("lmstudio");
    expect(message).toContain("local");
  });

  test("should preserve custom message content", () => {
    const customMessage = "Custom deprecation notice with special info";
    warnDeprecation("old_name", "new_name", customMessage);

    expect(warnCalls[0].message).toContain(customMessage);
  });
});

// ============================================================================
// Tests: Edge Cases
// ============================================================================

describe("warnDeprecation - Edge cases", () => {
  test("should handle empty deprecated name", () => {
    warnDeprecation(
      "",
      "local",
      "Backend mode '' is deprecated. Use 'local' instead."
    );

    expect(warnCalls.length).toBe(1);
  });

  test("should handle empty replacement name", () => {
    warnDeprecation(
      "lmstudio",
      "",
      "Backend mode 'lmstudio' is deprecated. Use '' instead."
    );

    expect(warnCalls.length).toBe(1);
  });

  test("should handle empty message", () => {
    warnDeprecation("lmstudio", "local", "");

    expect(warnCalls.length).toBe(1);
  });

  test("should handle special characters in names", () => {
    warnDeprecation(
      "lm-studio",
      "local_backend",
      "Backend mode 'lm-studio' is deprecated. Use 'local_backend' instead."
    );

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0].message).toContain("lm-studio");
    expect(warnCalls[0].message).toContain("local_backend");
  });

  test("should handle long messages", () => {
    const longMessage = "A".repeat(500);
    warnDeprecation("lmstudio", "local", longMessage);

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0].message).toContain(longMessage);
  });

  test("should handle multiline messages", () => {
    const multilineMessage = "Line 1\nLine 2\nLine 3";
    warnDeprecation("lmstudio", "local", multilineMessage);

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0].message).toContain("Line 1");
  });
});

// ============================================================================
// Tests: State Reset
// ============================================================================

describe("resetWarnings", () => {
  test("should allow re-emission after reset", () => {
    const message = "Backend mode 'lmstudio' is deprecated. Use 'local' instead.";

    warnDeprecation("lmstudio", "local", message);
    expect(warnCalls.length).toBe(1);

    resetWarnings();
    warnCalls = [];

    warnDeprecation("lmstudio", "local", message);
    expect(warnCalls.length).toBe(1);
  });

  test("should clear all warning tracking state", () => {
    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    resetWarnings();
    warnCalls = [];

    warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    expect(warnCalls.length).toBe(2);
  });
});

// ============================================================================
// Tests: Return Value
// ============================================================================

describe("warnDeprecation - Return value", () => {
  test("should return true on first emission", () => {
    const result = warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );

    expect(result).toBe(true);
  });

  test("should return false on subsequent emissions", () => {
    const message = "Backend mode 'lmstudio' is deprecated. Use 'local' instead.";

    const first = warnDeprecation("lmstudio", "local", message);
    const second = warnDeprecation("lmstudio", "local", message);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test("should return true for different deprecated names", () => {
    const result1 = warnDeprecation(
      "lmstudio",
      "local",
      "Backend mode 'lmstudio' is deprecated. Use 'local' instead."
    );
    const result2 = warnDeprecation(
      "LMSTUDIO_URL",
      "LOCAL_URL",
      "Env var 'LMSTUDIO_URL' is deprecated. Use 'LOCAL_URL' instead."
    );

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });
});
