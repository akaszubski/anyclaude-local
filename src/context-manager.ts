import { encoding_for_model } from "tiktoken";
import type { AnthropicMessage } from "./anthropic-api-types";
import { debug, isDebugEnabled } from "./debug";

// Context window sizes for common models
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Conservative defaults for unknown models
  "current-model": 32768, // LMStudio default, conservative but reasonable

  // Known MLX models (Apple Silicon)
  // NOTE: GPT-OSS has known issues with context overflow around 32K
  // despite native 128K support. Use with caution.
  "gpt-oss-20b": 131072,  // Native 128K support (RoPE + YaRN)
  "gpt-oss-120b": 131072, // Native 128K support

  "deepseek-coder-v2-lite": 16384,
  "deepseek-coder-33b": 16384,
  "qwen2.5-coder-7b": 32768,
  "qwen2.5-coder-32b": 32768,
  "mistral-7b": 32768,

  // Add more as needed
};

// Safety margin: Use 80% of context window to leave room for response
const SAFETY_MARGIN = 0.8;

// Minimum messages to keep (always preserve recent context)
const MIN_MESSAGES_TO_KEEP = 3;

export interface ContextStats {
  totalTokens: number;
  systemTokens: number;
  messageTokens: number;
  toolTokens: number;
  contextLimit: number;
  percentUsed: number;
  exceedsLimit: boolean;
}

/**
 * Estimate token count for text using tiktoken
 * Falls back to rough estimation if tiktoken fails
 */
