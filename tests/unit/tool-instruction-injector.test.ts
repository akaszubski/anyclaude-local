/**
 * Unit tests for tool-instruction-injector.ts (Issue #35)
 *
 * Tests the tool instruction injection system that adds contextual tool hints
 * to user messages when tool usage is detected, helping local models understand
 * when to use tools.
 *
 * Components tested:
 * 1. detectToolIntent() - Pattern matching for tool intent detection
 * 2. formatToolInstruction() - Formatting instructions (explicit vs subtle)
 * 3. injectToolInstructions() - Main injection logic with confidence thresholds
 * 4. False positive prevention (e.g., "read this carefully" → no injection)
 * 5. Keyword conflict resolution (multiple tool keywords)
 * 6. Multi-tool detection (file operations + bash commands)
 * 7. Configuration options (enabled, style, threshold, maxInjectionsPerConversation)
 * 8. Debug logging integration
 * 9. Edge cases (empty messages, no tools, disabled injection)
 * 10. Security validation (privilege escalation prevention)
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  detectToolIntent,
  formatToolInstruction,
  injectToolInstructions,
  ToolInstructionConfig,
  ToolIntent,
  InjectionResult,
} from "../../src/tool-instruction-injector";

// ============================================================================
// Test Data - Tool Definitions
// ============================================================================

const READ_TOOL = {
  name: "Read",
  description: "Reads a file from the local filesystem.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The absolute path to the file to read",
      },
    },
    required: ["file_path"],
  },
};

const WRITE_TOOL = {
  name: "Write",
  description: "Writes a file to the local filesystem.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The absolute path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["file_path", "content"],
  },
};

const EDIT_TOOL = {
  name: "Edit",
  description: "Performs exact string replacements in files.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The absolute path to the file to modify",
      },
      old_string: {
        type: "string",
        description: "The exact string to replace",
      },
      new_string: {
        type: "string",
        description: "The text to replace it with",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },
};

const BASH_TOOL = {
  name: "Bash",
  description: "Executes a given bash command in a persistent shell session.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute",
      },
      description: {
        type: "string",
        description: "Clear, concise description of what this command does",
      },
    },
    required: ["command"],
  },
};

const GREP_TOOL = {
  name: "Grep",
  description: "A powerful search tool built on ripgrep",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regular expression pattern to search for",
      },
      path: {
        type: "string",
        description: "File or directory to search in",
      },
    },
    required: ["pattern"],
  },
};

const GLOB_TOOL = {
  name: "Glob",
  description: "Find files by pattern matching on file paths",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files",
      },
    },
    required: ["pattern"],
  },
};

const WEB_SEARCH_TOOL = {
  name: "WebSearch",
  description: "Search the web using current information",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      allowed_domains: {
        type: "array",
        description: "Only include results from these domains",
      },
      blocked_domains: {
        type: "array",
        description: "Exclude results from these domains",
      },
    },
    required: ["query"],
  },
};

const WEB_FETCH_TOOL = {
  name: "WebFetch",
  description: "Fetches and processes content from URLs",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Fully-formed URL",
      },
      prompt: {
        type: "string",
        description: "What to extract from the page",
      },
    },
    required: ["url", "prompt"],
  },
};

const ALL_TOOLS = [
  READ_TOOL,
  WRITE_TOOL,
  EDIT_TOOL,
  BASH_TOOL,
  GREP_TOOL,
  GLOB_TOOL,
  WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
];

// ============================================================================
// Test Data - User Messages
// ============================================================================

const MESSAGES = {
  // Read Tool Intent
  READ_EXPLICIT: "Read the file src/main.ts",
  READ_SUBTLE: "Show me what's in config.json",
  READ_QUESTION: "What does the README say?",
  READ_MULTIPLE: "Check the contents of package.json and tsconfig.json",

  // Write Tool Intent
  WRITE_CREATE: "Create a new file called test.txt with 'Hello World'",
  WRITE_SAVE: "Save this code to src/utils.ts",
  WRITE_OUTPUT: "Write the output to results.json",

  // Edit Tool Intent
  EDIT_MODIFY: "Change 'foo' to 'bar' in src/main.ts",
  EDIT_REPLACE: "Replace the old implementation with the new one",
  EDIT_UPDATE: "Update the version number in package.json",

  // Bash Tool Intent
  BASH_RUN: "Run npm install",
  BASH_EXECUTE: "Execute the build script",
  BASH_LIST: "List all files in the current directory",
  BASH_TEST: "Run the test suite with npm test",

  // Grep Tool Intent
  GREP_SEARCH: "Search for 'TODO' in the codebase",
  GREP_FIND: "Find all files containing 'import React'",
  GREP_PATTERN: "Look for function definitions matching /async.*fetch/",

  // Glob Tool Intent
  GLOB_FIND: "Find all TypeScript files",
  GLOB_LIST: "List all .json files in the config directory",
  GLOB_PATTERN: "Get all files matching *.test.ts",

  // WebSearch Tool Intent - All 11 keywords
  WEB_SEARCH_INTERNET: "Search the internet for React best practices",
  WEB_SEARCH_INTERNET_SHORT: "Search internet for TypeScript tutorials",
  WEB_SEARCH_WEB: "Search the web for latest AI news",
  WEB_SEARCH_WEB_SHORT: "Search web for Python documentation",
  WEB_LOOK_UP_ONLINE: "Look up online the current Bitcoin price",
  WEB_FIND_ONLINE: "Find online information about GraphQL",
  WEB_GOOGLE: "Google the latest Node.js version",
  WEB_SEARCH_FOR_INFO: "Search for information about Rust programming",
  WEB_LATEST: "What is the latest version of React?",
  WEB_CURRENT_NEWS: "What is the current news about AI regulation?",
  WEB_RECENT_DEVELOPMENTS:
    "Tell me about recent developments in quantum computing",

  // WebFetch Tool Intent
  WEB_FETCH_URL: "Fetch the content from https://example.com/docs",
  WEB_DOWNLOAD: "Download the page at https://github.com/repo/readme",
  WEB_GET_URL: "Get from url https://api.example.com/data",
  WEB_SCRAPE: "Scrape the documentation from https://docs.example.com",

  // False Positives - Web (should NOT trigger WebSearch)
  FALSE_WEB_RESEARCH_SHOWS:
    "Research shows that TypeScript improves code quality",
  FALSE_WEB_RESEARCH_SUGGESTS:
    "Research suggests using async/await over promises",
  FALSE_WEB_RESEARCH_INDICATES: "Research indicates that React is popular",
  FALSE_WEB_SEARCH_THIS_DOC:
    "Search this document for the configuration section",
  FALSE_WEB_SEARCH_THIS_FILE: "Search this file for the function definition",
  FALSE_WEB_SEARCH_CODE: "Search the code for all instances of 'TODO'",
  FALSE_WEB_CURRENT_DIR: "Check the current directory for package.json",
  FALSE_WEB_CURRENT_FILE: "The current file needs to be refactored",
  FALSE_WEB_CURRENT_FUNCTION: "The current function has a bug",

  // Multi-Tool Intent
  MULTI_READ_EDIT: "Read src/main.ts and change the port to 3000",
  MULTI_BASH_WRITE: "Run the build command and save the output",
  MULTI_GREP_EDIT: "Search for 'FIXME' and replace them with 'TODO'",

  // False Positives (should NOT trigger injection)
  FALSE_READ: "Please read this carefully",
  FALSE_WRITE: "I will write a detailed explanation",
  FALSE_EDIT: "Let me edit my previous statement",
  FALSE_RUN: "This code will run on the server",
  FALSE_SEARCH: "I'll search for a solution",
  FALSE_CHANGE: "The weather will change tomorrow",
  FALSE_CREATE: "We should create a plan",

  // Non-Tool Intent
  NO_TOOLS_QUESTION: "What is quantum physics?",
  NO_TOOLS_EXPLAIN: "Explain how neural networks work",
  NO_TOOLS_HELP: "Help me understand async/await in JavaScript",
  NO_TOOLS_CHAT: "Thanks for your help!",

  // Edge Cases
  EMPTY: "",
  WHITESPACE: "   \n\t  ",
  VERY_SHORT: "ok",
  AMBIGUOUS: "file test", // Could be Read or could be noun
};

// ============================================================================
// Test Suite: Tool Intent Detection
// ============================================================================

describe("Tool Intent Detection", () => {
  describe("Read tool intent", () => {
    test("should detect explicit 'read' command", () => {
      const intent = detectToolIntent(MESSAGES.READ_EXPLICIT, [READ_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Read");
      expect(intent?.confidence).toBeGreaterThan(0.8);
      expect(intent?.keywords).toContain("read");
    });

    test("should detect 'show' as read intent", () => {
      const intent = detectToolIntent(MESSAGES.READ_SUBTLE, [READ_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Read");
      expect(intent?.confidence).toBeGreaterThanOrEqual(0.6);
    });

    test("should detect question about file contents", () => {
      const intent = detectToolIntent(MESSAGES.READ_QUESTION, [READ_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Read");
    });

    test("should NOT detect 'read carefully' as Read tool", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_READ, [READ_TOOL]);
      expect(intent).toBeNull();
    });
  });

  describe("Write tool intent", () => {
    test("should detect 'create file' command", () => {
      const intent = detectToolIntent(MESSAGES.WRITE_CREATE, [WRITE_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Write");
      expect(intent?.confidence).toBeGreaterThan(0.8);
    });

    test("should detect 'save to' command", () => {
      const intent = detectToolIntent(MESSAGES.WRITE_SAVE, [WRITE_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Write");
    });

    test("should NOT detect 'I will write' as Write tool", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WRITE, [WRITE_TOOL]);
      expect(intent).toBeNull();
    });
  });

  describe("Edit tool intent", () => {
    test("should detect 'change X to Y' pattern", () => {
      const intent = detectToolIntent(MESSAGES.EDIT_MODIFY, [EDIT_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Edit");
      expect(intent?.confidence).toBeGreaterThan(0.8);
    });

    test("should detect 'replace' command", () => {
      const intent = detectToolIntent(MESSAGES.EDIT_REPLACE, [EDIT_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Edit");
    });

    test("should detect 'update' with file reference", () => {
      const intent = detectToolIntent(MESSAGES.EDIT_UPDATE, [EDIT_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Edit");
    });

    test("should NOT detect 'edit my statement' as Edit tool", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_EDIT, [EDIT_TOOL]);
      expect(intent).toBeNull();
    });
  });

  describe("Bash tool intent", () => {
    test("should detect 'run' command", () => {
      const intent = detectToolIntent(MESSAGES.BASH_RUN, [BASH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Bash");
      expect(intent?.confidence).toBeGreaterThan(0.7);
    });

    test("should detect 'execute' command", () => {
      const intent = detectToolIntent(MESSAGES.BASH_EXECUTE, [BASH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Bash");
    });

    test("should detect 'list files' as bash command", () => {
      const intent = detectToolIntent(MESSAGES.BASH_LIST, [BASH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Bash");
    });

    test("should NOT detect 'will run' as Bash tool", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_RUN, [BASH_TOOL]);
      expect(intent).toBeNull();
    });
  });

  describe("Grep tool intent", () => {
    test("should detect 'search for' pattern", () => {
      const intent = detectToolIntent(MESSAGES.GREP_SEARCH, [GREP_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Grep");
      expect(intent?.confidence).toBeGreaterThan(0.7);
    });

    test("should detect 'find containing' pattern", () => {
      const intent = detectToolIntent(MESSAGES.GREP_FIND, [GREP_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Grep");
    });

    test("should NOT detect 'search for solution' as Grep tool", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_SEARCH, [GREP_TOOL]);
      expect(intent).toBeNull();
    });
  });

  describe("Glob tool intent", () => {
    test("should detect 'find all files' pattern", () => {
      const intent = detectToolIntent(MESSAGES.GLOB_FIND, [GLOB_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Glob");
    });

    test("should detect 'list files matching' pattern", () => {
      const intent = detectToolIntent(MESSAGES.GLOB_LIST, [GLOB_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Glob");
    });

    test("should detect glob patterns (*.ext)", () => {
      const intent = detectToolIntent(MESSAGES.GLOB_PATTERN, [GLOB_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("Glob");
    });
  });

  describe("Multi-tool detection", () => {
    test("should detect primary tool when multiple intents present", () => {
      const intent = detectToolIntent(MESSAGES.MULTI_READ_EDIT, ALL_TOOLS);
      expect(intent).toBeDefined();
      // Should detect Read as primary (appears first)
      expect(["Read", "Edit"]).toContain(intent?.toolName);
    });

    test("should return highest confidence tool", () => {
      const intent = detectToolIntent(MESSAGES.MULTI_BASH_WRITE, ALL_TOOLS);
      expect(intent).toBeDefined();
      expect(intent?.confidence).toBeGreaterThan(0.6);
    });
  });

  describe("False positive prevention", () => {
    test("should reject conversational use of tool keywords", () => {
      const falsePositives = [
        MESSAGES.FALSE_READ,
        MESSAGES.FALSE_WRITE,
        MESSAGES.FALSE_EDIT,
        MESSAGES.FALSE_RUN,
        MESSAGES.FALSE_SEARCH,
        MESSAGES.FALSE_CHANGE,
        MESSAGES.FALSE_CREATE,
      ];

      falsePositives.forEach((message) => {
        const intent = detectToolIntent(message, ALL_TOOLS);
        expect(intent).toBeNull();
      });
    });

    test("should reject questions without file context", () => {
      const intent = detectToolIntent(MESSAGES.NO_TOOLS_QUESTION, ALL_TOOLS);
      expect(intent).toBeNull();
    });

    test("should reject general explanations", () => {
      const intent = detectToolIntent(MESSAGES.NO_TOOLS_EXPLAIN, ALL_TOOLS);
      expect(intent).toBeNull();
    });
  });

  describe("Edge cases", () => {
    test("should handle empty message", () => {
      const intent = detectToolIntent(MESSAGES.EMPTY, ALL_TOOLS);
      expect(intent).toBeNull();
    });

    test("should handle whitespace-only message", () => {
      const intent = detectToolIntent(MESSAGES.WHITESPACE, ALL_TOOLS);
      expect(intent).toBeNull();
    });

    test("should handle very short message", () => {
      const intent = detectToolIntent(MESSAGES.VERY_SHORT, ALL_TOOLS);
      expect(intent).toBeNull();
    });

    test("should handle empty tools array", () => {
      const intent = detectToolIntent(MESSAGES.READ_EXPLICIT, []);
      expect(intent).toBeNull();
    });
  });
});

// ============================================================================
// Test Suite: Tool Instruction Formatting
// ============================================================================

describe("Tool Instruction Formatting", () => {
  describe("Explicit style", () => {
    test("should format Read tool instruction explicitly", () => {
      const instruction = formatToolInstruction(READ_TOOL, "explicit");
      expect(instruction).toContain("Read");
      expect(instruction).toContain("file_path");
      expect(instruction).toMatch(/tool|function/i);
    });

    test("should format Write tool instruction explicitly", () => {
      const instruction = formatToolInstruction(WRITE_TOOL, "explicit");
      expect(instruction).toContain("Write");
      expect(instruction).toContain("file_path");
      expect(instruction).toContain("content");
    });

    test("should include all required parameters", () => {
      const instruction = formatToolInstruction(EDIT_TOOL, "explicit");
      expect(instruction).toContain("file_path");
      expect(instruction).toContain("old_string");
      expect(instruction).toContain("new_string");
    });

    test("should be clear and directive", () => {
      const instruction = formatToolInstruction(BASH_TOOL, "explicit");
      expect(instruction.length).toBeGreaterThan(20);
      expect(instruction).toMatch(/use|call|invoke/i);
    });
  });

  describe("Subtle style", () => {
    test("should format Read tool instruction subtly", () => {
      const instruction = formatToolInstruction(READ_TOOL, "subtle");
      expect(instruction).toContain("Read");
      expect(instruction.length).toBeLessThan(100); // Shorter than explicit
      expect(instruction).not.toMatch(/you must|required/i); // Less forceful
    });

    test("should format Write tool instruction subtly", () => {
      const instruction = formatToolInstruction(WRITE_TOOL, "subtle");
      expect(instruction).toContain("Write");
      expect(instruction.length).toBeLessThan(100);
    });

    test("should be suggestive, not directive", () => {
      const instruction = formatToolInstruction(GREP_TOOL, "subtle");
      expect(instruction).toMatch(/available|can|might/i);
    });

    test("should be shorter than explicit style", () => {
      const explicit = formatToolInstruction(EDIT_TOOL, "explicit");
      const subtle = formatToolInstruction(EDIT_TOOL, "subtle");
      expect(subtle.length).toBeLessThan(explicit.length);
    });
  });

  describe("Edge cases", () => {
    test("should handle tool with no required parameters", () => {
      const minimalTool = {
        name: "Test",
        description: "Test tool",
        input_schema: {
          type: "object",
          properties: {},
        },
      };
      const instruction = formatToolInstruction(minimalTool, "explicit");
      expect(instruction).toContain("Test");
    });

    test("should default to explicit if style is invalid", () => {
      // @ts-expect-error - Testing invalid input
      const instruction = formatToolInstruction(READ_TOOL, "invalid");
      expect(instruction).toContain("Read");
      expect(instruction.length).toBeGreaterThan(20);
    });
  });
});

// ============================================================================
// Test Suite: Main Injection Logic
// ============================================================================

describe("Tool Instruction Injection", () => {
  const defaultConfig: ToolInstructionConfig = {
    enabled: true,
    style: "explicit",
    confidenceThreshold: 0.7,
    maxInjectionsPerConversation: 10,
  };

  describe("Basic injection", () => {
    test("should inject instruction for Read intent", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("Read");
      expect(result.modifiedMessage).toContain(MESSAGES.READ_EXPLICIT);
      expect(result.modifiedMessage).toContain("Read");
      expect(result.modifiedMessage.length).toBeGreaterThan(
        MESSAGES.READ_EXPLICIT.length
      );
    });

    test("should inject instruction for Write intent", () => {
      const result = injectToolInstructions(
        MESSAGES.WRITE_CREATE,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("Write");
    });

    test("should inject instruction for Edit intent", () => {
      const result = injectToolInstructions(
        MESSAGES.EDIT_MODIFY,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("Edit");
    });

    test("should inject instruction for Bash intent", () => {
      const result = injectToolInstructions(
        MESSAGES.BASH_RUN,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("Bash");
    });

    test("should NOT inject for non-tool messages", () => {
      const result = injectToolInstructions(
        MESSAGES.NO_TOOLS_QUESTION,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(false);
      expect(result.injectedTool).toBeUndefined();
      expect(result.modifiedMessage).toBe(MESSAGES.NO_TOOLS_QUESTION);
    });
  });

  describe("Configuration options", () => {
    test("should NOT inject when disabled", () => {
      const config = { ...defaultConfig, enabled: false };
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        config
      );

      expect(result.modified).toBe(false);
      expect(result.modifiedMessage).toBe(MESSAGES.READ_EXPLICIT);
    });

    test("should respect confidence threshold", () => {
      const config = { ...defaultConfig, confidenceThreshold: 0.95 }; // Very high
      const result = injectToolInstructions(
        MESSAGES.READ_SUBTLE, // Lower confidence
        ALL_TOOLS,
        config
      );

      // Should not inject because confidence too low
      expect(result.modified).toBe(false);
    });

    test("should use subtle style when configured", () => {
      const config = { ...defaultConfig, style: "subtle" as const };
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        config
      );

      expect(result.modified).toBe(true);
      // Subtle style should be shorter
      const explicitResult = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig
      );
      expect(result.modifiedMessage.length).toBeLessThan(
        explicitResult.modifiedMessage.length
      );
    });
  });

  describe("Injection tracking", () => {
    test("should track injection count", () => {
      const config = { ...defaultConfig };
      let injectionCount = 0;

      // Simulate multiple messages
      const messages = [
        MESSAGES.READ_EXPLICIT,
        MESSAGES.WRITE_CREATE,
        MESSAGES.EDIT_MODIFY,
        MESSAGES.BASH_RUN,
        MESSAGES.GREP_SEARCH,
      ];

      messages.forEach((msg) => {
        const result = injectToolInstructions(msg, ALL_TOOLS, config);
        if (result.modified) {
          injectionCount++;
        }
      });

      expect(injectionCount).toBeGreaterThan(0);
      expect(injectionCount).toBeLessThanOrEqual(
        config.maxInjectionsPerConversation
      );
    });

    test("should stop injecting after max reached", () => {
      const config = { ...defaultConfig, maxInjectionsPerConversation: 2 };
      const results = [];

      // Try 5 injections, but max is 2
      for (let i = 0; i < 5; i++) {
        const result = injectToolInstructions(
          MESSAGES.READ_EXPLICIT,
          ALL_TOOLS,
          config,
          i // Pass current count
        );
        results.push(result);
      }

      const modifiedCount = results.filter((r) => r.modified).length;
      expect(modifiedCount).toBeLessThanOrEqual(2);
    });

    test("should include injectionCount in result", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig,
        5 // Current count
      );

      expect(result.injectionCount).toBeDefined();
      expect(typeof result.injectionCount).toBe("number");
    });
  });

  describe("False positive prevention", () => {
    test("should NOT inject for 'read carefully'", () => {
      const result = injectToolInstructions(
        MESSAGES.FALSE_READ,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(false);
    });

    test("should NOT inject for conversational tool keywords", () => {
      const falsePositives = [
        MESSAGES.FALSE_WRITE,
        MESSAGES.FALSE_EDIT,
        MESSAGES.FALSE_RUN,
        MESSAGES.FALSE_SEARCH,
      ];

      falsePositives.forEach((msg) => {
        const result = injectToolInstructions(msg, ALL_TOOLS, defaultConfig);
        expect(result.modified).toBe(false);
      });
    });
  });

  describe("Edge cases", () => {
    test("should handle empty message", () => {
      const result = injectToolInstructions(
        MESSAGES.EMPTY,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.modified).toBe(false);
      expect(result.modifiedMessage).toBe(MESSAGES.EMPTY);
    });

    test("should handle empty tools array", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        [],
        defaultConfig
      );

      expect(result.modified).toBe(false);
    });

    test("should handle undefined config (use defaults)", () => {
      // @ts-expect-error - Testing undefined input
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        undefined
      );

      // Should still work with defaults
      expect(result).toBeDefined();
      expect(result.modifiedMessage).toBe(MESSAGES.READ_EXPLICIT);
    });

    test("should preserve original message structure", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig
      );

      // Original message should be preserved (at start or end)
      expect(result.modifiedMessage).toContain(MESSAGES.READ_EXPLICIT);
    });
  });

  describe("Debug information", () => {
    test("should include debug info in result", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.debug).toBeDefined();
      expect(result.debug?.confidence).toBeGreaterThan(0);
      expect(result.debug?.keywords).toBeDefined();
    });

    test("should track which keywords triggered detection", () => {
      const result = injectToolInstructions(
        MESSAGES.READ_EXPLICIT,
        ALL_TOOLS,
        defaultConfig
      );

      expect(result.debug?.keywords).toContain("read");
    });
  });
});

// ============================================================================
// Test Suite: Keyword Conflict Resolution
// ============================================================================

describe("Keyword Conflict Resolution", () => {
  test("should choose most confident tool when keywords overlap", () => {
    // "search files" could be Grep or Glob
    const message = "Search for all TypeScript files";
    const result = injectToolInstructions(message, ALL_TOOLS, {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.5,
      maxInjectionsPerConversation: 10,
    });

    expect(result.modified).toBe(true);
    // Should choose based on confidence
    expect(["Grep", "Glob"]).toContain(result.injectedTool);
  });

  test("should prioritize tool with file pattern indicator", () => {
    // "*.ts" pattern suggests Glob over Grep
    const message = "Find all *.ts files";
    const result = injectToolInstructions(message, ALL_TOOLS, {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.5,
      maxInjectionsPerConversation: 10,
    });

    expect(result.injectedTool).toBe("Glob");
  });

  test("should prioritize tool with content search indicator", () => {
    // "containing" suggests Grep over Glob
    const message = "Find files containing 'TODO'";
    const result = injectToolInstructions(message, ALL_TOOLS, {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.5,
      maxInjectionsPerConversation: 10,
    });

    expect(result.injectedTool).toBe("Grep");
  });
});

// ============================================================================
// Test Suite: WebSearch/WebFetch Tool Intent Detection
// ============================================================================

describe("WebSearch/WebFetch Tool Intent Detection", () => {
  describe("WebSearch - All 11 Keywords", () => {
    test("should detect 'search the internet' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SEARCH_INTERNET, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("search the internet");
    });

    test("should detect 'search internet' keyword (short form)", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SEARCH_INTERNET_SHORT, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("search internet");
    });

    test("should detect 'search the web' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SEARCH_WEB, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("search the web");
    });

    test("should detect 'search web' keyword (short form)", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SEARCH_WEB_SHORT, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("search web");
    });

    test("should detect 'look up online' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_LOOK_UP_ONLINE, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("look up online");
    });

    test("should detect 'find online' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_FIND_ONLINE, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("find online");
    });

    test("should detect 'google' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_GOOGLE, [WEB_SEARCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.6);
      expect(intent?.matchedKeywords).toContain("google");
    });

    test("should detect 'search for information' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SEARCH_FOR_INFO, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("search for information");
    });

    test("should detect 'what is the latest' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_LATEST, [WEB_SEARCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("what is the latest");
    });

    test("should detect 'current news' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_CURRENT_NEWS, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("current news");
    });

    test("should detect 'recent developments' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_RECENT_DEVELOPMENTS, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
      expect(intent?.matchedKeywords).toContain("recent developments");
    });

    test("should detect keywords case-insensitively", () => {
      const intent = detectToolIntent("SEARCH THE INTERNET for React", [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
    });

    test("should use word boundaries (not match partial words)", () => {
      // "research" should NOT trigger "search"
      const intent = detectToolIntent("I will research the topic thoroughly", [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });
  });

  describe("WebSearch - False Positive Prevention", () => {
    test("should NOT detect 'research shows' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_RESEARCH_SHOWS, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'research suggests' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_RESEARCH_SUGGESTS, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'research indicates' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_RESEARCH_INDICATES, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'search this document' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_SEARCH_THIS_DOC, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'search this file' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_SEARCH_THIS_FILE, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'search the code' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_SEARCH_CODE, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'current directory' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_CURRENT_DIR, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'current file' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_CURRENT_FILE, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT detect 'current function' as WebSearch", () => {
      const intent = detectToolIntent(MESSAGES.FALSE_WEB_CURRENT_FUNCTION, [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should differentiate between Grep (code search) and WebSearch (internet search)", () => {
      const grepMessage = "Search for TODO in the codebase";
      const webMessage = "Search the internet for TODO list apps";

      const grepIntent = detectToolIntent(grepMessage, [
        GREP_TOOL,
        WEB_SEARCH_TOOL,
      ]);
      const webIntent = detectToolIntent(webMessage, [
        GREP_TOOL,
        WEB_SEARCH_TOOL,
      ]);

      // Grep should be detected for codebase search
      expect(grepIntent?.toolName).toBe("Grep");

      // WebSearch should be detected for internet search
      expect(webIntent?.toolName).toBe("WebSearch");
    });
  });

  describe("WebFetch Tool Intent", () => {
    test("should detect 'fetch' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_FETCH_URL, [WEB_FETCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebFetch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
    });

    test("should detect 'download' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_DOWNLOAD, [WEB_FETCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebFetch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
    });

    test("should detect 'get from url' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_GET_URL, [WEB_FETCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebFetch");
      expect(intent?.confidence).toBeGreaterThan(0.7);
    });

    test("should detect 'scrape' keyword", () => {
      const intent = detectToolIntent(MESSAGES.WEB_SCRAPE, [WEB_FETCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebFetch");
      expect(intent?.confidence).toBeGreaterThan(0.6);
    });

    test("should detect URL patterns as WebFetch indicator", () => {
      const intent = detectToolIntent(
        "Get the data from https://api.example.com",
        [WEB_FETCH_TOOL]
      );
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebFetch");
    });
  });

  describe("WebSearch/WebFetch Injection", () => {
    const defaultConfig: ToolInstructionConfig = {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.7,
      maxInjectionsPerConversation: 10,
    };

    test("should inject WebSearch instruction for internet search intent", () => {
      const result = injectToolInstructions(
        MESSAGES.WEB_SEARCH_INTERNET,
        [WEB_SEARCH_TOOL],
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("WebSearch");
      expect(result.modifiedMessage).toContain(MESSAGES.WEB_SEARCH_INTERNET);
      expect(result.modifiedMessage).toContain("WebSearch");
    });

    test("should inject WebFetch instruction for URL fetch intent", () => {
      const result = injectToolInstructions(
        MESSAGES.WEB_FETCH_URL,
        [WEB_FETCH_TOOL],
        defaultConfig
      );

      expect(result.modified).toBe(true);
      expect(result.injectedTool).toBe("WebFetch");
      expect(result.modifiedMessage).toContain("WebFetch");
    });

    test("should NOT inject for false positives", () => {
      const falsePositives = [
        MESSAGES.FALSE_WEB_RESEARCH_SHOWS,
        MESSAGES.FALSE_WEB_SEARCH_THIS_DOC,
        MESSAGES.FALSE_WEB_CURRENT_DIR,
      ];

      falsePositives.forEach((message) => {
        const result = injectToolInstructions(
          message,
          [WEB_SEARCH_TOOL],
          defaultConfig
        );
        expect(result.modified).toBe(false);
      });
    });

    test("should prioritize WebSearch over Grep when internet intent is clear", () => {
      const message = "Search the internet for React documentation";
      const result = injectToolInstructions(
        message,
        [GREP_TOOL, WEB_SEARCH_TOOL],
        defaultConfig
      );

      expect(result.injectedTool).toBe("WebSearch");
    });

    test("should include all 11 keywords in instruction matching", () => {
      const webSearchMessages = [
        MESSAGES.WEB_SEARCH_INTERNET,
        MESSAGES.WEB_SEARCH_WEB,
        MESSAGES.WEB_LOOK_UP_ONLINE,
        MESSAGES.WEB_FIND_ONLINE,
        MESSAGES.WEB_GOOGLE,
        MESSAGES.WEB_SEARCH_FOR_INFO,
        MESSAGES.WEB_LATEST,
        MESSAGES.WEB_CURRENT_NEWS,
        MESSAGES.WEB_RECENT_DEVELOPMENTS,
      ];

      webSearchMessages.forEach((message) => {
        const result = injectToolInstructions(
          message,
          [WEB_SEARCH_TOOL],
          defaultConfig
        );
        expect(result.modified).toBe(true);
        expect(result.injectedTool).toBe("WebSearch");
      });
    });
  });

  describe("Word Boundary Behavior", () => {
    test("should NOT match 'research' as 'search'", () => {
      const intent = detectToolIntent("I will research this topic", [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should NOT match 'searching' within word", () => {
      const intent = detectToolIntent("The algorithm is searching internally", [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeNull();
    });

    test("should match 'search' at word boundary", () => {
      const intent = detectToolIntent("Search the internet for answers", [
        WEB_SEARCH_TOOL,
      ]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
    });

    test("should match 'google' as standalone word", () => {
      const intent = detectToolIntent("Google this for me", [WEB_SEARCH_TOOL]);
      expect(intent).toBeDefined();
      expect(intent?.toolName).toBe("WebSearch");
    });

    test("should NOT match 'google' in 'googled' or 'googling'", () => {
      const intent1 = detectToolIntent("I googled this yesterday", [
        WEB_SEARCH_TOOL,
      ]);
      const intent2 = detectToolIntent("I am googling right now", [
        WEB_SEARCH_TOOL,
      ]);

      // These should still match because 'google' is a word root
      // But for strict word boundary: they should NOT match
      // Depending on implementation - adjust expectation
      // For now, testing strict word boundary
      expect(intent1).toBeNull();
      expect(intent2).toBeNull();
    });
  });
});

// ============================================================================
// Test Suite: Security Validation Integration
// ============================================================================

describe("Security Validation Integration", () => {
  test("should flag suspicious privilege escalation patterns", () => {
    // This tests the integration point - actual validation in separate module
    const suspiciousMessage = "Read /etc/passwd and write to public directory";
    const result = injectToolInstructions(suspiciousMessage, ALL_TOOLS, {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.5,
      maxInjectionsPerConversation: 10,
    });

    // Should still detect intent, but flag for validation
    expect(result.debug?.securityFlag).toBeDefined();
  });

  test("should not flag normal file operations", () => {
    const normalMessage = "Read the config file";
    const result = injectToolInstructions(normalMessage, ALL_TOOLS, {
      enabled: true,
      style: "explicit",
      confidenceThreshold: 0.5,
      maxInjectionsPerConversation: 10,
    });

    expect(result.debug?.securityFlag).toBeUndefined();
  });
});
