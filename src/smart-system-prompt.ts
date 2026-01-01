/**
 * Smart System Prompt Optimizer
 *
 * Dynamically constructs system prompts by:
 * 1. Always including core instructions (identity, tone, workflow)
 * 2. Analyzing user request to predict needed tools
 * 3. Selectively including only relevant tool documentation
 * 4. Keeping full tool schemas for function calling
 *
 * This reduces token usage from ~12-20k to ~2-4k while maintaining accuracy.
 */

import { debug } from "./debug";
import {
  TOOL_CATEGORIES,
  getAllToolKeywords,
  getCategoryForTool,
  getToolsInCategory,
  buildHierarchicalDocs,
  buildToolDocs,
} from "./hierarchical-tools";
import { deduplicatePrompt } from "./prompt-templates";

/**
 * Get expanded tool keywords from hierarchical-tools.ts
 */
const TOOL_PREDICTION_KEYWORDS = getAllToolKeywords();

/**
 * Additional phrase patterns for better prediction
 */
const TOOL_PHRASE_PATTERNS: Record<string, RegExp[]> = {
  Read: [
    /what('s| is) in (the )?file/i,
    /show me (the )?(contents|file)/i,
    /look at (the )?file/i,
    /examine (the )?code/i,
  ],
  Write: [
    /create (a )?new file/i,
    /write (a|to)( new)? file/i,
    /save (this |the )?to (a )?file/i,
  ],
  Edit: [
    /fix (the|this) (bug|error|issue)/i,
    /change (the|this)/i,
    /update (the|this)/i,
    /modify (the|this)/i,
    /refactor (the|this)/i,
  ],
  Bash: [
    /run (a|the)? (command|test|build|script)/i,
    /execute (this|the)/i,
    /(npm|yarn|git|docker) .+/i,
  ],
  Grep: [
    /search (for|the codebase)/i,
    /find (all|where)/i,
    /look for .+ in (the )?(code|files)/i,
  ],
  Glob: [
    /list (all )?files/i,
    /find (all )?(files|\.)/i,
    /\*\.(ts|js|py|go|java)/i,
  ],
  Task: [
    /implement .+/i,
    /(complex|multi-step) task/i,
    /analyze (the )?codebase/i,
    /explore (the )?(code|project)/i,
  ],
  TodoWrite: [
    /plan (this|the) (task|implementation)/i,
    /track (my |the )?progress/i,
    /break .+ into steps/i,
  ],
  AskUserQuestion: [
    /which .+ (should|do you|would you)/i,
    /what .+ (prefer|want)/i,
    /should i .+\?/i,
  ],
  WebSearch: [
    /(search|google|look up) (online|on the web)/i,
    /find (the )?latest .+ (online|documentation)/i,
  ],
  WebFetch: [
    /fetch (from|the) (url|website)/i,
    /download .+ from .+/i,
    /get (content from|the page)/i,
  ],
};

/**
 * Core system prompt sections (always included)
 */
const CORE_SECTIONS = [
  "You are Claude Code",
  "# Tone and style",
  "# Professional objectivity",
  "# Planning without timelines",
  "# Task Management",
  "# Asking questions as you work",
  "# Doing tasks",
  "# Code References",
  "# Tool usage policy", // CRITICAL: Contains function call format instructions
  "When making function calls", // CRITICAL: JSON formatting for tool calls
];

/**
 * Tool-specific documentation patterns
 */
const TOOL_DOC_PATTERNS = {
  Bash: [
    "# Committing changes with git",
    "# Creating pull requests",
    "# Other common operations",
  ],
  Task: ["# Looking up your own documentation"],
  Read: ["Usage:", "- The file_path parameter"],
  Write: ["Usage:", "- This tool will overwrite"],
  Edit: ["Usage:", "- You must use your `Read` tool"],
};

/**
 * Tool prediction with confidence scoring
 */
interface ToolPrediction {
  tool: string;
  confidence: number;
  reason: string;
}

/**
 * Predict which tools will be needed based on user message (ENHANCED)
 */
export function predictNeededTools(
  userMessage: string,
  conversationHistory: any[]
): string[] {
  const predictions: ToolPrediction[] = [];
  const neededTools = new Set<string>();

  // Always include basics (low confidence baseline)
  neededTools.add("Read");
  neededTools.add("Bash");

  // 1. Keyword-based prediction
  for (const [tool, keywords] of TOOL_PREDICTION_KEYWORDS.entries()) {
    const messageLower = userMessage.toLowerCase();
    const matchedKeywords = keywords.filter((kw) => messageLower.includes(kw));

    if (matchedKeywords.length > 0) {
      predictions.push({
        tool,
        confidence: 0.6 + matchedKeywords.length * 0.1, // Higher if multiple keywords
        reason: `keywords: ${matchedKeywords.join(", ")}`,
      });
    }
  }

  // 2. Phrase pattern matching (higher confidence)
  for (const [tool, patterns] of Object.entries(TOOL_PHRASE_PATTERNS)) {
    const matchedPatterns = patterns.filter((pattern) =>
      pattern.test(userMessage)
    );

    if (matchedPatterns.length > 0) {
      predictions.push({
        tool,
        confidence: 0.8 + matchedPatterns.length * 0.05,
        reason: `phrase pattern matched`,
      });
    }
  }

  // 3. Context-based inference
  const messageLower = userMessage.toLowerCase();

  // File operations inference
  if (messageLower.match(/all.*files|multiple.*files|\*\./)) {
    predictions.push({
      tool: "Glob",
      confidence: 0.75,
      reason: "multiple files pattern",
    });
  }

  // Code modification inference
  if (messageLower.match(/implement|refactor|add feature|create.*system/)) {
    predictions.push(
      { tool: "TodoWrite", confidence: 0.7, reason: "complex task" },
      { tool: "Edit", confidence: 0.65, reason: "likely modifications" },
      { tool: "Write", confidence: 0.6, reason: "possible new files" }
    );
  }

  // Question detection
  if (messageLower.match(/\?|should i|which|what.*prefer|choose/)) {
    predictions.push({
      tool: "AskUserQuestion",
      confidence: 0.7,
      reason: "question detected",
    });
  }

  // 4. Conversation history analysis
  if (conversationHistory.length > 0) {
    const recentTools = analyzeConversationHistory(conversationHistory);
    recentTools.forEach((tool) => {
      predictions.push({
        tool,
        confidence: 0.5,
        reason: "used in recent conversation",
      });
    });
  }

  // 5. Consolidate predictions (highest confidence per tool)
  const toolConfidence = new Map<string, number>();
  predictions.forEach((pred) => {
    const current = toolConfidence.get(pred.tool) || 0;
    if (pred.confidence > current) {
      toolConfidence.set(pred.tool, pred.confidence);
    }
  });

  // 6. Select tools with confidence > threshold
  const CONFIDENCE_THRESHOLD = 0.55;
  toolConfidence.forEach((confidence, tool) => {
    if (confidence >= CONFIDENCE_THRESHOLD) {
      neededTools.add(tool);
    }
  });

  // 7. Category-based fallback (if very few tools predicted)
  if (neededTools.size < 3) {
    const fallbackTools = getCategoryFallback(userMessage);
    fallbackTools.forEach((tool) => neededTools.add(tool));
  }

  const toolsArray = Array.from(neededTools);

  debug(
    2,
    `[Tool Prediction] Predicted ${toolsArray.length} tools: ${toolsArray.join(", ")}`
  );

  return toolsArray;
}

/**
 * Analyze conversation history to predict tools
 */
function analyzeConversationHistory(history: any[]): string[] {
  const recentTools = new Set<string>();

  // Look at last 3 messages
  const recent = history.slice(-3);

  recent.forEach((message) => {
    // Check if message content mentions tools
    const content = JSON.stringify(message);

    // Simple heuristic: if we see tool call patterns
    if (
      content.includes('"type":"tool_use"') ||
      content.includes('"tool_call"')
    ) {
      // Extract tool names if possible
      const toolMatches = content.match(/"name":"(\w+)"/g);
      if (toolMatches) {
        toolMatches.forEach((match) => {
          const toolName = match.match(/"name":"(\w+)"/)?.[1];
          if (toolName) {
            recentTools.add(toolName);
          }
        });
      }
    }
  });

  return Array.from(recentTools);
}

/**
 * Get fallback tools based on message characteristics (category-based)
 */
function getCategoryFallback(userMessage: string): string[] {
  const messageLower = userMessage.toLowerCase();
  const fallback: string[] = [];

  // If message is very short, assume simple file operation
  if (userMessage.length < 30) {
    return getToolsInCategory("fileOps").slice(0, 3); // Read, Write, Edit
  }

  // If contains file-related words, add file ops category
  if (messageLower.match(/file|code|source|function|class|variable/)) {
    fallback.push(...getToolsInCategory("fileOps"));
  }

  // If contains execution-related words, add execution category
  if (messageLower.match(/run|test|build|install|command/)) {
    fallback.push(...getToolsInCategory("execution"));
  }

  // If contains web-related words, add web category
  if (messageLower.match(/search|fetch|url|http|online/)) {
    fallback.push(...getToolsInCategory("web"));
  }

  // Default fallback if nothing matched
  if (fallback.length === 0) {
    fallback.push("Read", "Write", "Edit", "Bash");
  }

  debug(
    2,
    `[Category Fallback] Added ${fallback.length} tools: ${fallback.join(", ")}`
  );

  return fallback;
}

/**
 * Extract core system prompt (always included)
 */
export function extractCoreInstructions(systemPrompt: string): string {
  const lines = systemPrompt.split("\n");
  const coreLines: string[] = [];
  let inCoreSection = false;
  let sectionStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check if this is a core section
    const isCoreSection = CORE_SECTIONS.some((sec) => line.includes(sec));

    if (isCoreSection) {
      inCoreSection = true;
      sectionStartIdx = i;
    }

    // Exit section when we hit a new # header that's not a core section
    const isNewSection = line.startsWith("#") && sectionStartIdx !== i;
    if (inCoreSection && isNewSection && i > sectionStartIdx + 3) {
      const nextSectionIsCore = CORE_SECTIONS.some((sec) => line.includes(sec));
      if (!nextSectionIsCore) {
        inCoreSection = false;
      }
    }

    // Include first 150 lines OR core section content
    if (i < 150 || inCoreSection) {
      coreLines.push(line);
    }
  }

  return coreLines.join("\n");
}

