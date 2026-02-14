/**
 * DeepSeek-specific prompt adapter
 *
 * Optimizations for DeepSeek models (DeepSeek-R1, DeepSeek-V3, etc.):
 * - Chain-of-thought preamble to encourage reasoning
 * - Detailed tool schemas (DeepSeek handles complexity well)
 * - Parse <think> tags for reasoning extraction
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

const COT_PREAMBLE =
  "\n\n**Reasoning Approach**: Think step-by-step before taking actions. Break down complex tasks into smaller steps.";

export class DeepSeekAdapter implements PromptAdapter {
  public readonly modelId: string;
  public readonly adapterName = "DeepSeekAdapter";
  private config: PromptAdapterConfig;

  constructor(modelId: string, config?: PromptAdapterConfig) {
    this.modelId = modelId;
    this.config = config || {};
  }

  async adaptSystemPrompt(prompt: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    try {
      // Validate input
      validatePrompt(prompt);
      validatePromptSize(prompt);

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

      const originalLength = prompt.length;
      const transformations: string[] = [];
      const modelOptimizations: string[] = [];

      // Apply transformation with timeout
      let adapted = await withTimeout(async () => {
        let result = prompt;

        // 1. Add chain-of-thought preamble if preserveCriticalSections is enabled
        if (this.config.preserveCriticalSections !== false) {
          result += COT_PREAMBLE;
          transformations.push("cot-preamble");
          modelOptimizations.push("chain-of-thought-reasoning");
        }

        // 2. Apply length limit if configured
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
        ((originalLength - adaptedLength) / originalLength) * 100;

      return {
        content: adapted,
        metadata: {
          adapterName: this.adapterName,
          originalLength,
          adaptedLength,
          reductionPercent: Math.max(0, reductionPercent),
          wasModified: adapted !== prompt,
          transformations,
          modelOptimizations,
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      // Fallback to pass-through on error
      return {
        content: prompt,
        metadata: {
          adapterName: this.adapterName,
          originalLength: prompt.length,
          adaptedLength: prompt.length,
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

    // DeepSeek handles complex schemas well - pass through unchanged
    // (enableToolOptimization has no effect for DeepSeek)
    return tools;
  }

  async adaptUserMessage(message: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input
    validatePrompt(message);
    validateMessageSize(message);

    // Pass through unchanged (DeepSeek handles user messages well)
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

    // DeepSeek may include <think> tags - extract actual tool call
    if (chunk.type === "function" && chunk.function?.arguments) {
      try {
        const args = chunk.function.arguments;

        // Check if arguments contain <think> tags
        if (typeof args === "string" && args.includes("<think>")) {
          // Extract content outside <think> tags
          const cleaned = args.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

          return {
            ...chunk,
            function: {
              ...chunk.function,
              arguments: cleaned,
            },
          };
        }
      } catch (error) {
        // If parsing fails, return original chunk
      }
    }

    // Pass through unchanged
    return chunk;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Truncate prompt to maxLength while preserving structure
   */
  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) {
      return prompt;
    }

    // Keep first part (critical instructions)
    const keepLength = Math.floor(maxLength * 0.9); // 90% of max
    return (
      prompt.substring(0, keepLength) + "\n\n[Prompt truncated for length]"
    );
  }
}
