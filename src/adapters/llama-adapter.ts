/**
 * Llama-specific prompt adapter
 *
 * Optimizations for Llama models (Llama-3.3-70B, Meta-Llama-3.1, etc.):
 * - Flatten nested structures to depth 2 (Llama prefers flat schemas)
 * - Numbered steps for sequential tasks
 * - [INST] format hints for better instruction following
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

const MAX_SCHEMA_DEPTH = 2;

export class LlamaAdapter implements PromptAdapter {
  public readonly modelId: string;
  public readonly adapterName = "LlamaAdapter";
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

        // 1. Convert to numbered steps
        result = this.convertToNumberedSteps(result);
        transformations.push("numbered-steps");
        modelOptimizations.push("sequential-step-format");

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

    // Optimization disabled - pass through
    if (this.config.enableToolOptimization === false) {
      return tools;
    }

    // Flatten schemas to max depth
    return tools.map((tool) => ({
      ...tool,
      input_schema: this.flattenSchema(tool.input_schema, 0),
    }));
  }

  async adaptUserMessage(message: string): Promise<AdaptedPrompt> {
    const startTime = Date.now();

    // Validate input
    validatePrompt(message);
    validateMessageSize(message);

    // Pass through unchanged (Llama handles user messages well)
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

    // Llama uses standard OpenAI format, pass through
    return chunk;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Convert text to numbered steps
   * Makes sequential tasks clearer for Llama
   */
  private convertToNumberedSteps(text: string): string {
    // Split on numbered patterns (1., 2., etc.)
    const lines = text.split("\n");
    let stepCounter = 0;
    let inStepSequence = false;

    const result = lines.map((line) => {
      // Detect if line is a step
      const isStep = /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line);

      if (isStep) {
        if (!inStepSequence) {
          inStepSequence = true;
          stepCounter = 1;
        } else {
          stepCounter++;
        }

        // Replace bullet/number with numbered step
        return line
          .replace(/^\s*[-*]\s+/, `${stepCounter}. `)
          .replace(/^\s*\d+\.\s+/, `${stepCounter}. `);
      } else {
        if (line.trim() === "") {
          inStepSequence = false;
        }
        return line;
      }
    });

    return result.join("\n");
  }

  /**
   * Flatten schema to maximum depth
   * Llama prefers flat schemas (depth ≤ 2)
   */
  private flattenSchema(schema: any, currentDepth: number): any {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    // At max depth - convert nested objects to string descriptions
    if (currentDepth >= MAX_SCHEMA_DEPTH) {
      if (schema.type === "object") {
        return {
          type: "string",
          description: `JSON object (flattened from depth ${currentDepth})`,
        };
      }
      return schema;
    }

    // Recursively flatten properties
    if (schema.properties) {
      const flattenedProperties: any = {};

      for (const [key, value] of Object.entries(schema.properties)) {
        flattenedProperties[key] = this.flattenSchema(value, currentDepth + 1);
      }

      return {
        ...schema,
        properties: flattenedProperties,
      };
    }

    // Handle arrays
    if (schema.items) {
      return {
        ...schema,
        items: this.flattenSchema(schema.items, currentDepth + 1),
      };
    }

    return schema;
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