/**
 * Extract tool-specific documentation
 */
export function extractToolDocumentation(
  systemPrompt: string,
  tools: string[]
): string {
  const lines = systemPrompt.split("\n");
  const toolDocs: string[] = [];

  for (const tool of tools) {
    const patterns = TOOL_DOC_PATTERNS[tool as keyof typeof TOOL_DOC_PATTERNS];
    if (!patterns) continue;

    let inToolSection = false;
    let sectionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Start capturing when we hit a tool pattern
      if (patterns.some((pattern) => line.includes(pattern))) {
        inToolSection = true;
        sectionLines = [line];
        continue;
      }

      // Stop capturing when we hit a new section
      if (inToolSection && line.startsWith("#") && sectionLines.length > 5) {
        inToolSection = false;
        toolDocs.push(...sectionLines);
        sectionLines = [];
        continue;
      }

      // Accumulate section lines
      if (inToolSection) {
        sectionLines.push(line);
      }
    }

    // Add any remaining section
    if (sectionLines.length > 0) {
      toolDocs.push(...sectionLines);
    }
  }

  return toolDocs.join("\n");
}

/**
 * Build optimized system prompt (3-Layer Optimization Pipeline)
 *
 * Layer 1: Semantic Deduplication (18k → 15k tokens)
 * Layer 2: Hierarchical Tool Docs (15k → 10k tokens)
 * Layer 3: Context Filtering (10k → 1.5-3k tokens)
 */
