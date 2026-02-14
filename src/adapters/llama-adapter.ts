/**
 * Llama-specific prompt adapter
 *
 * Optimizations for Llama models (Llama-3.3-70B, Meta-Llama-3.1, etc.):
 * - Flatten nested structures to depth 2 (Llama prefers flat schemas)
 * - Numbered steps for sequential tasks
 */

import { BaseAdapter } from "./base-adapter";
import type { PromptAdapterConfig } from "../prompt-adapter";

const MAX_SCHEMA_DEPTH = 2;

export class LlamaAdapter extends BaseAdapter {
  public readonly adapterName = "LlamaAdapter";

  constructor(modelId: string, config?: PromptAdapterConfig) {
    super(modelId, config);
  }

  protected async transformSystemPrompt(prompt: string) {
    const transformations: string[] = [];
    const optimizations: string[] = [];

    let result = this.convertToNumberedSteps(prompt);
    transformations.push("numbered-steps");
    optimizations.push("sequential-numbering");

    if (this.config.maxPromptLength && result.length > this.config.maxPromptLength) {
      const keepLength = Math.floor(this.config.maxPromptLength * 0.9);
      result = result.substring(0, keepLength) + "\n\n[Truncated]";
      transformations.push("truncate");
    }

    return { content: result, transformations, optimizations };
  }

  protected async transformTools(tools: any[]): Promise<any[]> {
    return tools.map((tool) => ({
      ...tool,
      input_schema: this.flattenSchema(tool.input_schema, 0),
    }));
  }

  private convertToNumberedSteps(text: string): string {
    const lines = text.split("\n");
    let stepCounter = 0;
    let inStepSequence = false;

    return lines
      .map((line) => {
        const isStep = /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line);
        if (isStep) {
          if (!inStepSequence) {
            inStepSequence = true;
            stepCounter = 1;
          } else {
            stepCounter++;
          }
          return line
            .replace(/^\s*[-*]\s+/, `${stepCounter}. `)
            .replace(/^\s*\d+\.\s+/, `${stepCounter}. `);
        } else {
          if (line.trim() === "") inStepSequence = false;
          return line;
        }
      })
      .join("\n");
  }

  private flattenSchema(schema: any, currentDepth: number): any {
    if (!schema || typeof schema !== "object") return schema;

    if (currentDepth >= MAX_SCHEMA_DEPTH) {
      if (schema.type === "object") {
        return { type: "string", description: `JSON object (flattened from depth ${currentDepth})` };
      }
      return schema;
    }

    if (schema.properties) {
      const flattened: any = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        flattened[key] = this.flattenSchema(value, currentDepth + 1);
      }
      return { ...schema, properties: flattened };
    }

    if (schema.items) {
      return { ...schema, items: this.flattenSchema(schema.items, currentDepth + 1) };
    }

    return schema;
  }
}
