/**
 * Base adapter with shared boilerplate for all model-specific adapters.
 *
 * Subclasses override `transformSystemPrompt` and optionally `transformTools`
 * to provide model-specific behavior. All validation, metadata, error handling,
 * and pass-through methods are handled here.
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

export abstract class BaseAdapter implements PromptAdapter {
  public readonly modelId: string;
  public abstract readonly adapterName: string;
  protected config: PromptAdapterConfig;

  constructor(modelId: string, config?: PromptAdapterConfig) {
    this.modelId = modelId;
    this.config = config || {};
  }

  /**
   * Override this to apply model-specific system prompt transformations.
   * Return the transformed prompt and list of transformation names applied.
   */
  protected abstract transformSystemPrompt(
    prompt: string
  ): Promise<{ content: string; transformations: string[]; optimizations: string[] }>;

  /**
   * Override this to apply model-specific tool adaptations.
   * Default: pass through unchanged.
   */
  protected async transformTools(tools: any[]): Promise<any[]> {
    return tools;
  }

  async adaptSystemPrompt(prompt: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();
    validatePrompt(prompt);
    validatePromptSize(prompt);

    if (prompt === "") {
      return this.makeResult("", 0, false, [], [], startTime);
    }

    // Detect binary/corrupted data
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(prompt)) {
      return this.makeResult(prompt, prompt.length, false, [], [], startTime, true);
    }

    try {
      const result = await withTimeout(
        () => this.transformSystemPrompt(prompt),
        ADAPTER_TIMEOUT_MS
      );
      return this.makeResult(
        result.content,
        prompt.length,
        result.content !== prompt,
        result.transformations,
        result.optimizations,
        startTime
      );
    } catch {
      return this.makeResult(prompt, prompt.length, false, [], [], startTime, true);
    }
  }

  async adaptTools(tools: any[]): Promise<any[]> {
    validateTools(tools);
    if (tools.length === 0) return [];
    for (const tool of tools) checkCircularReference(tool);
    if (this.config.enableToolOptimization === false) return tools;
    return this.transformTools(tools);
  }

  async adaptUserMessage(message: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();
    validatePrompt(message);
    validateMessageSize(message);
    return this.makeResult(message, message.length, false, [], [], startTime);
  }

  async parseToolCall(chunk: any): Promise<any> {
    validateToolCall(chunk);
    return chunk;
  }

  private makeResult(
    content: string,
    originalLength: number,
    wasModified: boolean,
    transformations: string[],
    modelOptimizations: string[],
    startTime: number,
    fallbackUsed?: boolean
  ): AdaptedPrompt {
    return {
      content,
      metadata: {
        adapterName: this.adapterName,
        originalLength,
        adaptedLength: content.length,
        reductionPercent:
          originalLength > 0
            ? ((originalLength - content.length) / originalLength) * 100
            : 0,
        wasModified,
        transformations,
        modelOptimizations,
        timestamp: Date.now(),
        durationMs: Date.now() - startTime,
        ...(fallbackUsed ? { fallbackUsed: true } : {}),
      },
    };
  }
}
