/**
 * Handle Anthropic server-side tools (web_search, etc.) for local models
 *
 * Server-side tools have a different format than regular tools:
 * - Regular tools: { name: "...", description: "...", input_schema: {...} }
 * - Server tools: { type: "web_search_20250305", name: "web_search", ... }
 *
 * Local models can't handle server-side tools, so we:
 * 1. Filter them out before sending to the model
 * 2. Detect when a search would be helpful
 * 3. Execute searches via DuckDuckGo and inject results
 */

import { debug, isDebugEnabled } from "./debug";
import {
  executeClaudeSearch,
  type SearchResult,
} from "./claude-search-executor";
import {
  SearchIntentClassifier,
  type ClassifierConfig,
} from "./search-intent-classifier";

// Global classifier instance (initialized lazily)
let searchClassifier: SearchIntentClassifier | null = null;

/**
 * Initialize the GenAI search intent classifier
 * Should be called during server startup
 */
export function initializeSearchClassifier(
  config: ClassifierConfig,
  mode: string,
  backendUrl?: string
): void {
  searchClassifier = new SearchIntentClassifier(config, mode, backendUrl);
  debug(1, "[WebSearch] GenAI classifier initialized", { mode, backendUrl });
}

/**
 * Get default classifier config from environment variables
 */
export function getDefaultClassifierConfig(): ClassifierConfig {
  return {
    enabled: process.env.GENAI_CLASSIFIER_ENABLED !== "false",
    cacheSize: parseInt(process.env.GENAI_CLASSIFIER_CACHE_SIZE || "100"),
    cacheTtlSeconds: parseInt(process.env.GENAI_CLASSIFIER_TTL || "3600"),
    llmTimeout: parseInt(process.env.GENAI_CLASSIFIER_TIMEOUT || "3000"),
    fallbackToRegex: process.env.GENAI_CLASSIFIER_FALLBACK !== "false",
  };
}

/**
 * Known server-side tool names that should be handled by the proxy
 * These tools are executed by Anthropic's servers, not by models
 */
const SERVER_SIDE_TOOL_NAMES = ["WebSearch", "web_search", "websearch"];

/**
 * Check if a tool is a server-side tool (like web_search)
 * Detects both by type field (Anthropic format) and by name (Claude Code format)
 */
export function isServerSideTool(tool: any): boolean {
  // Server-side tools have a type field starting with the tool identifier
  // e.g., "web_search_20250305"
  if (typeof tool.type === "string" && tool.type.includes("_")) {
    return true;
  }

  // Also check by name - Claude Code may send WebSearch as a regular tool
  if (typeof tool.name === "string") {
    return SERVER_SIDE_TOOL_NAMES.some(
      (name) => tool.name.toLowerCase() === name.toLowerCase()
    );
  }

  return false;
}

/**
 * Check if a tool is the web_search server-side tool
 */
export function isWebSearchTool(tool: any): boolean {
  // Check by type (Anthropic format)
  if (typeof tool.type === "string" && tool.type.startsWith("web_search_")) {
    return true;
  }

  // Check by name (Claude Code format)
  if (typeof tool.name === "string") {
    return SERVER_SIDE_TOOL_NAMES.some(
      (name) => tool.name.toLowerCase() === name.toLowerCase()
    );
  }

  return false;
}

/**
 * Check if a tool call name is a WebSearch tool that should be stripped
 * This is used by the stream converter to filter out WebSearch tool calls
 */
