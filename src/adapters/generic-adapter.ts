/**
 * Generic pass-through adapter (no modifications)
 *
 * Used as fallback for unknown models or when no optimization is needed.
 * Implements PromptAdapter interface but returns content unchanged.
 */

import type {
  PromptAdapter,
  AdaptedPrompt,
  PromptAdapterConfig,
} from "../prompt-adapter";
import {
  validatePrompt,
  validatePromptSize,
  validateTools,
  validateMessageSize,
  validateToolCall,
} from "../prompt-adapter";

export class GenericAdapter implements PromptAdapter {
  public readonly modelId: string;
  public readonly adapterName = "GenericAdapter";
  private config: PromptAdapterConfig;

  constructor(modelId: string, config?: PromptAdapterConfig) {
    this.modelId = modelId;
    this.config = config || {};
  }

  async adaptSystemPrompt(prompt: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input
    validatePrompt(prompt);
    validatePromptSize(prompt);

    // Special case: empty prompt
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

    // Pass through unchanged
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
      },
    };
  }

  async adaptTools(tools: any[]): Promise<any[]> {
    // Validate input
    validateTools(tools);

    // Pass through unchanged
    return tools;
  }

  async adaptUserMessage(message: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input
    validatePrompt(message);
    validateMessageSize(message);

    // Pass through unchanged
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

    // Pass through unchanged
    return chunk;
  }
}
