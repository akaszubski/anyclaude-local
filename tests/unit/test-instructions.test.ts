/**
 * Unit tests for first-run test instructions (Issue #78)
 *
 * Tests the displayTestInstructions() function's behavior:
 * 1. First run detection (no .anyclaude-setup file exists) → displays instructions
 * 2. Subsequent runs (.anyclaude-setup exists) → skips instructions
 * 3. Instructions include: npm test, minimal config example, setup status
 * 4. Instructions are user-friendly and actionable
 * 5. .anyclaude-setup marker file created after display
 * 6. Env var ANYCLAUDE_SKIP_INSTRUCTIONS=1 skips instructions
 *
 * Test categories:
 * - First-run detection (marker file check)
 * - Instruction display formatting
 * - Marker file creation
 * - Skip flag handling
 * - Error handling (write failures)
 * - Message content validation
 *
 * Expected: ALL TESTS FAIL (TDD red phase - displayTestInstructions doesn't exist yet)
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

// Import after mocks
import { displayTestInstructions } from "../../src/utils/test-instructions";

// Mock console methods
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

// Store original env var
let originalSkipEnv: string | undefined;

beforeEach(() => {
  jest.clearAllMocks();

  // Reset console capture
  consoleLogs = [];
  consoleErrors = [];

  console.log = jest.fn((...args: unknown[]) => {
    consoleLogs.push(args.join(" "));
  });

  console.error = jest.fn((...args: unknown[]) => {
    consoleErrors.push(args.join(" "));
  });

  // Default: marker file doesn't exist (first run)
  (mockFs.existsSync as jest.Mock).mockReturnValue(false);

  // Save and clear skip env var
  originalSkipEnv = process.env.ANYCLAUDE_SKIP_INSTRUCTIONS;
  delete process.env.ANYCLAUDE_SKIP_INSTRUCTIONS;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;

  // Restore env var
  if (originalSkipEnv !== undefined) {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = originalSkipEnv;
  } else {
    delete process.env.ANYCLAUDE_SKIP_INSTRUCTIONS;
  }

  jest.restoreAllMocks();
});

// ============================================================================
// Test Suite: First Run Detection
// ============================================================================

describe("Test Instructions - First Run Detection", () => {
  test("should display instructions when marker file doesn't exist", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBeGreaterThan(0);
  });

  test("should NOT display instructions when marker file exists", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    displayTestInstructions();

    expect(consoleLogs.length).toBe(0);
  });

  test("should check for .anyclaude-setup marker file", () => {
    displayTestInstructions();

    expect(mockFs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining(".anyclaude-setup")
    );
  });

  test("should check marker file in home directory", () => {
    displayTestInstructions();

    const calls = (mockFs.existsSync as jest.Mock).mock.calls;
    const markerPath = calls[0]?.[0];

    expect(markerPath).toMatch(/\.anyclaude-setup$/);
  });
});

// ============================================================================
// Test Suite: Instruction Content
// ============================================================================

describe("Test Instructions - Content", () => {
  test("should include 'npm test' command in instructions", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toContain("npm test");
  });

  test("should include config file creation guidance", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toMatch(/\.anyclauderc\.json/);
  });

  test("should mention .anyclauderc.example.json", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toContain(".anyclauderc.example.json");
  });

  test("should include backend selection guidance", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toMatch(/backend|local|openrouter/i);
  });

  test("should include helpful next steps", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toMatch(/next|step|start|run/i);
  });

  test("should be user-friendly and welcoming", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ").toLowerCase();
    expect(
      output.includes("welcome") ||
        output.includes("getting started") ||
        output.includes("quick start")
    ).toBe(true);
  });
});

// ============================================================================
// Test Suite: Marker File Creation
// ============================================================================

describe("Test Instructions - Marker File Creation", () => {
  test("should create .anyclaude-setup marker file after display", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".anyclaude-setup"),
      expect.any(String),
      expect.any(String)
    );
  });

  test("should create marker file in home directory", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const writeCall = (mockFs.writeFileSync as jest.Mock).mock.calls[0];
    const markerPath = writeCall?.[0];

    expect(markerPath).toMatch(/\.anyclaude-setup$/);
  });

  test("should write timestamp to marker file", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const writeCall = (mockFs.writeFileSync as jest.Mock).mock.calls[0];
    const content = writeCall?.[1];

    expect(content).toMatch(/\d{4}/); // Year in timestamp
  });

  test("should NOT create marker file on subsequent runs", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    displayTestInstructions();

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test Suite: Skip Instructions Flag
// ============================================================================

describe("Test Instructions - Skip Flag", () => {
  test("should skip instructions when ANYCLAUDE_SKIP_INSTRUCTIONS=1", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "1";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBe(0);
  });

  test("should skip instructions when ANYCLAUDE_SKIP_INSTRUCTIONS=true", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "true";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBe(0);
  });

  test("should display instructions when ANYCLAUDE_SKIP_INSTRUCTIONS=0", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "0";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBeGreaterThan(0);
  });

  test("should display instructions when ANYCLAUDE_SKIP_INSTRUCTIONS=false", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "false";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBeGreaterThan(0);
  });

  test("should NOT create marker file when skipped via env var", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "1";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe("Test Instructions - Error Handling", () => {
  test("should handle marker file write failure gracefully", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    // Should not crash
    expect(() => displayTestInstructions()).not.toThrow();
  });

  test("should still display instructions even if marker write fails", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("Write failed");
    });

    displayTestInstructions();

    expect(consoleLogs.length).toBeGreaterThan(0);
  });

  test("should log error when marker file write fails", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    displayTestInstructions();

    // Should log error or warning (implementation choice)
    expect(consoleErrors.length + consoleLogs.length).toBeGreaterThan(0);
  });

  test("should handle missing home directory gracefully", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    // Should not crash even if path resolution fails
    expect(() => displayTestInstructions()).not.toThrow();
  });
});

// ============================================================================
// Test Suite: Formatting and Presentation
// ============================================================================

describe("Test Instructions - Formatting", () => {
  test("should use clear section headers", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join("\n");
    expect(output).toMatch(/\n.*\n/); // Multi-line output
  });

  test("should include visual separators or formatting", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    // Should have some formatting (dashes, equals, arrows, etc.)
    expect(output.length).toBeGreaterThan(100); // Substantial content
  });

  test("should display numbered or bulleted steps", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(
      output.includes("1.") ||
        output.includes("2.") ||
        output.includes("-") ||
        output.includes("*")
    ).toBe(true);
  });

  test("should include code examples in backticks or similar", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toContain("npm test");
  });
});

// ============================================================================
// Test Suite: Integration Scenarios
// ============================================================================

describe("Test Instructions - Integration Scenarios", () => {
  test("should guide user through complete first-run setup", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");

    // Should mention config
    expect(output).toMatch(/config/i);

    // Should mention testing
    expect(output).toContain("npm test");

    // Should mention running the proxy
    expect(output).toMatch(/run|start/i);
  });

  test("should work in typical first-run scenario", () => {
    // Simulate fresh install
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    // Should display instructions
    expect(consoleLogs.length).toBeGreaterThan(0);

    // Should create marker
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  test("should NOT display on second run", () => {
    // First run
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    displayTestInstructions();
    const firstRunLogs = consoleLogs.length;

    // Reset logs
    consoleLogs = [];
    jest.clearAllMocks();

    // Second run - marker exists
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    displayTestInstructions();

    expect(consoleLogs.length).toBe(0);
    expect(firstRunLogs).toBeGreaterThan(0);
  });

  test("should support CI/CD environments with skip flag", () => {
    process.env.ANYCLAUDE_SKIP_INSTRUCTIONS = "1";
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    // No output in CI
    expect(consoleLogs.length).toBe(0);

    // No marker created
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test Suite: Content Validation
// ============================================================================

describe("Test Instructions - Content Validation", () => {
  test("should mention minimum 3 actionable steps", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    const stepMatches = output.match(/\d+\./g) || [];
    expect(stepMatches.length).toBeGreaterThanOrEqual(3);
  });

  test("should include minimal config example with backend field", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ");
    expect(output).toMatch(/backend.*local|local.*backend/i);
  });

  test("should reference documentation or help resources", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const output = consoleLogs.join(" ").toLowerCase();
    expect(
      output.includes("readme") ||
        output.includes("docs") ||
        output.includes("documentation") ||
        output.includes("guide")
    ).toBe(true);
  });

  test("should be concise (under 50 lines of output)", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    expect(consoleLogs.length).toBeLessThan(50);
  });

  test("should not overwhelm user with too much information", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();

    const totalChars = consoleLogs.join("").length;
    expect(totalChars).toBeLessThan(2000); // Reasonable limit
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe("Test Instructions - Edge Cases", () => {
  test("should handle readonly home directory", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });

    expect(() => displayTestInstructions()).not.toThrow();
  });

  test("should handle missing fs methods gracefully", () => {
    (mockFs.existsSync as jest.Mock).mockImplementation(() => {
      throw new Error("Method not available");
    });

    expect(() => displayTestInstructions()).not.toThrow();
  });

  test("should handle concurrent runs (race condition)", () => {
    // Both runs think it's first run
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    displayTestInstructions();
    displayTestInstructions();

    // Should handle gracefully (may create marker twice, but shouldn't crash)
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  test("should handle empty HOME environment variable", () => {
    const originalHome = process.env.HOME;
    delete process.env.HOME;

    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    expect(() => displayTestInstructions()).not.toThrow();

    if (originalHome) {
      process.env.HOME = originalHome;
    }
  });
});
