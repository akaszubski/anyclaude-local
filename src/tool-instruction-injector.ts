/**
 * Tool Instruction Injector for Local Models (Issue #35)
 *
 * Improves tool calling success rates for local models by injecting explicit
 * tool usage instructions into user messages when tool intent is detected.
 *
 * Strategy:
 * 1. Detect tool intent from user message content using keyword patterns
 * 2. Calculate confidence score based on keyword matches
 * 3. Inject explicit instruction if confidence exceeds threshold
 * 4. Prevent false positives (e.g., "read this carefully" != Read tool)
 * 5. Track injection count to prevent over-injection
 *
 * Expected Gain: 100% tool calling success (from research)
 * Risk: 39% performance degradation if over-injected (mitigated by thresholds)
 */

import { debug } from "./debug";
import { TOOL_CATEGORIES } from "./hierarchical-tools";

/**
 * Tool match result from intent detection
 */
export interface ToolMatch {
  toolName: string;
  confidence: number;
  category: string;
  matchedKeywords: string[];
}

// Type alias for test compatibility
export type ToolIntent = ToolMatch;

/**
 * Message context for injection decisions
 */
export interface MessageContext {
  conversationLength: number;
  recentInjections: number;
  hasToolsAvailable: boolean;
}

/**
 * Injection configuration
 */
export interface InjectionConfig {
  enabled: boolean;
  style: "explicit" | "subtle";
  confidenceThreshold: number; // Confidence threshold (0-1)
  maxInjectionsPerConversation: number;
  enableFalsePositiveFilter?: boolean; // Optional, defaults to true
}

// Type alias for test compatibility
export type ToolInstructionConfig = InjectionConfig;

/**
 * Injection result (for test compatibility)
 */
export interface InjectionResult {
  injected: boolean;
  instruction?: string;
  toolName?: string;
  confidence?: number;
}

/**
 * Default injection configuration
 */
export const DEFAULT_INJECTION_CONFIG: InjectionConfig = {
  enabled: true,
  style: "explicit",
  confidenceThreshold: 0.7,
  maxInjectionsPerConversation: 10,
  enableFalsePositiveFilter: true,
};

/**
 * User message content structure (Anthropic format)
 */
