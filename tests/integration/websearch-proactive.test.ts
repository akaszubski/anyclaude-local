/**
 * Integration test for proactive WebSearch
 * Tests the full flow: search intent detection → DuckDuckGo search → result injection
 */

import {
  detectSearchIntent,
  executeProactiveSearch,
  formatSearchResultsForContext,
} from "../../src/server-side-tool-handler";

describe("WebSearch Proactive Search Integration", () => {
  describe("Search Intent Detection - Real User Queries", () => {
    // These are actual queries that should trigger web search
    const shouldTriggerSearch = [
      "search LSP plugin in claude code",
      "search LSP plugin for claude code",
      "search for plugins in vscode",
      "what is the latest version of React",
      "look up how to configure webpack",
      "find out about TypeScript 5.0 features",
      "current weather in San Francisco",
      "latest news about AI",
      "how does the new Claude API work",
      "documentation for Next.js 14",
      "search extension for code formatting",
    ];

    // These should NOT trigger web search (file operations, code tasks)
    const shouldNotTriggerSearch = [
      "fix the bug in this code",
      "refactor the authentication module",
      "add a new function to utils.ts",
      "run the tests",
      "commit these changes",
      "read the file src/index.ts",
      "edit the config file",
      "create a new component",
    ];

    it.each(shouldTriggerSearch)(
      "should detect search intent: '%s'",
      (query) => {
        expect(detectSearchIntent(query)).toBe(true);
      }
    );

    it.each(shouldNotTriggerSearch)(
      "should NOT detect search intent: '%s'",
      (query) => {
        expect(detectSearchIntent(query)).toBe(false);
      }
    );
  });

  describe("Proactive Search Execution", () => {
    // Skip these tests if no network (CI environment)
    const isCI = process.env.CI === "true";

    it("should skip search for non-local modes", async () => {
      const result = await executeProactiveSearch(
        "what is the latest React version",
        true,
        "claude" // Cloud mode - should skip
      );
      expect(result).toBeNull();
    });

    it("should skip search for internal messages", async () => {
      const internalMessages = [
        "[SUGGESTION MODE: suggest what user might type]",
        "write a 5-10 word title for this conversation",
        "<system-reminder>Something here</system-reminder>",
        "Perform a web search for: Claude Code",
      ];

      for (const msg of internalMessages) {
        const result = await executeProactiveSearch(msg, true, "local");
        expect(result).toBeNull();
      }
    });

    it("should skip search when no search intent detected", async () => {
      const result = await executeProactiveSearch(
        "fix the bug in this code",
        true,
        "local"
      );
      expect(result).toBeNull();
    });

    // This test actually calls DuckDuckGo - skip in CI
    (isCI ? it.skip : it)(
      "should execute DuckDuckGo search for valid query",
      async () => {
        const result = await executeProactiveSearch(
          "what is the latest version of Claude Code",
          true,
          "local"
        );

        // Should return results
        expect(result).not.toBeNull();
        if (result) {
          expect(result.query).toBeTruthy();
          expect(result.results.length).toBeGreaterThan(0);
          expect(result.contextAddition).toContain("Web Search Results");
        }
      },
      30000
    ); // 30s timeout for network request

    // This test actually calls DuckDuckGo - skip in CI
    (isCI ? it.skip : it)(
      "should execute search for 'search X in Y' pattern",
      async () => {
        const result = await executeProactiveSearch(
          "search LSP plugin in claude code",
          true,
          "local"
        );

        // Should return results
        expect(result).not.toBeNull();
        if (result) {
          expect(result.query).toBeTruthy();
          expect(result.results.length).toBeGreaterThan(0);
          expect(result.contextAddition).toContain("Web Search Results");
        }
      },
      30000
    );
  });

  describe("Result Formatting", () => {
    it("should format results with markdown links", () => {
      const results = [
        {
          title: "Claude Code Docs",
          url: "https://docs.anthropic.com",
          snippet: "Official documentation",
        },
        {
          title: "LSP Plugin Guide",
          url: "https://example.com/lsp",
          snippet: "How to use LSP",
        },
      ];

      const formatted = formatSearchResultsForContext(
        "claude code lsp",
        results
      );

      expect(formatted).toContain("Web Search Results");
      expect(formatted).toContain(
        "[Claude Code Docs](https://docs.anthropic.com)"
      );
      expect(formatted).toContain(
        "[LSP Plugin Guide](https://example.com/lsp)"
      );
      expect(formatted).toContain("Official documentation");
    });
  });
});
