/**
 * Qwen-specific prompt adapter
 *
 * Optimizations for Qwen models (Qwen2.5-Coder, Qwen3, etc.):
 * - Bullet points for readability
 * - Tool hints to reinforce function calling
 * - Description limit: 200 characters
 */

import { BaseAdapter } from "./base-adapter";
import type { PromptAdapterConfig } from "../prompt-adapter";

const MAX_DESCRIPTION_LENGTH = 200;
const TOOL_CALLING_HINT =
  "\n\n**Tool Usage**: Use the provided tools by calling them with correct JSON arguments.";

export class QwenAdapter extends BaseAdapter {
  public readonly adapterName = "QwenAdapter";

  constructor(modelId: string, config?: PromptAdapterConfig) {
    super(modelId, config);
  }

  protected async transformSystemPrompt(prompt: string) {
    const transformations: string[] = [];
    const optimizations: string[] = [];

    // Convert paragraphs to bullet points for readability
    let result = this.convertToBulletPoints(prompt);
    transformations.push("bullet-points");
    optimizations.push("bullet-point-formatting");

    // Add tool calling hint
    if (this.config.preserveCriticalSections !== false) {
      result += TOOL_CALLING_HINT;
      transformations.push("tool-hint");
      optimizations.push("tool-calling-reinforcement");
    }

    // Truncate if configured
    if (this.config.maxPromptLength && result.length > this.config.maxPromptLength) {
      result = result.substring(0, this.config.maxPromptLength - 13) + "\n\n[Truncated]";
      transformations.push("truncate");
    }

    return { content: result, transformations, optimizations };
  }

  protected async transformTools(tools: any[]): Promise<any[]> {
    return tools.map((tool) => ({
      ...tool,
      description: this.truncateDescription(tool.description),
    }));
  }

  private convertToBulletPoints(text: string): string {
    return text
      .split("\n\n")
      .map((para) => {
        if (para.startsWith("-") || para.startsWith("#") || para.startsWith("*")) return para;
        if (para.length < 50) return para;
        return `- ${para}`;
      })
      .join("\n\n");
  }

  private truncateDescription(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
    const truncated = description.substring(0, MAX_DESCRIPTION_LENGTH);
    const lastPeriod = truncated.lastIndexOf(".");
    if (lastPeriod > MAX_DESCRIPTION_LENGTH / 2) return truncated.substring(0, lastPeriod + 1);
    return truncated.trim() + "...";
  }
}
