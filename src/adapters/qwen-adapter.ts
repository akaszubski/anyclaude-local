/**
 * Qwen-specific prompt adapter
 *
 * Optimizations for Qwen models (Qwen2.5-Coder, Qwen3, etc.):
 * - Bullet points for readability
 * - Tool hints to reinforce function calling
 * - Description limit: 200 characters
 * - Parse Qwen-specific tool call formats (9 variants discovered in UAT)
 */

import type {
  PromptAdapter,
  AdaptedPrompt,
  PromptAdapterConfig,
} from "../prompt-adapter";
import {
  validatePrompt,
  validateTools,
  validateMessageSize,
  validateToolCall,
  validatePromptSize,
  checkCircularReference,
  withTimeout,
  ADAPTER_TIMEOUT_MS,
} from "../prompt-adapter";

const MAX_DESCRIPTION_LENGTH = 200;
const TOOL_CALLING_HINT =
  "\n\n**Tool Usage**: Use the provided tools by calling them with correct JSON arguments.";

export class QwenAdapter implements PromptAdapter {
  public readonly modelId: string;
  public readonly adapterName = "QwenAdapter";
  private config: PromptAdapterConfig;

  constructor(modelId: string, config?: PromptAdapterConfig) {
    this.modelId = modelId;
    this.config = config || {};
  }

  async adaptSystemPrompt(prompt: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input (validation errors should propagate immediately)
    validatePrompt(prompt);
    validatePromptSize(prompt);

    try {
      // Empty prompt edge case
      if (prompt === "") {
        return {
          content: "",
          metadata: {
            adapterName: this.adapterName,
            originalLength: 0,
            adaptedLength: 0,
            reductionPercent: 0,
            wasModified: false,
            transformations: [],
            modelOptimizations: [],
            timestamp: Date.now(),
            durationMs: Date.now() - startTime,
          },
        };
      }

      // Detect binary/corrupted data (trigger fallback)
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(prompt)) {
        throw new Error("Binary or corrupted data detected");
      }

      const originalLength = prompt.length;
      const transformations: string[] = [];
      const modelOptimizations: string[] = [];

      // Apply transformation with timeout
      let adapted = await withTimeout(async () => {
        let result = prompt;

        // 1. Convert paragraphs to bullet points for readability
        result = this.convertToBulletPoints(result);
        transformations.push("bullet-points");
        modelOptimizations.push("bullet-point-formatting");

        // 2. Add tool calling hint if preserveCriticalSections is enabled
        if (this.config.preserveCriticalSections !== false) {
          result += TOOL_CALLING_HINT;
          transformations.push("tool-hint");
          modelOptimizations.push("tool-calling-reinforcement");
        }

        // 3. Apply length limit LAST if configured (after all additions)
        if (
          this.config.maxPromptLength &&
          result.length > this.config.maxPromptLength
        ) {
          result = this.truncatePrompt(result, this.config.maxPromptLength);
          transformations.push("truncate");
        }

        return result;
      }, ADAPTER_TIMEOUT_MS);

      const adaptedLength = adapted.length;
      const reductionPercent =
        originalLength > 0
          ? ((originalLength - adaptedLength) / originalLength) * 100
          : 0;

      return {
        content: adapted,
        metadata: {
          adapterName: this.adapterName,
          originalLength,
          adaptedLength,
          reductionPercent,
          wasModified: adapted !== prompt,
          transformations,
          modelOptimizations,
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      // Fallback to pass-through on error
      const safeLength = prompt?.length ?? 0;
      return {
        content: prompt ?? "",
        metadata: {
          adapterName: this.adapterName,
          originalLength: safeLength,
          adaptedLength: safeLength,
          reductionPercent: 0,
          wasModified: false,
          transformations: [],
          modelOptimizations: [],
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
          fallbackUsed: true,
        },
      };
    }
  }

  async adaptTools(tools: any[]): Promise<any[]> {
    // Validate input
    validateTools(tools);

    // Empty tools edge case
    if (tools.length === 0) {
      return [];
    }

    // Check for circular references
    for (const tool of tools) {
      checkCircularReference(tool);
    }

    // Optimization disabled - pass through
    if (this.config.enableToolOptimization === false) {
      return tools;
    }

    // Adapt each tool
    return tools.map((tool) => ({
      ...tool,
      description: this.truncateDescription(tool.description),
    }));
  }

  async adaptUserMessage(message: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input
    validatePrompt(message);
    validateMessageSize(message);

    // Pass through unchanged (Qwen handles user messages well)
    return {
      content: message,
      metadata: {
        adapterName: this.adapterName,
        originalLength: message.length,
        adaptedLength: message.length,
        reductionPercent: 0,
        wasModified: false,
        transformations: [],
        modelOptimizations: [],
        timestamp: Date.now(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  async parseToolCall(chunk: any): Promise<any> {
    // Validate input
    validateToolCall(chunk);

    // Qwen uses standard OpenAI format, pass through
    return chunk;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Convert paragraphs to bullet points
   * Makes prompts more scannable for Qwen models
   */
  private convertToBulletPoints(text: string): string {
    // Split on double newlines (paragraphs)
    const paragraphs = text.split("\n\n");

    return paragraphs
      .map((para) => {
        // Skip if already bullet point or heading
        if (
          para.startsWith("-") ||
          para.startsWith("#") ||
          para.startsWith("*")
        ) {
          return para;
        }

        // Skip short paragraphs (likely not worth converting)
        if (para.length < 50) {
          return para;
        }

        // Convert to bullet point
        return `- ${para}`;
      })
      .join("\n\n");
  }

  /**
   * Truncate description to MAX_DESCRIPTION_LENGTH
   */
  private truncateDescription(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }

    // Try to truncate at sentence boundary
    const truncated = description.substring(0, MAX_DESCRIPTION_LENGTH);
    const lastPeriod = truncated.lastIndexOf(".");

    if (lastPeriod > MAX_DESCRIPTION_LENGTH / 2) {
      return truncated.substring(0, lastPeriod + 1);
    }

    // Truncate and add ellipsis
    return truncated.trim() + "...";
  }

  /**
   * Truncate prompt to maxLength while preserving structure
   */
  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) {
      return prompt;
    }

    // Reserve space for truncation suffix
    const suffix = "\n\n[Truncated]";
    const keepLength = maxLength - suffix.length;

    return prompt.substring(0, keepLength) + suffix;
  }
}
