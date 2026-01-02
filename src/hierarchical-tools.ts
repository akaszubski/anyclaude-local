/**
 * Hierarchical Tool Documentation System
 *
 * Organizes Claude Code tools into categories with shared documentation
 * to eliminate redundant tool descriptions and reduce token count.
 *
 * Strategy:
 * 1. Group tools by functional category (File Ops, Execution, Web, etc.)
 * 2. Extract common documentation at category level
 * 3. Store only tool-specific deltas per tool
 * 4. Dynamically build documentation based on needed categories
 *
 * Expected Gain: 45% cumulative reduction (15k → 10k tokens)
 */

import { debug } from "./debug";

/**
 * Tool category definition
 */
export interface ToolCategory {
  id: string;
  name: string;
  commonDocs: string;
  tools: ToolDefinition[];
}

/**
 * Tool definition with delta documentation
 */
export interface ToolDefinition {
  name: string;
  deltaDocs: string; // Only tool-specific info, not category duplicates
  keywords: string[]; // For prediction
}

/**
 * Complete tool documentation (expanded)
 */
export interface ExpandedToolDocs {
  toolName: string;
  fullDocs: string;
}

/**
 * Claude Code Tool Categories
 *
 * Based on analysis of actual Claude Code system prompt structure
 */
export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  fileOps: {
    id: "fileOps",
    name: "File Operations",
    commonDocs: `
All file operation tools work with the local filesystem. Common behaviors:

**Path Requirements:**
- All file paths MUST be absolute paths (e.g., /Users/name/file.txt)
- NEVER use relative paths (e.g., ./file.txt or ../dir/file)
- The file_path parameter is required for all file operations

**Multiple Tool Usage:**
- You can call multiple tools in a single response for parallel operations
- When multiple independent pieces of information are requested, run multiple tool calls in parallel

**Error Handling:**
- Tools will return errors if files don't exist (Read, Edit)
- Tools will overwrite existing files without warning (Write)
- Always check file existence before operations when necessary
    `.trim(),
    tools: [
      {
        name: "Read",
        deltaDocs: `
**Purpose:** Reads file contents from the filesystem

**Unique Features:**
- Supports reading partial files with offset/limit parameters
- Can read images, PDFs, and Jupyter notebooks
- Results returned with cat -n format (line numbers starting at 1)
- Lines longer than 2000 characters are truncated

**Parameters:**
- file_path: absolute path (required)
- offset: line number to start from (optional, for large files)
- limit: number of lines to read (optional, for large files)

**When to use:** Reading code, configuration, documentation, or data files
        `.trim(),
        keywords: [
          "read",
          "show",
          "display",
          "view",
          "check",
          "examine",
          "contents",
          "cat",
          "see",
          "look at",
        ],
      },
      {
        name: "Write",
        deltaDocs: `
**Purpose:** Creates new files or overwrites existing files

**Unique Features:**
- MUST use Read tool first if modifying an existing file
- Will fail if you haven't read the file in this conversation
- NEVER use for existing files - use Edit instead

**Parameters:**
- file_path: absolute path (required)
- content: full file content (required)

**When to use:** Creating new files, not modifying existing ones
        `.trim(),
        keywords: ["write", "create", "new file", "save", "generate"],
      },
      {
        name: "Edit",
        deltaDocs: `
**Purpose:** Performs exact string replacements in files

**Unique Features:**
- MUST use Read tool first to see current content
- Performs exact string matching (preserves indentation exactly)
- Can replace all occurrences with replace_all parameter
- Will fail if old_string is not unique (use larger context or replace_all)

**Parameters:**
- file_path: absolute path (required)
- old_string: exact text to replace (required)
- new_string: replacement text (required)
- replace_all: replace all occurrences (optional, default false)

**When to use:** Modifying existing files, renaming variables, fixing bugs
        `.trim(),
        keywords: [
          "edit",
          "modify",
          "change",
          "update",
          "fix",
          "replace",
          "refactor",
        ],
      },
      {
        name: "Glob",
        deltaDocs: `
**Purpose:** Fast file pattern matching using glob syntax

**Unique Features:**
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Works with any codebase size

**Parameters:**
- pattern: glob pattern (required, e.g., "*.ts", "src/**/*.js")
- path: directory to search (optional, defaults to current working directory)

**When to use:** Finding files by name patterns, listing files in directories
        `.trim(),
        keywords: ["glob", "list files", "find files", "*."],
      },
      {
        name: "Grep",
        deltaDocs: `
**Purpose:** Powerful search tool built on ripgrep

**Unique Features:**
- Supports full regex syntax (e.g., "log.*Error", "function\\\\s+\\\\w+")
- Multiple output modes: content, files_with_matches, count
- Can show context lines with -A/-B/-C parameters
- Filter by file type or glob pattern

**Parameters:**
- pattern: regex pattern (required)
- path: file or directory to search (optional, defaults to pwd)
- glob: glob pattern to filter files (optional)
- output_mode: "content" | "files_with_matches" | "count" (optional)
- -A/-B/-C: context lines after/before/both (optional)

**When to use:** Searching for code patterns, finding text in files
        `.trim(),
        keywords: ["grep", "search", "find", "look for", "where"],
      },
    ],
  },

  execution: {
    id: "execution",
    name: "Execution & Shell",
    commonDocs: `
Execution tools run commands in a persistent shell session. Common behaviors:

**Shell Session:**
- Commands run in a persistent bash session (state maintained)
- Can use '&&' to chain commands sequentially
- Can use '&' or run_in_background for parallel execution

**Command Quoting:**
- ALWAYS quote paths with spaces: cd "path with spaces/file.txt"
- Use double quotes for file paths, not single quotes

**Timeouts:**
- Default timeout: 120000ms (2 minutes)
- Maximum timeout: 600000ms (10 minutes)
- Use run_in_background for long-running commands
    `.trim(),
    tools: [
      {
        name: "Bash",
        deltaDocs: `
**Purpose:** Executes bash commands in persistent shell

**Unique Features:**
- Maintains working directory throughout session
- Supports chaining with && or ;
- Can run in background with run_in_background parameter
- Output truncated after 30,000 characters

**Parameters:**
- command: bash command to execute (required)
- description: what the command does (optional but recommended)
- timeout: timeout in milliseconds (optional, default 120000)
- run_in_background: run asynchronously (optional, default false)

**When to use:** Running builds, tests, git commands, npm/yarn, file operations
        `.trim(),
        keywords: [
          "run",
          "execute",
          "install",
          "build",
          "test",
          "npm",
          "git",
          "command",
          "bash",
        ],
      },
      {
        name: "BashOutput",
        deltaDocs: `
**Purpose:** Retrieves output from background bash shell

**Unique Features:**
- Only returns new output since last check
- Supports regex filtering to show matching lines
- Returns stdout and stderr with shell status

**Parameters:**
- bash_id: ID of background shell (required)
- filter: regex to filter output lines (optional)

**When to use:** Monitoring long-running commands, checking background jobs
        `.trim(),
        keywords: ["output", "check", "monitor", "background"],
      },
      {
        name: "KillShell",
        deltaDocs: `
**Purpose:** Terminates a running background bash shell

**Parameters:**
- shell_id: ID of shell to kill (required)

**When to use:** Stopping long-running or hung processes
        `.trim(),
        keywords: ["kill", "stop", "terminate"],
      },
    ],
  },

  web: {
    id: "web",
    name: "Web & Internet",
    commonDocs: `
Web tools provide internet access for searching and fetching content.

**Availability:**
- Web search only available in US region
- HTTP URLs automatically upgraded to HTTPS
- Results may be summarized if content is very large
    `.trim(),
    tools: [
      {
        name: "WebSearch",
        deltaDocs: `
**Purpose:** Search the web using current information

**Unique Features:**
- Provides up-to-date information beyond Claude's knowledge cutoff
- Returns formatted search result blocks
- Supports domain filtering (allow/block specific sites)

**Parameters:**
- query: search query (required, minimum 2 characters)
- allowed_domains: only include results from these domains (optional)
- blocked_domains: exclude results from these domains (optional)

**When to use:** Current events, recent documentation, latest news, web research
        `.trim(),
        keywords: [
          "search the internet",
          "search internet",
          "search the web",
          "search web",
          "look up online",
          "find online",
          "google",
          "search for information",
          "what is the latest",
          "current news",
          "recent developments",
        ],
      },
      {
        name: "WebFetch",
        deltaDocs: `
**Purpose:** Fetches and processes content from URLs

**Unique Features:**
- Converts HTML to markdown automatically
- Processes content with AI model for analysis
- Read-only (does not modify files)
- 15-minute self-cleaning cache

**Parameters:**
- url: fully-formed URL (required)
- prompt: what to extract from the page (required)

**When to use:** Fetching documentation, analyzing web pages, downloading content
        `.trim(),
        keywords: ["fetch", "download", "get from url", "scrape"],
      },
    ],
  },

  interaction: {
    id: "interaction",
    name: "User Interaction",
    commonDocs: `
Interaction tools facilitate communication and task management with the user.

**When to use:**
- When you need clarification or user input
- When tracking multi-step tasks
- When offering choices to the user
    `.trim(),
    tools: [
      {
        name: "AskUserQuestion",
        deltaDocs: `
**Purpose:** Ask user questions during execution

**Unique Features:**
- Support for multiple questions (1-4) in single call
- Each question can have 2-4 options
- Users can always select "Other" for custom input
- Supports multi-select mode for non-exclusive choices

**Parameters:**
- questions: array of question objects (required)
  - question: the complete question text (required)
  - header: short label (max 12 chars) (required)
  - options: array of 2-4 options with label and description (required)
  - multiSelect: allow multiple selections (required)

**When to use:** Gathering preferences, clarifying ambiguous requests, offering choices
        `.trim(),
        keywords: ["ask", "clarify", "question", "which", "choose", "select"],
      },
      {
        name: "TodoWrite",
        deltaDocs: `
**Purpose:** Create and manage structured task list

**Unique Features:**
- Three states: pending, in_progress, completed
- Each task needs content and activeForm (two forms of description)
- Must have exactly ONE task in_progress at any time
- Update status in real-time as you work

**Parameters:**
- todos: array of todo items (required)
  - content: imperative form (e.g., "Run tests") (required)
  - activeForm: continuous form (e.g., "Running tests") (required)
  - status: "pending" | "in_progress" | "completed" (required)

**When to use:** Complex multi-step tasks (3+ steps), tracking progress, demonstrating thoroughness
        `.trim(),
        keywords: ["todo", "plan", "steps", "track", "progress", "tasks"],
      },
    ],
  },

  advanced: {
    id: "advanced",
    name: "Advanced Tools",
    commonDocs: `
Advanced tools provide specialized capabilities for complex operations.

**When to use:**
- For complex, multi-step tasks requiring autonomy (Task)
- For Jupyter notebook operations (NotebookEdit)
- For slash commands and skills (Skill, SlashCommand)
- For plan mode workflows (ExitPlanMode)
    `.trim(),
    tools: [
      {
        name: "Task",
        deltaDocs: `
**Purpose:** Launch specialized agents for complex multi-step tasks

**Available agents:** general-purpose, Explore, Plan, claude-code-guide, and many specialized agents

**When to use:** Multi-step tasks, codebase exploration, research, code review
        `.trim(),
        keywords: [
          "task",
          "agent",
          "complex",
          "multi-step",
          "analyze",
          "explore",
          "research",
        ],
      },
      {
        name: "Skill",
        deltaDocs: `
**Purpose:** Execute skills for specialized capabilities

**When to use:** PDF processing, documentation, security scans, testing, project management
        `.trim(),
        keywords: ["skill", "/"],
      },
      {
        name: "SlashCommand",
        deltaDocs: `
**Purpose:** Execute custom slash commands

**When to use:** User-defined commands from .claude/commands/
        `.trim(),
        keywords: ["slash", "command", "/"],
      },
      {
        name: "NotebookEdit",
        deltaDocs: `
**Purpose:** Edit Jupyter notebook cells

**Parameters:**
- notebook_path: absolute path to .ipynb file (required)
- new_source: new cell content (required)
- cell_id: ID of cell to edit (optional)
- cell_type: "code" | "markdown" (optional)
- edit_mode: "replace" | "insert" | "delete" (optional, default "replace")

**When to use:** Working with Jupyter notebooks
        `.trim(),
        keywords: ["notebook", "jupyter", ".ipynb", "ipynb"],
      },
      {
        name: "ExitPlanMode",
        deltaDocs: `
**Purpose:** Exit plan mode and present plan to user

**When to use:** After planning implementation steps, before executing code
        `.trim(),
        keywords: ["plan mode", "exit plan", "present plan"],
      },
    ],
  },
};

