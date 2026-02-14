/**
 * Model-specific prompt adapters for optimized prompting
 *
 * This module provides model-specific prompt adaptation to optimize:
 * - System prompt formatting (bullet points, conciseness, etc.)
 * - Tool schema simplification (parameter limits, description length)
 * - User message formatting (model-specific instructions)
 * - Tool call parsing (handle model-specific formats)
 *
 * Security:
 * - Max prompt size: 1MB (prevents DoS)
 * - Timeout: 100ms (prevents blocking)
 * - Input validation (prevents malformed data)
 */

import { QwenAdapter } from "./adapters/qwen-adapter";
import { DeepSeekAdapter } from "./adapters/deepseek-adapter";
import { MistralAdapter } from "./adapters/mistral-adapter";
import { LlamaAdapter } from "./adapters/llama-adapter";
import { GenericAdapter } from "./adapters/generic-adapter";

// ============================================================================
// SECURITY LIMITS
// ============================================================================

/** Maximum prompt size: 1MB (prevents DoS) */
export const MAX_PROMPT_SIZE_BYTES = 1024 * 1024;

/** Adapter timeout: 100ms (prevents blocking) */
export const ADAPTER_TIMEOUT_MS = 100;

/** Maximum number of tools (prevents excessive processing) */
export const MAX_TOOLS = 500;

// ============================================================================
// TYPES
// ============================================================================

/** Metadata about prompt adaptation */
export interface AdaptationMetadata {
  /** Name of adapter that was used */
  adapterName: string;

  /** Original prompt length in characters */
  originalLength: number;

  /** Adapted prompt length in characters */
  adaptedLength: number;

  /** Reduction percentage (0-100) */
  reductionPercent: number;

  /** Whether content was modified */
  wasModified: boolean;

  /** List of transformations applied */
  transformations: string[];

  /** Model-specific optimizations applied */
  modelOptimizations: string[];

  /** Timestamp when adaptation occurred */
  timestamp: number;

  /** Time taken for adaptation in milliseconds */
  durationMs: number;

  /** Whether fallback adapter was used due to error */
  fallbackUsed?: boolean;
}

/** Result of prompt adaptation */
export interface AdaptedPrompt {
  /** Adapted content */
  content: string;

  /** Metadata about the adaptation */
  metadata: AdaptationMetadata;
}

/** Configuration options for prompt adapters */
export interface PromptAdapterConfig {
  /** Maximum prompt length in characters (overrides default) */
  maxPromptLength?: number;

  /** Enable tool schema optimization */
  enableToolOptimization?: boolean;

  /** Preserve critical sections (tool usage policy, etc.) */
  preserveCriticalSections?: boolean;
}

/** Interface for model-specific prompt adapters */
export interface PromptAdapter {
  /** Model identifier this adapter handles */
  modelId: string;

  /** Name of this adapter (e.g., "QwenAdapter") */
  adapterName: string;

  /**
   * Adapt system prompt for this model
   * @param prompt - Original system prompt
   * @returns Adapted prompt with metadata
   */
  adaptSystemPrompt(prompt: string): Promise<AdaptedPrompt>;

  /**
   * Adapt tool schemas for this model
   * @param tools - Original tool definitions
   * @returns Adapted tool definitions
   */
  adaptTools(tools: any[]): Promise<any[]>;

  /**
   * Adapt user message for this model
   * @param message - Original user message
   * @returns Adapted message with metadata
   */
  adaptUserMessage(message: string): Promise<AdaptedPrompt>;

  /**
   * Parse tool call from model response
   * @param chunk - Raw chunk from model
   * @returns Parsed tool call in standard format
   */
  parseToolCall(chunk: any): Promise<any>;
}

// ============================================================================
// MODEL-TO-ADAPTER MAPPING
// ============================================================================

/** Map of model patterns to adapter classes */
const MODEL_ADAPTER_MAP: Record<
  string,
  new (modelId: string, config?: PromptAdapterConfig) => PromptAdapter
> = {
  qwen: QwenAdapter,
  deepseek: DeepSeekAdapter,
  mistral: MistralAdapter,
  mixtral: MistralAdapter, // Mixtral uses same adapter as Mistral
  llama: LlamaAdapter,
};

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Get appropriate prompt adapter for a model
 *
 * Supports fuzzy matching:
 * - "qwen2.5-coder" → QwenAdapter
 * - "Qwen2.5-Coder-7B-Instruct" → QwenAdapter (case-insensitive)
 * - "qwen3-coder-30b-q4_k_m.gguf" → QwenAdapter (ignores suffixes)
 * - "unknown-model" → GenericAdapter (pass-through)
 *
 * @param modelId - Model identifier (from LMStudio, config, etc.)
 * @param config - Optional configuration overrides
 * @returns PromptAdapter instance for this model
 */