export function isWebSearchToolCall(toolName: string): boolean {
  return SERVER_SIDE_TOOL_NAMES.some(
    (name) => toolName.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Filter out server-side tools that local models can't handle
 */
export function filterServerSideTools(tools: any[]): {
  regularTools: any[];
  serverTools: any[];
  hasWebSearch: boolean;
} {
  const regularTools: any[] = [];
  const serverTools: any[] = [];
  let hasWebSearch = false;

  for (const tool of tools) {
    if (isServerSideTool(tool)) {
      serverTools.push(tool);
      if (isWebSearchTool(tool)) {
        hasWebSearch = true;
      }
    } else {
      regularTools.push(tool);
    }
  }

  if (serverTools.length > 0 && isDebugEnabled()) {
    debug(
      1,
      `[Server Tools] Filtered ${serverTools.length} server-side tool(s):`,
      {
        filtered: serverTools.map((t) => t.type || t.name),
        hasWebSearch,
      }
    );
  }

  return { regularTools, serverTools, hasWebSearch };
}

/**
 * Keywords that indicate a user wants current/real-time information from the web
 * Note: Simple "search" may be intercepted by Claude Code's local file search,
 * so we prioritize patterns that clearly indicate web/internet search intent.
 */
const SEARCH_INTENT_PATTERNS = [
  // Explicit web/internet search (highest priority) - Issue #44 keywords
  /\b(web search|internet search|online|on the web|browse)\b/i,
  /\b(search the web|search the internet|search internet|search web)\b/i,
  /\b(look up online|find online|search online)\b/i,
  /\b(google|bing|duckduckgo|searx)\b/i,
  // "search X in/for Y" pattern - clearly web search, not file search
  // e.g., "search LSP in claude code", "search plugins for vscode"
  /\bsearch\s+\w+.*\s+(in|for)\s+\w+/i,
  // "search for X" when asking about external tools/products
  /\bsearch\s+(for\s+)?(plugin|extension|feature|api|sdk|library|package|module)/i,
  // "search for information" - explicit web search intent
  /\bsearch\s+for\s+information\b/i,
  // Time-sensitive queries (needs current data)
  /\b(current|latest|recent|today|now|2024|2025|2026)\b/i,
  // News and updates
  /\b(news|update|announce|release|launched?)\b/i,
  // Information requests that likely need web data
  /\b(look up|find out|what is|who is|how do i|how does)\b/i,
  // Weather, prices, stocks (always need current data)
  /\b(weather|temperature|price|stock|rate|cost)\b/i,
  // Events and happenings
  /\b(happening|event|schedule|when (is|was|will))\b/i,
  // Documentation and learning (likely needs web)
  /\b(documentation|docs|tutorial|guide|example|best practice)\b/i,
];

/**
 * Detect if a message indicates search intent (sync version - regex only)
 * Use detectSearchIntentAsync for GenAI-powered classification
 */
export function detectSearchIntent(message: string): boolean {
  return SEARCH_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Detect if a message indicates search intent (async version - GenAI powered)
 * Falls back to regex if classifier is not initialized
 */
export async function detectSearchIntentAsync(
  message: string
): Promise<boolean> {
  // If classifier is not initialized, fall back to regex
  if (!searchClassifier) {
    debug(2, "[WebSearch] Classifier not initialized, using regex fallback");
    return detectSearchIntent(message);
  }

  try {
    const result = await searchClassifier.classify(message);
    debug(
      2,
      `[WebSearch] GenAI classification: ${result.method} -> ${result.isSearchIntent} (${result.confidence}, ${result.latencyMs.toFixed(1)}ms)`
    );
    return result.isSearchIntent;
  } catch (error: any) {
    debug(
      1,
      `[WebSearch] GenAI classification failed, using regex fallback: ${error.message}`
    );
    return detectSearchIntent(message);
  }
}

/**
 * Get classifier statistics for monitoring
 */
export function getClassifierStats() {
  return searchClassifier?.getStats() ?? null;
}

/**
 * Extract the search query from a user message
 */
export function extractSearchQuery(message: string): string {
  // Simple extraction: use the whole message, limited to reasonable length
  // Remove common prefixes
  let query = message
    .replace(/^(please|can you|could you|I want to|I need to|help me)\s*/i, "")
    .replace(/\?+$/, "")
    .trim();

  // Limit to first sentence or 200 chars for search query
  const firstSentence = query.split(/[.!?]/)[0];
  return firstSentence.substring(0, 200).trim();
}

/**
 * Format search results as a system context injection
 */
export function formatSearchResultsForContext(
  query: string,
  results: SearchResult[]
): string {
  if (results.length === 0) {
    return "";
  }

  const formattedResults = results
    .slice(0, 5) // Limit to top 5
    .map((r, i) => {
      let entry = `${i + 1}. [${r.title}](${r.url})`;
      if (r.snippet) {
        entry += `\n   ${r.snippet}`;
      }
      return entry;
    })
    .join("\n\n");

  return `\n\n## Web Search Results\n\nThe following are current web search results for "${query}":\n\n${formattedResults}\n\nPlease use these results to provide an accurate, up-to-date response. Cite sources when relevant.\n`;
}

/**
 * Execute a proactive web search if user message indicates search intent.
 * This is called by the proxy after it has already determined we're using a local model.
 *
 * Returns search results formatted for injection, or null if no search needed
 */
/**
 * Patterns that indicate Claude Code internal messages (not user requests)
 */
const INTERNAL_MESSAGE_PATTERNS = [
  /^\[SUGGESTION MODE/i,
  /^Analyze if this message/i,
  /^You are Claude Code/i,
  /^extract a \d+-\d+ word title/i,
  /^write a \d+-\d+ word title/i,
  /^<system-reminder>/i,
  /^Perform a web search for/i, // Already a search request from model
];

export function isInternalMessage(message: string): boolean {
  return INTERNAL_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(message.trim())
  );
}

export async function executeProactiveSearch(
  userMessage: string,
  _hasWebSearchTool: boolean, // Kept for API compatibility, always treated as true
  mode: string
): Promise<{
  query: string;
  results: SearchResult[];
  contextAddition: string;
} | null> {
  // Skip for cloud modes - they handle web_search themselves
  if (mode === "claude" || mode === "openrouter") {
    debug(2, `[WebSearch] Skipping proactive search for cloud mode: ${mode}`);
    return null;
  }

  // Skip Claude Code internal messages
  if (isInternalMessage(userMessage)) {
    debug(2, `[WebSearch] Skipping internal message`);
    return null;
  }

  debug(
    1,
    `[WebSearch] Checking search intent in: "${userMessage.substring(0, 100)}..."`
  );

  // Check if user message indicates search intent (using GenAI classifier if available)
  const hasSearchIntent = await detectSearchIntentAsync(userMessage);
  if (!hasSearchIntent) {
    debug(1, `[WebSearch] No search intent detected`);
    return null;
  }

  // Extract and execute search
  const query = extractSearchQuery(userMessage);
  if (isDebugEnabled()) {
    debug(1, `[WebSearch] Executing proactive search for: "${query}"`);
  }

  try {
    const results = await executeClaudeSearch(query);

    if (results.length > 0) {
      debug(1, `[WebSearch] Got ${results.length} results`);
      const contextAddition = formatSearchResultsForContext(query, results);
      return { query, results, contextAddition };
    } else {
      debug(1, `[WebSearch] No results found`);
      return null;
    }
  } catch (error) {
    debug(1, `[WebSearch] Search failed: ${error}`);
    return null;
  }
}
