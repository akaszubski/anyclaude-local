/**
 * Unit tests for executable path resolution (Issue #76)
 *
 * Tests the resolveExecutable(name, knownPaths) function:
 * 1. When executable found at first known path → returns that path
 * 2. When executable found at second known path (first missing) → returns second path
 * 3. When executable not found at any known path → returns bare command name
 * 4. When knownPaths is empty → returns bare command name
 * 5. Known paths include home directory expansion (os.homedir())
 * 6. Handles undefined/null gracefully
 *
 * Test categories:
 * - Path resolution (found at various positions)
 * - Fallback to bare command name
 * - Home directory expansion (~/)
 * - Edge cases (empty paths, undefined, null)
 * - Multiple known paths
 * - Path prioritization (first match wins)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - resolveExecutable doesn't exist yet)
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
import * as os from "os";

// Mock fs and os modules
jest.mock("fs");
jest.mock("os");
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

// Import after mocks
import { resolveExecutable } from "../../src/utils/executable-resolver";

beforeEach(() => {
  jest.clearAllMocks();

  // Default: no files exist
  (mockFs.existsSync as jest.Mock).mockReturnValue(false);

  // Default home directory
  (mockOs.homedir as jest.Mock).mockReturnValue("/Users/testuser");
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// Test Suite: Path Resolution - Found Cases
// ============================================================================

describe("Executable Resolver - Path Found", () => {
  test("should return first known path when executable found there", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "/opt/homebrew/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/usr/local/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/usr/local/bin/uvicorn");
  });

  test("should return second path when first missing but second exists", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "/opt/homebrew/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/opt/homebrew/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/opt/homebrew/bin/uvicorn");
  });

  test("should return third path when first two missing", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "/opt/homebrew/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/usr/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/usr/bin/uvicorn");
  });

  test("should prefer earlier path over later when both exist", () => {
    const knownPaths = [
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      "/usr/bin/python3",
    ];

    // All paths exist, but should return first
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    const result = resolveExecutable("python3", knownPaths);

    expect(result).toBe("/usr/local/bin/python3");
  });
});

// ============================================================================
// Test Suite: Fallback to Bare Command Name
// ============================================================================

describe("Executable Resolver - Fallback to Bare Name", () => {
  test("should return bare command name when not found at any known path", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "/opt/homebrew/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("uvicorn");
  });

  test("should return bare name when knownPaths is empty array", () => {
    const knownPaths: string[] = [];

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("uvicorn");
  });

  test("should not check filesystem when knownPaths is empty", () => {
    const knownPaths: string[] = [];

    resolveExecutable("uvicorn", knownPaths);

    expect(mockFs.existsSync).not.toHaveBeenCalled();
  });

  test("should return bare name for different executables", () => {
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    expect(resolveExecutable("python3", ["/usr/bin/python3"])).toBe("python3");
    expect(resolveExecutable("node", ["/usr/local/bin/node"])).toBe("node");
    expect(resolveExecutable("docker", ["/usr/bin/docker"])).toBe("docker");
  });
});

// ============================================================================
// Test Suite: Home Directory Expansion
// ============================================================================

describe("Executable Resolver - Home Directory Expansion", () => {
  test("should expand ~ to home directory in known paths", () => {
    const knownPaths = ["~/bin/uvicorn", "~/.local/bin/uvicorn"];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Users/testuser/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/Users/testuser/bin/uvicorn");
    expect(mockFs.existsSync).toHaveBeenCalledWith("/Users/testuser/bin/uvicorn");
  });

  test("should check second home-expanded path if first missing", () => {
    const knownPaths = ["~/bin/uvicorn", "~/.local/bin/uvicorn"];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Users/testuser/.local/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/Users/testuser/.local/bin/uvicorn");
  });

  test("should handle mixed absolute and home-relative paths", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "~/bin/uvicorn",
      "/opt/homebrew/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Users/testuser/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/Users/testuser/bin/uvicorn");
  });

  test("should handle different home directories", () => {
    (mockOs.homedir as jest.Mock).mockReturnValue("/home/linuxuser");

    const knownPaths = ["~/.local/bin/uvicorn"];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/home/linuxuser/.local/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/home/linuxuser/.local/bin/uvicorn");
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe("Executable Resolver - Edge Cases", () => {
  test("should handle undefined knownPaths", () => {
    const result = resolveExecutable("uvicorn", undefined as any);

    expect(result).toBe("uvicorn");
  });

  test("should handle null knownPaths", () => {
    const result = resolveExecutable("uvicorn", null as any);

    expect(result).toBe("uvicorn");
  });

  test("should handle empty command name", () => {
    const knownPaths = ["/usr/bin/"];

    const result = resolveExecutable("", knownPaths);

    expect(result).toBe("");
  });

  test("should handle paths with spaces", () => {
    const knownPaths = ["/Applications/My App/bin/uvicorn"];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Applications/My App/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/Applications/My App/bin/uvicorn");
  });

  test("should handle single known path", () => {
    const knownPaths = ["/usr/local/bin/uvicorn"];

    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/usr/local/bin/uvicorn");
  });

  test("should handle paths with duplicate entries", () => {
    const knownPaths = [
      "/usr/local/bin/uvicorn",
      "/usr/local/bin/uvicorn", // duplicate
      "/opt/homebrew/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/usr/local/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/usr/local/bin/uvicorn");
  });
});

// ============================================================================
// Test Suite: Multiple Executables
// ============================================================================

describe("Executable Resolver - Multiple Executables", () => {
  test("should resolve python3 from known locations", () => {
    const knownPaths = [
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      "/usr/bin/python3",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/opt/homebrew/bin/python3";
    });

    const result = resolveExecutable("python3", knownPaths);

    expect(result).toBe("/opt/homebrew/bin/python3");
  });

  test("should resolve docker from known locations", () => {
    const knownPaths = [
      "/usr/local/bin/docker",
      "/usr/bin/docker",
      "~/.local/bin/docker",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/usr/bin/docker";
    });

    const result = resolveExecutable("docker", knownPaths);

    expect(result).toBe("/usr/bin/docker");
  });

  test("should resolve node from home directory", () => {
    const knownPaths = ["~/.nvm/versions/node/v20.0.0/bin/node", "/usr/bin/node"];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Users/testuser/.nvm/versions/node/v20.0.0/bin/node";
    });

    const result = resolveExecutable("node", knownPaths);

    expect(result).toBe("/Users/testuser/.nvm/versions/node/v20.0.0/bin/node");
  });
});

// ============================================================================
// Test Suite: Integration with Real Use Cases
// ============================================================================

describe("Executable Resolver - Real Use Cases", () => {
  test("should resolve uvicorn for MLX Worker startup", () => {
    const knownPaths = [
      "/opt/homebrew/bin/uvicorn",
      "/usr/local/bin/uvicorn",
      "~/.local/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/opt/homebrew/bin/uvicorn";
    });

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/opt/homebrew/bin/uvicorn");
  });

  test("should fall back to PATH when uvicorn not in known locations", () => {
    const knownPaths = [
      "/opt/homebrew/bin/uvicorn",
      "/usr/local/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockReturnValue(false);

    const result = resolveExecutable("uvicorn", knownPaths);

    // Falls back to bare name, which shell will resolve via PATH
    expect(result).toBe("uvicorn");
  });

  test("should resolve orbctl for Docker management", () => {
    const knownPaths = [
      "/opt/homebrew/bin/orbctl",
      "/usr/local/bin/orbctl",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/opt/homebrew/bin/orbctl";
    });

    const result = resolveExecutable("orbctl", knownPaths);

    expect(result).toBe("/opt/homebrew/bin/orbctl");
  });

  test("should resolve python3 for Python-based tools", () => {
    const knownPaths = [
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
      "/usr/bin/python3",
      "~/.pyenv/shims/python3",
    ];

    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      return p === "/Users/testuser/.pyenv/shims/python3";
    });

    const result = resolveExecutable("python3", knownPaths);

    expect(result).toBe("/Users/testuser/.pyenv/shims/python3");
  });
});

// ============================================================================
// Test Suite: Path Prioritization
// ============================================================================

describe("Executable Resolver - Path Prioritization", () => {
  test("should prefer Homebrew paths over system paths", () => {
    const knownPaths = [
      "/opt/homebrew/bin/python3",
      "/usr/bin/python3",
    ];

    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    const result = resolveExecutable("python3", knownPaths);

    expect(result).toBe("/opt/homebrew/bin/python3");
  });

  test("should prefer user local paths over system paths", () => {
    const knownPaths = [
      "~/.local/bin/uvicorn",
      "/usr/local/bin/uvicorn",
      "/usr/bin/uvicorn",
    ];

    (mockFs.existsSync as jest.Mock).mockReturnValue(true);

    const result = resolveExecutable("uvicorn", knownPaths);

    expect(result).toBe("/Users/testuser/.local/bin/uvicorn");
  });

  test("should check paths in order until first found", () => {
    const knownPaths = [
      "/first/bin/tool",
      "/second/bin/tool",
      "/third/bin/tool",
      "/fourth/bin/tool",
    ];

    const existsCalls: string[] = [];
    (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
      existsCalls.push(p);
      return p === "/third/bin/tool";
    });

    const result = resolveExecutable("tool", knownPaths);

    expect(result).toBe("/third/bin/tool");
    expect(existsCalls).toEqual([
      "/first/bin/tool",
      "/second/bin/tool",
      "/third/bin/tool",
    ]);
    // Should stop checking after finding the first match
    expect(existsCalls.length).toBe(3);
  });
});