interface UserMessage {
  role: "user";
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

/**
 * Anthropic tool definition
 */
interface Tool {
  name: string;
  description?: string;
  input_schema?: any;
}

/**
 * False positive patterns to avoid injecting instructions
 * These are common phrases that contain tool keywords but don't indicate tool use
 */
const FALSE_POSITIVE_PATTERNS = [
  /read\s+(this|that|it)\s+(carefully|thoroughly|closely)/i,
  /keep\s+in\s+mind/i,
  /take\s+into\s+account/i,
  /make\s+sure\s+to/i,
  /don't\s+forget\s+to/i,
  /remember\s+to/i,
  /please\s+(note|understand|consider)/i,
  /just\s+to\s+clarify/i,
  /let\s+me\s+know/i,
  /can\s+you\s+(please\s+)?(explain|describe|tell)/i,
  /i\s+would\s+like\s+to\s+(understand|know|learn)/i,
  /help\s+me\s+understand/i,
  // WebSearch false positives
  /research\s+(shows|suggests|indicates)/i,
  /search\s+(this|the)\s+(document|file|code|codebase)/i,
  /current\s+(directory|file|function)/i,
];

/**
 * Build keyword map from tool categories for fast lookup
 */
function buildToolKeywordMap(): Map<
  string,
  { keywords: string[]; category: string }
> {
  const keywordMap = new Map<
    string,
    { keywords: string[]; category: string }
  >();

  for (const [categoryId, category] of Object.entries(TOOL_CATEGORIES)) {
    for (const tool of category.tools) {
      keywordMap.set(tool.name, {
        keywords: tool.keywords,
        category: categoryId,
      });
    }
  }

  return keywordMap;
}

// Initialize keyword map once
const TOOL_KEYWORD_MAP = buildToolKeywordMap();

/**
 * Detect tool intent from user message content
 *
 * @param message - User message text
 * @param toolsOrKeywords - Array of tool objects OR Map of keywords (defaults to TOOL_KEYWORD_MAP)
 * @returns ToolMatch if intent detected, null otherwise
 */
export function detectToolIntent(
  message: string,
  toolsOrKeywords?:
    | Tool[]
    | Map<string, { keywords: string[]; category: string }>
): ToolMatch | null {
  if (!message || typeof message !== "string") {
    return null;
  }

  const messageLower = message.toLowerCase();
  let bestMatch: ToolMatch | null = null;

  // Build keyword map from tools array if needed
  let keywordMap: Map<string, { keywords: string[]; category: string }>;

  if (!toolsOrKeywords) {
    // Use default keyword map
    keywordMap = TOOL_KEYWORD_MAP;
  } else if (Array.isArray(toolsOrKeywords)) {
    // Build keyword map from tool objects
    keywordMap = new Map();
    for (const tool of toolsOrKeywords) {
      // Find tool in TOOL_CATEGORIES to get keywords
      for (const category of Object.values(TOOL_CATEGORIES)) {
        const toolDef = category.tools.find((t) => t.name === tool.name);
        if (toolDef) {
          keywordMap.set(tool.name, {
            keywords: toolDef.keywords,
            category: category.id,
          });
          break;
        }
      }
    }
  } else {
    // Use provided keyword map
    keywordMap = toolsOrKeywords;
  }

  // Check each tool's keywords
  for (const [toolName, { keywords, category }] of keywordMap.entries()) {
    const matchedKeywords: string[] = [];
    let totalScore = 0;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();

      // Use word boundary regex to avoid partial matches
      // e.g., "read" should match "read README" but not "thread"
      const regex = new RegExp(
        `\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );

      if (regex.test(messageLower)) {
        matchedKeywords.push(keyword);

        // Score based on keyword specificity (longer keywords = higher score)
        // This helps "new file" (2 words) outweigh "write" (1 word)
        const specificity = keyword.split(/\s+/).length;
        totalScore += specificity;
      }
    }

    if (matchedKeywords.length > 0) {
      // Calculate confidence: score / total possible score for this tool
      const maxPossibleScore = keywords.reduce(
        (sum, kw) => sum + kw.split(/\s+/).length,
        0
      );
      const confidence = totalScore / maxPossibleScore;

      // Keep highest confidence match
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          toolName,
          confidence,
          category,
          matchedKeywords,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Check if message is a false positive (contains tool keywords but doesn't indicate tool use)
 *
 * @param message - User message text
 * @returns true if false positive detected
 */
function isFalsePositive(message: string): boolean {
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  return false;
}

/**
 * Format tool instruction based on style
 *
 * @param tool - Tool match result
 * @param style - Instruction style ("explicit" or "subtle")
 * @returns Formatted instruction string
 */
export function formatToolInstruction(
  tool: ToolMatch,
  style: "explicit" | "subtle"
): string {
  const action = getToolAction(tool.toolName);

  if (style === "explicit") {
    return `Use the ${tool.toolName} tool to ${action}. Call the tool now.`;
  } else {
    return `Consider using ${tool.toolName} for ${action}.`;
  }
}

/**
 * Get action description for a tool
 *
 * @param toolName - Name of the tool
 * @returns Action description
 */
function getToolAction(toolName: string): string {
  const actions: Record<string, string> = {
    Read: "read the file",
    Write: "create the file",
    Edit: "modify the file",
    Glob: "find files",
    Grep: "search for content",
    Bash: "execute the command",
    TaskOutput: "check command output",
    KillShell: "stop the process",
    WebSearch: "search the web",
    WebFetch: "fetch web content",
    AskUser: "ask for clarification",
    TodoWrite: "track the tasks",
    Task: "delegate to an agent",
    ExecuteSkill: "run the skill",
    SlashCommand: "execute the command",
    NotebookEdit: "edit the notebook",
    ExitPlanMode: "present the plan",
  };

  return actions[toolName] || "perform the action";
}

/**
 * Determine if instruction should be injected
 *
 * @param message - User message text
 * @param context - Message context
 * @param config - Injection configuration
 * @returns true if injection should occur
 */
export function shouldInjectInstruction(
  message: string,
  context: MessageContext,
  config: InjectionConfig = DEFAULT_INJECTION_CONFIG
): boolean {
  // Check if injection is enabled
  if (!config.enabled) {
    return false;
  }

  // Check if tools are available
  if (!context.hasToolsAvailable) {
    return false;
  }

  // Check if max injections exceeded
  if (context.recentInjections >= config.maxInjectionsPerConversation) {
    debug(2, "[Tool Injection] Max injections reached, skipping");
    return false;
  }

  // Check for false positives
  if (config.enableFalsePositiveFilter && isFalsePositive(message)) {
    debug(2, "[Tool Injection] False positive detected, skipping");
    return false;
  }

  // Detect tool intent
  const toolMatch = detectToolIntent(message);
  if (!toolMatch) {
    return false;
  }

  // Check confidence threshold
  if (toolMatch.confidence < config.confidenceThreshold) {
    debug(
      2,
      `[Tool Injection] Confidence ${toolMatch.confidence.toFixed(2)} below threshold ${config.confidenceThreshold}`
    );
    return false;
  }

  return true;
}

/**
 * Extract text from user message content (handles both string and block formats)
 *
 * @param content - User message content
 * @returns Extracted text
 */
function extractMessageText(
  content: string | Array<{ type: string; text?: string; [key: string]: any }>
): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n");
  }

  return "";
}

/**
 * Inject tool instructions into user message
 *
 * @param message - User message to potentially modify
 * @param tools - Available tools
 * @param config - Injection configuration
 * @param context - Message context (optional, computed if not provided)
 * @returns Modified message with injected instruction (if applicable)
 */
export function injectToolInstructions(
  message: UserMessage,
  tools: Tool[],
  config: InjectionConfig = DEFAULT_INJECTION_CONFIG,
  context?: MessageContext
): UserMessage {
  // Compute context if not provided
  if (!context) {
    context = {
      conversationLength: 1,
      recentInjections: 0,
      hasToolsAvailable: tools.length > 0,
    };
  }
  // Extract message text
  const messageText = extractMessageText(message.content);

  // Check if injection should occur
  if (!shouldInjectInstruction(messageText, context, config)) {
    return message;
  }

  // Detect tool intent
  const toolMatch = detectToolIntent(messageText);
  if (!toolMatch) {
    return message;
  }

  // Verify tool is actually available
  const toolAvailable = tools.some((t) => t.name === toolMatch.toolName);
  if (!toolAvailable) {
    debug(
      2,
      `[Tool Injection] Tool ${toolMatch.toolName} not available, skipping`
    );
    return message;
  }

  // Format instruction
  const instruction = formatToolInstruction(toolMatch, config.style);

  // Inject instruction into message content
  let modifiedContent:
    | string
    | Array<{ type: string; text?: string; [key: string]: any }>;

  if (typeof message.content === "string") {
    // Simple string content - append instruction
    modifiedContent = `${message.content}\n\n${instruction}`;
  } else if (Array.isArray(message.content)) {
    // Block content - append as new text block
    modifiedContent = [
      ...message.content,
      {
        type: "text",
        text: `\n${instruction}`,
      },
    ];
  } else {
    // Unknown format - return original
    return message;
  }

  debug(
    1,
    `[Tool Injection] Injected: "${instruction}" (confidence: ${toolMatch.confidence.toFixed(2)})`
  );

  return {
    ...message,
    content: modifiedContent,
  };
}

/**
 * Process all messages in a conversation and inject tool instructions
 *
 * @param messages - Array of messages
 * @param tools - Available tools
 * @param config - Injection configuration
 * @returns Modified messages with injections
 */
export function processMessages(
  messages: any[],
  tools: Tool[],
  config: InjectionConfig = DEFAULT_INJECTION_CONFIG
): any[] {
  if (!config.enabled || !Array.isArray(messages)) {
    return messages;
  }

  let injectionCount = 0;
  const modifiedMessages: any[] = [];

  for (const message of messages) {
    // Only process user messages
    if (message.role !== "user") {
      modifiedMessages.push(message);
      continue;
    }

    const context: MessageContext = {
      conversationLength: messages.length,
      recentInjections: injectionCount,
      hasToolsAvailable: tools.length > 0,
    };

    const modifiedMessage = injectToolInstructions(
      message,
      tools,
      config,
      context
    );

    // Track if injection occurred
    if (modifiedMessage !== message) {
      injectionCount++;
    }

    modifiedMessages.push(modifiedMessage);
  }

  if (injectionCount > 0) {
    debug(
      1,
      `[Tool Injection] Processed ${messages.length} messages, injected ${injectionCount} instructions`
    );
  }

  return modifiedMessages;
}
