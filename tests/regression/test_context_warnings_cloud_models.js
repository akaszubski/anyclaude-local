/**
 * Regression Tests: Context Warnings for Cloud Models
 *
 * These tests prevent regression of the context warning bug
 * where "LOCAL MODEL LIMITATION" warnings appeared for cloud models.
 *
 * Issue covered:
 * - Issue #2: Context warnings showing "LOCAL MODEL LIMITATION" for cloud models
 *
 * Expected behavior:
 * - mode=claude: No warnings
 * - mode=openrouter: No warnings
 * - mode=lmstudio: Warnings should appear
 * - mode=mlx: Warnings should appear
 */

const { logContextWarning } = require("../../dist/context-manager.cjs");

describe("Context Warnings for Cloud Models (Regression)", () => {
  // Helper to capture console.error output
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("No Warnings for Cloud Models", () => {
    test("mode=claude does not show context warnings", () => {
      const stats = {
        totalTokens: 50000,
        systemTokens: 10000,
        messageTokens: 40000,
        toolTokens: 0,
        contextLimit: 200000,
        percentUsed: 25,
        exceedsLimit: false,
      };

      logContextWarning(stats, "claude");

      // No console.error calls should have been made
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("mode=openrouter does not show context warnings", () => {
      const stats = {
        totalTokens: 100000,
        systemTokens: 20000,
        messageTokens: 80000,
        toolTokens: 0,
        contextLimit: 1048576, // 1M for Gemini
        percentUsed: 10,
        exceedsLimit: false,
      };

      logContextWarning(stats, "openrouter");

      // No console.error calls should have been made
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("mode=claude does not warn even when approaching limit", () => {
      const stats = {
        totalTokens: 150000,
        systemTokens: 30000,
        messageTokens: 120000,
        toolTokens: 0,
        contextLimit: 200000,
        percentUsed: 75, // 75% usage
        exceedsLimit: false,
      };

      logContextWarning(stats, "claude");

      // Still no warnings for cloud models
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("mode=openrouter does not warn even when approaching limit", () => {
      const stats = {
        totalTokens: 200000,
        systemTokens: 40000,
        messageTokens: 160000,
        toolTokens: 0,
        contextLimit: 262144, // Qwen3 Coder
        percentUsed: 76, // 76% usage
        exceedsLimit: false,
      };

      logContextWarning(stats, "openrouter");

      // Still no warnings for cloud models
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("Warnings Still Appear for Local Models", () => {
    test("mode=lmstudio shows warnings when approaching limit", () => {
      const stats = {
        totalTokens: 25000,
        systemTokens: 5000,
        messageTokens: 20000,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 76, // Above 75% threshold
        exceedsLimit: false,
      };

      logContextWarning(stats, "lmstudio");

      // Should have shown warning
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Check that it mentions "LOCAL MODEL LIMITATION"
      const errorMessages = consoleErrorSpy.mock.calls.map((call) =>
        call.join(" ")
      );
      const hasLocalModelWarning = errorMessages.some((msg) =>
        msg.includes("LOCAL MODEL LIMITATION")
      );
      expect(hasLocalModelWarning).toBe(true);
    });

    test("mode=mlx shows warnings when approaching limit", () => {
      const stats = {
        totalTokens: 100000,
        systemTokens: 20000,
        messageTokens: 80000,
        toolTokens: 0,
        contextLimit: 131072, // 128K
        percentUsed: 76, // Above 75% threshold
        exceedsLimit: false,
      };

      logContextWarning(stats, "mlx");

      // Should have shown warning
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test("mode=lmstudio does NOT warn when well below limit", () => {
      const stats = {
        totalTokens: 10000,
        systemTokens: 2000,
        messageTokens: 8000,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 30, // Only 30% usage
        exceedsLimit: false,
      };

      logContextWarning(stats, "lmstudio");

      // Should NOT have shown warning (below threshold)
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("Warning Threshold Behavior", () => {
    test("Warning appears at exactly 75% usage for local models", () => {
      const stats = {
        totalTokens: 24576, // Exactly 75% of 32768
        systemTokens: 5000,
        messageTokens: 19576,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 75,
        exceedsLimit: false,
      };

      logContextWarning(stats, "lmstudio");

      // Should warn at 75% threshold
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test("No warning at 74% usage for local models", () => {
      const stats = {
        totalTokens: 24248, // 74% of 32768
        systemTokens: 5000,
        messageTokens: 19248,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 74,
        exceedsLimit: false,
      };

      logContextWarning(stats, "lmstudio");

      // Should NOT warn below 75% threshold
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("Undefined Mode Handling", () => {
    test("Undefined mode defaults to showing warnings (safe behavior)", () => {
      const stats = {
        totalTokens: 25000,
        systemTokens: 5000,
        messageTokens: 20000,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 76,
        exceedsLimit: false,
      };

      // Call without mode parameter
      logContextWarning(stats);

      // Should warn by default (safe behavior)
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("Regression: Issue #2 Specific Tests", () => {
    test("OpenRouter with Gemini model does not show LOCAL MODEL LIMITATION", () => {
      const stats = {
        totalTokens: 800000, // 800K tokens (would be huge for local model)
        systemTokens: 100000,
        messageTokens: 700000,
        toolTokens: 0,
        contextLimit: 1048576, // Gemini 1M context
        percentUsed: 76,
        exceedsLimit: false,
      };

      logContextWarning(stats, "openrouter");

      // No warnings at all
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("Claude mode with large context does not show LOCAL MODEL LIMITATION", () => {
      const stats = {
        totalTokens: 150000,
        systemTokens: 30000,
        messageTokens: 120000,
        toolTokens: 0,
        contextLimit: 200000, // Claude 200K context
        percentUsed: 75,
        exceedsLimit: false,
      };

      logContextWarning(stats, "claude");

      // No warnings for Claude
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("Local model still shows appropriate warnings", () => {
      const stats = {
        totalTokens: 25000,
        systemTokens: 5000,
        messageTokens: 20000,
        toolTokens: 0,
        contextLimit: 32768,
        percentUsed: 76,
        exceedsLimit: false,
      };

      logContextWarning(stats, "lmstudio");

      // Should show warning with LOCAL MODEL LIMITATION text
      expect(consoleErrorSpy).toHaveBeenCalled();

      const errorMessages = consoleErrorSpy.mock.calls.map((call) =>
        call.join(" ")
      );
      const hasLocalModelWarning = errorMessages.some(
        (msg) =>
          msg.includes("LOCAL MODEL LIMITATION") ||
          msg.includes("local models cannot")
      );

      expect(hasLocalModelWarning).toBe(true);
    });
  });
});
