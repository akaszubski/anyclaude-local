/**
 * Mistral-specific prompt adapter
 *
 * Optimizations for Mistral models (Mistral-7B, Mixtral-8x7B, etc.):
 * - Aggressive conciseness (Mistral prefers short prompts)
 * - 100 character description limit
 * - Imperative style ("Do X" instead of "You should do X")
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

const MAX_DESCRIPTION_LENGTH = 100;

export class MistralAdapter implements PromptAdapter {
  public readonly modelId: string;
  public readonly adapterName = "MistralAdapter";
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

        // 1. Convert to imperative style
        result = this.convertToImperative(result);
        transformations.push("imperative-style");
        modelOptimizations.push("concise-imperative-format");

        // 2. Remove verbose explanations
        result = this.removeVerboseExplanations(result);
        transformations.push("remove-verbose");
        modelOptimizations.push("aggressive-conciseness");

        // 3. Apply length limit if configured
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

    // Pass through unchanged (Mistral handles user messages well)
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

    // Mistral uses standard OpenAI format, pass through
    return chunk;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Convert text to imperative style
   * "You should do X" → "Do X"
   */
  private convertToImperative(text: string): string {
    let result = text;

    // Replace common passive patterns
    result = result.replace(/You should /g, "");
    result = result.replace(/You must /g, "");
    result = result.replace(/You need to /g, "");
    result = result.replace(/You can /g, "");
    result = result.replace(/Please /g, "");

    return result;
  }

  /**
   * Remove verbose explanations
   * Keep only essential instructions
   */
  private removeVerboseExplanations(text: string): string {
    // Remove sentences with explanatory phrases
    const verbosePatterns = [
      /This is important because[^.]+\./g,
      /Note that[^.]+\./g,
      /Keep in mind that[^.]+\./g,
      /Remember that[^.]+\./g,
      /For example,[^.]+\./g,
    ];

    let result = text;
    for (const pattern of verbosePatterns) {
      result = result.replace(pattern, "");
    }

    // Clean up extra whitespace
    result = result.replace(/\n\n\n+/g, "\n\n");

    return result;
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

    // Keep first part (critical instructions)
    const keepLength = Math.floor(maxLength * 0.9); // 90% of max
    return prompt.substring(0, keepLength) + "\n\n[Truncated]";
  }
}