/**
 * Build hierarchical documentation for specific tool categories
 */
export function buildHierarchicalDocs(categoryIds: string[]): string {
  let docs = "";

  categoryIds.forEach((categoryId) => {
    const category = TOOL_CATEGORIES[categoryId];
    if (!category) {
      debug(1, `[Hierarchical Tools] Unknown category: ${categoryId}`);
      return;
    }

    docs += `\n## ${category.name}\n\n`;
    docs += category.commonDocs + "\n\n";

    docs += "### Tools:\n\n";
    category.tools.forEach((tool) => {
      docs += `#### ${tool.name}\n\n`;
      docs += tool.deltaDocs + "\n\n";
    });
  });

  return docs;
}

/**
 * Build documentation for specific tools (even more granular)
 */
export function buildToolDocs(toolNames: string[]): string {
  let docs = "";
  const categoriesUsed = new Set<string>();

  // Group tools by category
  const toolsByCategory = new Map<string, string[]>();

  toolNames.forEach((toolName) => {
    for (const [catId, category] of Object.entries(TOOL_CATEGORIES)) {
      const tool = category.tools.find((t) => t.name === toolName);
      if (tool) {
        if (!toolsByCategory.has(catId)) {
          toolsByCategory.set(catId, []);
        }
        toolsByCategory.get(catId)!.push(toolName);
        categoriesUsed.add(catId);
        break;
      }
    }
  });

  // Build docs category by category
  toolsByCategory.forEach((tools, categoryId) => {
    const category = TOOL_CATEGORIES[categoryId]!;

    docs += `\n## ${category.name}\n\n`;
    docs += category.commonDocs + "\n\n";

    docs += "### Tools:\n\n";
    tools.forEach((toolName) => {
      const tool = category.tools.find((t) => t.name === toolName)!;
      docs += `#### ${tool.name}\n\n`;
      docs += tool.deltaDocs + "\n\n";
    });
  });

  debug(
    2,
    `[Hierarchical Docs] Built docs for ${toolNames.length} tools across ${categoriesUsed.size} categories`
  );

  return docs;
}