function estimateTokens(text: string): number {
  try {
    // Use cl100k_base encoding (GPT-4, most modern models)
    const encoder = encoding_for_model("gpt-4");
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens.length;
  } catch (error) {
    // Fallback: rough estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Get context limit for a model
 * Priority:
 * 1. Environment variable override (LMSTUDIO_CONTEXT_LENGTH)
 * 2. LMStudio API query (loaded_context_length)
 * 3. Known model table lookup
 * 4. Conservative default (32K)
 */
export function getContextLimit(
  modelName: string,
  lmstudioContextLength?: number
): number {
  // 1. Check for environment variable override (highest priority)
  const envLimit = process.env.LMSTUDIO_CONTEXT_LENGTH;
  if (envLimit) {
    const limit = parseInt(envLimit, 10);
    if (!isNaN(limit) && limit > 0) {
      debug(1, `[Context] Using env override: ${limit} tokens`);
      return limit;
    }
  }

  // 2. Use LMStudio API value if provided (queried from LMStudio)
  if (lmstudioContextLength && lmstudioContextLength > 0) {
    debug(
      1,
      `[Context] Using LMStudio reported context: ${lmstudioContextLength} tokens`
    );
    return lmstudioContextLength;
  }

  // 3. Check known models (case-insensitive, partial match)
  const lowerModel = modelName.toLowerCase();
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (lowerModel.includes(key.toLowerCase())) {
      debug(
        1,
        `[Context] Using model table lookup (${key}): ${limit} tokens`
      );
      return limit;
    }
  }

  // 4. Conservative default
  debug(
    1,
    `[Context] Using conservative default: ${MODEL_CONTEXT_LIMITS["current-model"]} tokens`
  );
  return MODEL_CONTEXT_LIMITS["current-model"];
}

/**
 * Count tokens in Anthropic messages
 */
function countMessageTokens(messages: AnthropicMessage[]): number {
  let total = 0;
  for (const message of messages) {
    // Count role
    total += 1; // "user" or "assistant"

    // Count content blocks
    for (const content of message.content) {
      if (content.type === "text") {
        total += estimateTokens(content.text);
      } else if (content.type === "tool_use") {
        total += estimateTokens(content.name);
        total += estimateTokens(JSON.stringify(content.input));
      } else if (content.type === "tool_result") {
        total += estimateTokens(
          typeof content.content === "string"
            ? content.content
            : JSON.stringify(content.content)
        );
      }
    }
  }
  return total;
}

/**
 * Count tokens in system prompt
 */
function countSystemTokens(system?: { text: string }[]): number {
  if (!system || system.length === 0) return 0;
  const text = system.map((s) => s.text).join("\n");
  return estimateTokens(text);
}

/**
 * Count tokens in tool definitions
 */
function countToolTokens(tools?: any[]): number {
  if (!tools || tools.length === 0) return 0;
  // Rough estimate: JSON.stringify the tools
  return estimateTokens(JSON.stringify(tools));
}

/**
 * Calculate context statistics for a request
 */
export function calculateContextStats(
  messages: AnthropicMessage[],
  system?: { text: string }[],
  tools?: any[],
  modelName: string = "current-model",
  lmstudioContextLength?: number
): ContextStats {
  const systemTokens = countSystemTokens(system);
  const messageTokens = countMessageTokens(messages);
  const toolTokens = countToolTokens(tools);
  const totalTokens = systemTokens + messageTokens + toolTokens;

  const contextLimit = getContextLimit(modelName, lmstudioContextLength);
  const safeLimit = Math.floor(contextLimit * SAFETY_MARGIN);
  const percentUsed = (totalTokens / safeLimit) * 100;
  const exceedsLimit = totalTokens > safeLimit;

  return {
    totalTokens,
    systemTokens,
    messageTokens,
    toolTokens,
    contextLimit: safeLimit,
    percentUsed,
    exceedsLimit,
  };
}

/**
 * Truncate messages to fit within context limit
 * Keeps: system prompt, tools, and most recent messages
 */
export function truncateMessages(
  messages: AnthropicMessage[],
  system: { text: string }[] | undefined,
  tools: any[] | undefined,
  modelName: string = "current-model",
  lmstudioContextLength?: number
): { messages: AnthropicMessage[]; truncated: boolean; removedCount: number } {
  const stats = calculateContextStats(messages, system, tools, modelName, lmstudioContextLength);

  if (!stats.exceedsLimit) {
    return { messages, truncated: false, removedCount: 0 };
  }

  debug(1, `⚠️  Context limit exceeded: ${stats.totalTokens} tokens > ${stats.contextLimit} limit`);

  // Keep system and tools (they're essential)
  const fixedTokens = stats.systemTokens + stats.toolTokens;
  const availableForMessages = stats.contextLimit - fixedTokens;

  if (availableForMessages <= 0) {
    throw new Error(
      `System prompt and tools alone exceed context limit (${fixedTokens} > ${stats.contextLimit}). ` +
      `Consider reducing tool count or increasing LMSTUDIO_CONTEXT_LENGTH.`
    );
  }

  // Keep most recent messages that fit
  const truncatedMessages: AnthropicMessage[] = [];
  let currentTokens = 0;

  // Start from end (most recent) and work backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = countMessageTokens([messages[i]]);

    // Always keep minimum recent messages
    if (truncatedMessages.length < MIN_MESSAGES_TO_KEEP) {
      truncatedMessages.unshift(messages[i]);
      currentTokens += msgTokens;
      continue;
    }

    // Check if adding this message would exceed limit
    if (currentTokens + msgTokens > availableForMessages) {
      break; // Stop, we've hit the limit
    }

    truncatedMessages.unshift(messages[i]);
    currentTokens += msgTokens;
  }

  const removedCount = messages.length - truncatedMessages.length;

  if (isDebugEnabled()) {
    debug(1, `Truncated ${removedCount} messages (kept ${truncatedMessages.length})`);
    debug(1, `Tokens after truncation: ${fixedTokens + currentTokens} / ${stats.contextLimit}`);
  }

  return {
    messages: truncatedMessages,
    truncated: true,
    removedCount,
  };
}

/**
 * Log context warning if approaching limit
 */
export function logContextWarning(stats: ContextStats): void {
  if (stats.percentUsed > 90) {
    console.error(
      `\n⚠️  WARNING: Context usage at ${stats.percentUsed.toFixed(1)}%\n` +
      `   Total: ${stats.totalTokens} / ${stats.contextLimit} tokens\n` +
      `   \n` +
      `   ⚠️  LOCAL MODEL LIMITATION:\n` +
      `   Unlike Claude Sonnet 4.5 which auto-compresses context,\n` +
      `   local models will truncate older messages when limit is exceeded.\n` +
      `   \n` +
      `   RECOMMENDED ACTION:\n` +
      `   1. Save your work and start a new Claude Code conversation\n` +
      `   2. Or: Use a model with larger context (32K+ recommended)\n` +
      `   3. Or: Set LMSTUDIO_CONTEXT_LENGTH higher if your model supports it\n`
    );
  } else if (stats.percentUsed > 75) {
    debug(
      1,
      `[Context] ${stats.percentUsed.toFixed(1)}% used (${stats.totalTokens} / ${stats.contextLimit} tokens) - Consider starting new conversation soon`
    );
  }
}