export function getPromptAdapter(
  modelId: string | undefined,
  config?: PromptAdapterConfig
): PromptAdapter {
  // Handle undefined/null model
  if (!modelId || modelId === "") {
    return new GenericAdapter("unknown", config);
  }

  const normalizedModelId = modelId.toLowerCase();

  // Try exact match first (fast path)
  for (const [pattern, AdapterClass] of Object.entries(MODEL_ADAPTER_MAP)) {
    if (normalizedModelId === pattern) {
      return new AdapterClass(modelId, config);
    }
  }

  // Try fuzzy match (contains pattern)
  for (const [pattern, AdapterClass] of Object.entries(MODEL_ADAPTER_MAP)) {
    if (normalizedModelId.includes(pattern)) {
      return new AdapterClass(modelId, config);
    }
  }

  // No match - use generic pass-through adapter
  return new GenericAdapter(modelId, config);
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate prompt size
 * @throws Error if prompt exceeds MAX_PROMPT_SIZE_BYTES
 */
export function validatePromptSize(prompt: string): void {
  const sizeBytes = Buffer.byteLength(prompt, "utf8");
  if (sizeBytes > MAX_PROMPT_SIZE_BYTES) {
    throw new Error(
      `Prompt size exceeds maximum allowed size (${sizeBytes} > ${MAX_PROMPT_SIZE_BYTES} bytes)`
    );
  }
}

/**
 * Validate prompt content
 * @throws Error if prompt is null or undefined
 */
export function validatePrompt(prompt: any): void {
  if (prompt === null || prompt === undefined) {
    throw new Error("Invalid prompt: prompt cannot be null or undefined");
  }
}

/**
 * Validate tools array
 * @throws Error if tools is invalid
 */
export function validateTools(tools: any): void {
  if (tools === null || tools === undefined) {
    throw new Error("Invalid tools: tools cannot be null or undefined");
  }

  if (!Array.isArray(tools)) {
    throw new Error("Invalid tools: tools must be an array");
  }

  if (tools.length > MAX_TOOLS) {
    throw new Error(`Too many tools: ${tools.length} > ${MAX_TOOLS}`);
  }

  // Validate each tool has required fields
  for (const tool of tools) {
    if (!tool.name || !tool.description || !tool.input_schema) {
      throw new Error(
        `Invalid tool schema: tool must have 'name', 'description', and 'input_schema' fields`
      );
    }
  }
}

/**
 * Validate user message size
 * @throws Error if message exceeds MAX_PROMPT_SIZE_BYTES
 */
export function validateMessageSize(message: string): void {
  const sizeBytes = Buffer.byteLength(message, "utf8");
  if (sizeBytes > MAX_PROMPT_SIZE_BYTES) {
    throw new Error(
      `Message size exceeds maximum allowed size (${sizeBytes} > ${MAX_PROMPT_SIZE_BYTES} bytes)`
    );
  }
}

/**
 * Validate tool call structure
 * @throws Error if tool call is malformed
 */
export function validateToolCall(toolCall: any): void {
  if (!toolCall || typeof toolCall !== "object") {
    throw new Error("Invalid tool call: must be an object");
  }

  // OpenAI format: { type: "function", function: { name, arguments } }
  if (toolCall.type === "function") {
    if (!toolCall.function || !toolCall.function.name) {
      throw new Error("Invalid tool call: function.name is required");
    }
  }
  // Anthropic format: { type: "tool_use", name, id, input }
  else if (toolCall.type === "tool_use") {
    if (!toolCall.name || !toolCall.id) {
      throw new Error("Invalid tool call: name and id are required");
    }
  }
  // Unknown format
  else {
    throw new Error(`Invalid tool call: unknown type '${toolCall.type}'`);
  }
}

/**
 * Check for circular references in object
 * @throws Error if circular reference detected
 */
export function checkCircularReference(obj: any, seen = new WeakSet()): void {
  if (obj && typeof obj === "object") {
    if (seen.has(obj)) {
      throw new Error("Circular reference detected in object");
    }

    seen.add(obj);

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        checkCircularReference(obj[key], seen);
      }
    }
  }
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

/**
 * Execute function with timeout
 * @param fn - Function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that rejects if timeout exceeded
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Adapter timeout exceeded")), timeoutMs)
    ),
  ]);
}
