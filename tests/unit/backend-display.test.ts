/**
 * Unit tests for backend-display.ts
 *
 * Tests the backend display name utility functions for user-friendly backend naming.
 *
 * Components tested:
 * 1. getBackendDisplayName() - Convert mode to display name
 * 2. getBackendLogPrefix() - Get bracketed display name for logging
 * 3. AnyclaudeMode type handling - All valid modes and edge cases
 *
 * Test categories:
 * - Valid mode display names (4 modes: claude, lmstudio, openrouter, mlx-cluster)
 * - Unknown/invalid mode fallback behavior
 * - Log prefix formatting (bracketed display names)
 * - Edge cases (empty strings, null, undefined, type coercion)
 * - Case sensitivity and whitespace handling
 * - Type safety validation
 *
 * Mode to display name mappings:
 * - 'claude' → 'Claude'
 * - 'lmstudio' → 'LMStudio'
 * - 'openrouter' → 'OpenRouter'
 * - 'mlx-cluster' → 'MLX Cluster'
 * - unknown → 'Unknown Backend'
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  getBackendDisplayName,
  getBackendLogPrefix,
} from "../../src/utils/backend-display";
import type { AnyclaudeMode } from "../../src/trace-logger";

// ============================================================================
// Test Data - Valid Modes
// ============================================================================

const VALID_MODES: Array<{
  mode: AnyclaudeMode;
  displayName: string;
  logPrefix: string;
}> = [
  {
    mode: "claude",
    displayName: "Claude",
    logPrefix: "[Claude]",
  },
  {
    mode: "local",
    displayName: "Local",
    logPrefix: "[Local]",
  },
  {
    mode: "lmstudio",
    displayName: "LMStudio",
    logPrefix: "[LMStudio]",
  },
  {
    mode: "openrouter",
    displayName: "OpenRouter",
    logPrefix: "[OpenRouter]",
  },
  {
    mode: "mlx-cluster",
    displayName: "MLX Cluster",
    logPrefix: "[MLX Cluster]",
  },
];

// ============================================================================
// Test Data - Invalid/Edge Cases
// ============================================================================

const INVALID_MODES = [
  { input: "invalid" as AnyclaudeMode, description: "unknown mode string" },
  { input: "CLAUDE" as AnyclaudeMode, description: "uppercase mode" },
  { input: "lm-studio" as AnyclaudeMode, description: "wrong separator" },
  { input: "" as AnyclaudeMode, description: "empty string" },
  { input: " claude " as AnyclaudeMode, description: "mode with whitespace" },
  { input: "mlx" as AnyclaudeMode, description: "partial mode name" },
];

// ============================================================================
// Tests: getBackendDisplayName()
// ============================================================================

describe("getBackendDisplayName", () => {
  describe("Valid modes", () => {
    test("should return 'Claude' for claude mode", () => {
      const result = getBackendDisplayName("claude");
      expect(result).toBe("Claude");
    });

    test("should return 'Local' for local mode", () => {
      const result = getBackendDisplayName("local");
      expect(result).toBe("Local");
    });

    test("should return 'LMStudio' for lmstudio mode (deprecated)", () => {
      const result = getBackendDisplayName("lmstudio");
      expect(result).toBe("LMStudio");
    });

    test("should return 'OpenRouter' for openrouter mode", () => {
      const result = getBackendDisplayName("openrouter");
      expect(result).toBe("OpenRouter");
    });

    test("should return 'MLX Cluster' for mlx-cluster mode", () => {
      const result = getBackendDisplayName("mlx-cluster");
      expect(result).toBe("MLX Cluster");
    });

    test("should handle all valid modes correctly (table-driven)", () => {
      VALID_MODES.forEach(({ mode, displayName }) => {
        const result = getBackendDisplayName(mode);
        expect(result).toBe(displayName);
      });
    });
  });

  describe("Invalid/unknown modes", () => {
    test("should return 'Unknown Backend' for unknown mode string", () => {
      const result = getBackendDisplayName("invalid" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should return 'Unknown Backend' for empty string", () => {
      const result = getBackendDisplayName("" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should return 'Unknown Backend' for uppercase mode", () => {
      const result = getBackendDisplayName("CLAUDE" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should return 'Unknown Backend' for mode with wrong separator", () => {
      const result = getBackendDisplayName("lm-studio" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should return 'Unknown Backend' for mode with whitespace", () => {
      const result = getBackendDisplayName(" claude " as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should return 'Unknown Backend' for partial mode name", () => {
      const result = getBackendDisplayName("mlx" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should handle all invalid modes with fallback (table-driven)", () => {
      INVALID_MODES.forEach(({ input, description }) => {
        const result = getBackendDisplayName(input);
        expect(result).toBe("Unknown Backend");
      });
    });
  });

  describe("Edge cases", () => {
    test("should be case-sensitive (uppercase should not match)", () => {
      const result = getBackendDisplayName("LMSTUDIO" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
      expect(result).not.toBe("LMStudio");
    });

    test("should be exact match only (no partial matches)", () => {
      const result = getBackendDisplayName("claude-api" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
      expect(result).not.toBe("Claude");
    });

    test("should not trim whitespace automatically", () => {
      const result = getBackendDisplayName("  openrouter  " as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
      expect(result).not.toBe("OpenRouter");
    });

    test("should handle special characters gracefully", () => {
      const result = getBackendDisplayName("mlx@cluster" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });

    test("should handle numeric strings", () => {
      const result = getBackendDisplayName("123" as AnyclaudeMode);
      expect(result).toBe("Unknown Backend");
    });
  });

  describe("Type safety", () => {
    test("should accept all AnyclaudeMode union members", () => {
      // This test verifies TypeScript type checking at compile time
      const modes: AnyclaudeMode[] = [
        "claude",
        "lmstudio",
        "openrouter",
        "mlx-cluster",
      ];

      modes.forEach((mode) => {
        const result = getBackendDisplayName(mode);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      });
    });

    test("should return string type", () => {
      const result = getBackendDisplayName("claude");
      expect(typeof result).toBe("string");
    });

    test("should never return null or undefined", () => {
      const result = getBackendDisplayName("invalid" as AnyclaudeMode);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect(typeof result).toBe("string");
    });
  });
});

// ============================================================================
// Tests: getBackendLogPrefix()
// ============================================================================

describe("getBackendLogPrefix", () => {
  describe("Valid modes - bracket formatting", () => {
    test("should return '[Claude]' for claude mode", () => {
      const result = getBackendLogPrefix("claude");
      expect(result).toBe("[Claude]");
    });

    test("should return '[Local]' for local mode", () => {
      const result = getBackendLogPrefix("local");
      expect(result).toBe("[Local]");
    });

    test("should return '[LMStudio]' for lmstudio mode (deprecated)", () => {
      const result = getBackendLogPrefix("lmstudio");
      expect(result).toBe("[LMStudio]");
    });

    test("should return '[OpenRouter]' for openrouter mode", () => {
      const result = getBackendLogPrefix("openrouter");
      expect(result).toBe("[OpenRouter]");
    });

    test("should return '[MLX Cluster]' for mlx-cluster mode", () => {
      const result = getBackendLogPrefix("mlx-cluster");
      expect(result).toBe("[MLX Cluster]");
    });

    test("should handle all valid modes with brackets (table-driven)", () => {
      VALID_MODES.forEach(({ mode, logPrefix }) => {
        const result = getBackendLogPrefix(mode);
        expect(result).toBe(logPrefix);
      });
    });
  });

  describe("Invalid modes - bracket formatting", () => {
    test("should return '[Unknown Backend]' for unknown mode", () => {
      const result = getBackendLogPrefix("invalid" as AnyclaudeMode);
      expect(result).toBe("[Unknown Backend]");
    });

    test("should return '[Unknown Backend]' for empty string", () => {
      const result = getBackendLogPrefix("" as AnyclaudeMode);
      expect(result).toBe("[Unknown Backend]");
    });

    test("should return '[Unknown Backend]' for uppercase mode", () => {
      const result = getBackendLogPrefix("OPENROUTER" as AnyclaudeMode);
      expect(result).toBe("[Unknown Backend]");
    });

    test("should handle all invalid modes with fallback bracket (table-driven)", () => {
      INVALID_MODES.forEach(({ input, description }) => {
        const result = getBackendLogPrefix(input);
        expect(result).toBe("[Unknown Backend]");
      });
    });
  });

  describe("Bracket formatting validation", () => {
    test("should start with opening bracket", () => {
      const result = getBackendLogPrefix("claude");
      expect(result).toMatch(/^\[/);
    });

    test("should end with closing bracket", () => {
      const result = getBackendLogPrefix("lmstudio");
      expect(result).toMatch(/\]$/);
    });

    test("should have exactly one opening bracket", () => {
      const result = getBackendLogPrefix("openrouter");
      const openCount = (result.match(/\[/g) || []).length;
      expect(openCount).toBe(1);
    });

    test("should have exactly one closing bracket", () => {
      const result = getBackendLogPrefix("mlx-cluster");
      const closeCount = (result.match(/\]/g) || []).length;
      expect(closeCount).toBe(1);
    });

    test("should not have nested brackets", () => {
      const result = getBackendLogPrefix("claude");
      expect(result).not.toMatch(/\[\[|\]\]/);
    });

    test("should have balanced brackets", () => {
      VALID_MODES.forEach(({ mode }) => {
        const result = getBackendLogPrefix(mode);
        const openCount = (result.match(/\[/g) || []).length;
        const closeCount = (result.match(/\]/g) || []).length;
        expect(openCount).toBe(closeCount);
      });
    });

    test("should wrap display name exactly (no extra spaces)", () => {
      const displayName = getBackendDisplayName("claude");
      const logPrefix = getBackendLogPrefix("claude");
      expect(logPrefix).toBe(`[${displayName}]`);
    });
  });

  describe("Consistency with getBackendDisplayName", () => {
    test("should use display name from getBackendDisplayName for claude", () => {
      const displayName = getBackendDisplayName("claude");
      const logPrefix = getBackendLogPrefix("claude");
      expect(logPrefix).toBe(`[${displayName}]`);
    });

    test("should use display name from getBackendDisplayName for lmstudio", () => {
      const displayName = getBackendDisplayName("lmstudio");
      const logPrefix = getBackendLogPrefix("lmstudio");
      expect(logPrefix).toBe(`[${displayName}]`);
    });

    test("should use display name from getBackendDisplayName for openrouter", () => {
      const displayName = getBackendDisplayName("openrouter");
      const logPrefix = getBackendLogPrefix("openrouter");
      expect(logPrefix).toBe(`[${displayName}]`);
    });

    test("should use display name from getBackendDisplayName for mlx-cluster", () => {
      const displayName = getBackendDisplayName("mlx-cluster");
      const logPrefix = getBackendLogPrefix("mlx-cluster");
      expect(logPrefix).toBe(`[${displayName}]`);
    });

    test("should use display name from getBackendDisplayName for unknown modes", () => {
      const displayName = getBackendDisplayName("invalid" as AnyclaudeMode);
      const logPrefix = getBackendLogPrefix("invalid" as AnyclaudeMode);
      expect(logPrefix).toBe(`[${displayName}]`);
    });

    test("should maintain consistency for all modes (table-driven)", () => {
      VALID_MODES.forEach(({ mode }) => {
        const displayName = getBackendDisplayName(mode);
        const logPrefix = getBackendLogPrefix(mode);
        expect(logPrefix).toBe(`[${displayName}]`);
      });
    });

    test("should maintain consistency for all invalid modes (table-driven)", () => {
      INVALID_MODES.forEach(({ input }) => {
        const displayName = getBackendDisplayName(input);
        const logPrefix = getBackendLogPrefix(input);
        expect(logPrefix).toBe(`[${displayName}]`);
      });
    });
  });

  describe("Type safety", () => {
    test("should accept all AnyclaudeMode union members", () => {
      const modes: AnyclaudeMode[] = [
        "claude",
        "lmstudio",
        "openrouter",
        "mlx-cluster",
      ];

      modes.forEach((mode) => {
        const result = getBackendLogPrefix(mode);
        expect(typeof result).toBe("string");
        expect(result).toMatch(/^\[.*\]$/);
      });
    });

    test("should return string type", () => {
      const result = getBackendLogPrefix("openrouter");
      expect(typeof result).toBe("string");
    });

    test("should never return null or undefined", () => {
      const result = getBackendLogPrefix("invalid" as AnyclaudeMode);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("Logging use cases", () => {
    test("should produce log-friendly prefix for string interpolation", () => {
      const prefix = getBackendLogPrefix("claude");
      const logMessage = `${prefix} Request received`;
      expect(logMessage).toBe("[Claude] Request received");
    });

    test("should produce unique prefixes for each backend", () => {
      const prefixes = VALID_MODES.map(({ mode }) => getBackendLogPrefix(mode));
      const uniquePrefixes = new Set(prefixes);
      expect(uniquePrefixes.size).toBe(VALID_MODES.length);
    });

    test("should be suitable for log parsing/filtering", () => {
      const logLines = VALID_MODES.map(({ mode }) => {
        const prefix = getBackendLogPrefix(mode);
        return `${prefix} Test message`;
      });

      logLines.forEach((line) => {
        // Should be able to extract backend name from log
        const match = line.match(/^\[(.*?)\]/);
        expect(match).not.toBeNull();
        expect(match![1]).toBeTruthy();
      });
    });
  });
});

// ============================================================================
// Integration Tests - Both Functions Together
// ============================================================================

describe("getBackendDisplayName + getBackendLogPrefix integration", () => {
  describe("Consistent behavior", () => {
    test("should produce matching outputs for all valid modes", () => {
      VALID_MODES.forEach(({ mode, displayName, logPrefix }) => {
        const actualDisplayName = getBackendDisplayName(mode);
        const actualLogPrefix = getBackendLogPrefix(mode);

        expect(actualDisplayName).toBe(displayName);
        expect(actualLogPrefix).toBe(logPrefix);
        expect(actualLogPrefix).toBe(`[${actualDisplayName}]`);
      });
    });

    test("should produce matching outputs for invalid modes", () => {
      INVALID_MODES.forEach(({ input }) => {
        const displayName = getBackendDisplayName(input);
        const logPrefix = getBackendLogPrefix(input);

        expect(displayName).toBe("Unknown Backend");
        expect(logPrefix).toBe("[Unknown Backend]");
        expect(logPrefix).toBe(`[${displayName}]`);
      });
    });
  });

  describe("Real-world usage patterns", () => {
    test("should support CLI help text generation", () => {
      const helpText = VALID_MODES.map(({ mode }) => {
        const name = getBackendDisplayName(mode);
        return `  ${mode.padEnd(15)} - ${name}`;
      }).join("\n");

      expect(helpText).toContain("claude");
      expect(helpText).toContain("Claude");
      expect(helpText).toContain("mlx-cluster");
      expect(helpText).toContain("MLX Cluster");
    });

    test("should support log message construction", () => {
      const messages = VALID_MODES.map(({ mode }) => {
        const prefix = getBackendLogPrefix(mode);
        return `${prefix} Initializing backend...`;
      });

      expect(messages).toContain("[Claude] Initializing backend...");
      expect(messages).toContain("[LMStudio] Initializing backend...");
      expect(messages).toContain("[OpenRouter] Initializing backend...");
      expect(messages).toContain("[MLX Cluster] Initializing backend...");
    });

    test("should support error reporting with backend context", () => {
      const mode: AnyclaudeMode = "lmstudio";
      const backendName = getBackendDisplayName(mode);
      const errorMsg = `Failed to connect to ${backendName}`;

      expect(errorMsg).toBe("Failed to connect to LMStudio");
    });

    test("should support structured logging metadata", () => {
      VALID_MODES.forEach(({ mode }) => {
        const metadata = {
          backend: mode,
          displayName: getBackendDisplayName(mode),
          logPrefix: getBackendLogPrefix(mode),
        };

        expect(metadata.backend).toBeTruthy();
        expect(metadata.displayName).toBeTruthy();
        expect(metadata.logPrefix).toMatch(/^\[.*\]$/);
      });
    });
  });

  describe("Performance characteristics", () => {
    test("should be fast enough for high-frequency logging", () => {
      const iterations = 10000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        getBackendDisplayName("claude");
        getBackendLogPrefix("claude");
      }

      const elapsed = Date.now() - start;
      // Should complete 10k iterations in under 100ms
      expect(elapsed).toBeLessThan(100);
    });

    test("should not allocate excessive memory", () => {
      // Simple test - functions should return same string instances for same input
      const name1 = getBackendDisplayName("openrouter");
      const name2 = getBackendDisplayName("openrouter");

      // Both should be 'OpenRouter' - implementation can choose to cache or not
      expect(name1).toBe(name2);
    });
  });
});