/**
 * Get all tool keywords for prediction
 */
export function getAllToolKeywords(): Map<string, string[]> {
  const keywords = new Map<string, string[]>();

  Object.values(TOOL_CATEGORIES).forEach((category) => {
    category.tools.forEach((tool) => {
      keywords.set(tool.name, tool.keywords);
    });
  });

  return keywords;
}

/**
 * Get category ID for a tool name
 */
export function getCategoryForTool(toolName: string): string | null {
  for (const [catId, category] of Object.entries(TOOL_CATEGORIES)) {
    if (category.tools.some((t) => t.name === toolName)) {
      return catId;
    }
  }
  return null;
}

/**
 * Get all tools in a category
 */
export function getToolsInCategory(categoryId: string): string[] {
  const category = TOOL_CATEGORIES[categoryId];
  return category ? category.tools.map((t) => t.name) : [];
}

/**
 * Calculate token savings from hierarchical approach
 */
export function estimateHierarchicalSavings(
  originalPromptLength: number,
  usedCategories: string[]
): {
  originalTokens: number;
  hierarchicalTokens: number;
  savingsPercent: number;
} {
  const originalTokens = Math.floor(originalPromptLength / 4);

  // Build hierarchical docs for used categories
  const hierarchicalDocs = buildHierarchicalDocs(usedCategories);
  const hierarchicalTokens = Math.floor(hierarchicalDocs.length / 4);

  const savingsPercent =
    ((originalTokens - hierarchicalTokens) / originalTokens) * 100;

  return {
    originalTokens,
    hierarchicalTokens,
    savingsPercent,
  };
}
