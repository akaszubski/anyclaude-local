/**
 * Tests for server-side tool handler
 */

import {
  isServerSideTool,
  isWebSearchTool,
  isWebSearchToolCall,
  filterServerSideTools,
  detectSearchIntent,
  extractSearchQuery,
  formatSearchResultsForContext,
} from "../../src/server-side-tool-handler";

describe("server-side-tool-handler", () => {
  describe("isServerSideTool", () => {
    it("should detect web_search server-side tool by type", () => {
      const webSearchTool = {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      };
      expect(isServerSideTool(webSearchTool)).toBe(true);
    });

    it("should detect WebSearch tool by name (Claude Code format)", () => {
      // Claude Code may send WebSearch as a regular tool without type field
      expect(isServerSideTool({ name: "WebSearch" })).toBe(true);
      expect(isServerSideTool({ name: "web_search" })).toBe(true);
      expect(isServerSideTool({ name: "websearch" })).toBe(true);
    });

    it("should be case-insensitive for name detection", () => {
      expect(isServerSideTool({ name: "WEBSEARCH" })).toBe(true);
      expect(isServerSideTool({ name: "WebSearch" })).toBe(true);
      expect(isServerSideTool({ name: "websearch" })).toBe(true);
    });

    it("should not detect regular tools as server-side", () => {
      const regularTool = {
        name: "Bash",
        description: "Execute shell commands",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
        },
      };
      expect(isServerSideTool(regularTool)).toBe(false);
    });

    it("should not detect tools with similar names as WebSearch", () => {
      expect(isServerSideTool({ name: "WebSearchHelper" })).toBe(false);
      expect(isServerSideTool({ name: "search" })).toBe(false);
      expect(isServerSideTool({ name: "GoogleSearch" })).toBe(false);
    });
  });

  describe("isWebSearchTool", () => {
    it("should detect web_search tool by type", () => {
      expect(isWebSearchTool({ type: "web_search_20250305" })).toBe(true);
    });

    it("should detect WebSearch tool by name", () => {
      expect(isWebSearchTool({ name: "WebSearch" })).toBe(true);
      expect(isWebSearchTool({ name: "web_search" })).toBe(true);
      expect(isWebSearchTool({ name: "websearch" })).toBe(true);
    });

    it("should not detect other server-side tools", () => {
      expect(isWebSearchTool({ type: "other_tool_20250305" })).toBe(false);
    });

    it("should not detect regular tools", () => {
      expect(isWebSearchTool({ name: "Read" })).toBe(false);
      expect(isWebSearchTool({ name: "Bash" })).toBe(false);
    });
  });

  describe("isWebSearchToolCall", () => {
    it("should detect WebSearch tool call names", () => {
      expect(isWebSearchToolCall("WebSearch")).toBe(true);
      expect(isWebSearchToolCall("web_search")).toBe(true);
      expect(isWebSearchToolCall("websearch")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(isWebSearchToolCall("WEBSEARCH")).toBe(true);
      expect(isWebSearchToolCall("WebSearch")).toBe(true);
      expect(isWebSearchToolCall("websearch")).toBe(true);
    });

    it("should not detect regular tool names", () => {
      expect(isWebSearchToolCall("Read")).toBe(false);
      expect(isWebSearchToolCall("Bash")).toBe(false);
      expect(isWebSearchToolCall("Write")).toBe(false);
      expect(isWebSearchToolCall("Glob")).toBe(false);
    });

    it("should not detect tools with similar names", () => {
      expect(isWebSearchToolCall("WebSearchHelper")).toBe(false);
      expect(isWebSearchToolCall("search")).toBe(false);
      expect(isWebSearchToolCall("GoogleSearch")).toBe(false);
    });
  });

  describe("filterServerSideTools", () => {
    it("should separate server-side tools from regular tools by type", () => {
      const tools = [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
        {
          name: "Bash",
          description: "Execute shell commands",
          input_schema: {
            type: "object",
            properties: {
              command: { type: "string" },
            },
          },
        },
        {
          name: "Read",
          description: "Read a file",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
          },
        },
      ];

      const { regularTools, serverTools, hasWebSearch } =
        filterServerSideTools(tools);

      expect(regularTools.length).toBe(2);
      expect(serverTools.length).toBe(1);
      expect(hasWebSearch).toBe(true);
      expect(regularTools.map((t: any) => t.name)).toEqual(["Bash", "Read"]);
    });

    it("should filter WebSearch by name (Claude Code format)", () => {
      // Claude Code may send WebSearch as a regular tool without type field
      const tools = [
        {
          name: "WebSearch",
          description: "Search the web",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
        {
          name: "Bash",
          description: "Execute shell commands",
          input_schema: {
            type: "object",
            properties: {
              command: { type: "string" },
            },
          },
        },
      ];

      const { regularTools, serverTools, hasWebSearch } =
        filterServerSideTools(tools);

      expect(regularTools.length).toBe(1);
      expect(serverTools.length).toBe(1);
      expect(hasWebSearch).toBe(true);
      expect(regularTools.map((t: any) => t.name)).toEqual(["Bash"]);
      expect(serverTools.map((t: any) => t.name)).toEqual(["WebSearch"]);
    });

    it("should return empty arrays for empty input", () => {
      const { regularTools, serverTools, hasWebSearch } = filterServerSideTools(
        []
      );
      expect(regularTools).toEqual([]);
      expect(serverTools).toEqual([]);
      expect(hasWebSearch).toBe(false);
    });
  });

  describe("detectSearchIntent", () => {
    it("should detect time-sensitive queries", () => {
      expect(detectSearchIntent("What is the current weather?")).toBe(true);
      expect(detectSearchIntent("latest Claude features 2025")).toBe(true);
      expect(detectSearchIntent("recent news about AI")).toBe(true);
    });

    it("should detect explicit search requests", () => {
      // Note: Plain "search" is NOT matched because it could mean file search in Claude Code
      // We only match explicit web search patterns or "look up" / "find out" keywords
      expect(
        detectSearchIntent("web search for TypeScript best practices")
      ).toBe(true);
      expect(detectSearchIntent("look up Node.js documentation")).toBe(true);
    });

    it("should detect 'search X in/for Y' patterns (Issue #47 fix)", () => {
      // "search X in Y" and "search X for Y" are clearly web search, not file search
      expect(detectSearchIntent("search LSP plugin in claude code")).toBe(true);
      expect(detectSearchIntent("search LSP plugin for claude code")).toBe(
        true
      );
      expect(detectSearchIntent("search for plugins in vscode")).toBe(true);
      expect(detectSearchIntent("search authentication in next.js")).toBe(true);
      expect(detectSearchIntent("search extensions for vscode")).toBe(true);
    });

    it("should detect search for external tools/products", () => {
      expect(detectSearchIntent("search for plugin")).toBe(true);
      expect(detectSearchIntent("search plugin support")).toBe(true);
      expect(detectSearchIntent("search extension marketplace")).toBe(true);
      expect(detectSearchIntent("search for api documentation")).toBe(true);
    });

    it("should detect weather/price queries", () => {
      expect(detectSearchIntent("What is the weather in NYC?")).toBe(true);
      expect(detectSearchIntent("current stock price of AAPL")).toBe(true);
    });

    it("should not detect non-search queries", () => {
      expect(detectSearchIntent("Write a function to sort an array")).toBe(
        false
      );
      expect(detectSearchIntent("Fix the bug in this code")).toBe(false);
    });
  });

  describe("extractSearchQuery", () => {
    it("should clean up the query", () => {
      expect(extractSearchQuery("please search for Claude documentation")).toBe(
        "search for Claude documentation"
      );
      expect(extractSearchQuery("can you find latest AI news?")).toBe(
        "find latest AI news"
      );
    });

    it("should limit query length", () => {
      const longQuery = "a".repeat(300);
      expect(extractSearchQuery(longQuery).length).toBeLessThanOrEqual(200);
    });
  });

  describe("formatSearchResultsForContext", () => {
    it("should format search results nicely", () => {
      const results = [
        {
          title: "Result 1",
          url: "https://example.com/1",
          snippet: "First result",
        },
        {
          title: "Result 2",
          url: "https://example.com/2",
          snippet: "Second result",
        },
      ];

      const formatted = formatSearchResultsForContext("test query", results);

      expect(formatted).toContain("Web Search Results");
      expect(formatted).toContain("test query");
      expect(formatted).toContain("[Result 1]");
      expect(formatted).toContain("https://example.com/1");
      expect(formatted).toContain("First result");
    });

    it("should return empty string for no results", () => {
      const formatted = formatSearchResultsForContext("test", []);
      expect(formatted).toBe("");
    });
  });
});