export function buildOptimizedSystemPrompt(
  originalPrompt: string,
  userMessage: string,
  conversationHistory: any[],
  maxTokens: number = 2000
): { prompt: string; toolsUsed: string[] } {
  const startTime = Date.now();

  // Predict needed tools (using enhanced prediction with confidence scoring)
  const neededTools = predictNeededTools(userMessage, conversationHistory);

  debug(
    2,
    `[Smart Prompt] Predicted ${neededTools.length} tools: ${neededTools.join(", ")}`
  );

  // === Layer 1: Semantic Deduplication ===
  // Apply deduplicatePrompt from prompt-templates.ts
  // This removes repetitive patterns and creates template references
  const { optimized: dedupedPrompt, stats: dedupStats } = deduplicatePrompt(
    originalPrompt,
    {
      minOccurrences: 3,
      minLength: 30,
      maxLength: 250,
    }
  );

  debug(
    2,
    `[Layer 1: Dedup] ${dedupStats.originalTokens} → ${dedupStats.optimizedTokens} tokens (${dedupStats.reductionPercent.toFixed(1)}% reduction)`
  );

  // === Layer 2: Hierarchical Tool Documentation ===
  // Extract core instructions (always included)
  let optimizedPrompt = extractCoreInstructions(dedupedPrompt);

  // Use hierarchical tool system instead of extractToolDocumentation
  const toolDocs = buildToolDocs(neededTools);
  optimizedPrompt += "\n\n# Tool Usage Guidelines\n\n" + toolDocs;

  const layer2Tokens = Math.floor(optimizedPrompt.length / 4);
  debug(
    2,
    `[Layer 2: Hierarchical] ${dedupStats.optimizedTokens} → ${layer2Tokens} tokens (${((1 - layer2Tokens / dedupStats.optimizedTokens) * 100).toFixed(1)}% reduction)`
  );

  // === Layer 3: Context Filtering ===
  // Ensure we don't exceed max tokens (rough estimate: 1 token ≈ 4 chars)
  const maxChars = maxTokens * 4;
  if (optimizedPrompt.length > maxChars) {
    optimizedPrompt = optimizedPrompt.substring(0, maxChars);
    optimizedPrompt += "\n\n[System prompt optimized for current task.]";
  }

  const finalTokens = Math.floor(optimizedPrompt.length / 4);
  const totalReduction = (
    (1 - finalTokens / dedupStats.originalTokens) *
    100
  ).toFixed(1);
  const processingTime = Date.now() - startTime;

  debug(
    1,
    `[Smart Prompt] 3-Layer Pipeline: ${dedupStats.originalTokens} → ${finalTokens} tokens (${totalReduction}% reduction) in ${processingTime}ms`
  );

  return {
    prompt: optimizedPrompt,
    toolsUsed: neededTools,
  };
}

/**
 * Check if smart prompting is beneficial for this request
 */
export function shouldUseSmartPrompt(requestBody: any, mode: string): boolean {
  // Only enable for LMStudio (has cache limitations)
  if (mode !== "lmstudio") return false;

  // Don't use for very short requests (overhead not worth it)
  const lastMessage = requestBody.messages?.[requestBody.messages.length - 1];
  const userMessage =
    typeof lastMessage?.content === "string"
      ? lastMessage.content
      : lastMessage?.content?.[0]?.text || "";

  if (userMessage.length < 10) return false;

  // Don't use if system prompt is already small
  const systemPromptSize =
    typeof requestBody.system === "string"
      ? requestBody.system.length
      : JSON.stringify(requestBody.system || "").length;

  return systemPromptSize > 8000; // Only optimize if >8KB
}
