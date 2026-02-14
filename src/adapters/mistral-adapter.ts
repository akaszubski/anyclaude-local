/**
 * Mistral-specific prompt adapter
 *
 * Optimizations for Mistral models (Mistral-7B, Mixtral-8x7B, etc.):
 * - Aggressive conciseness (Mistral prefers short prompts)
 * - 100 character description limit
 * - Imperative style ("Do X" instead of "You should do X")
 */

import { BaseAdapter } from "./base-adapter";
import type { PromptAdapterConfig } from "../prompt-adapter";

const MAX_DESCRIPTION_LENGTH = 100;

export class MistralAdapter extends BaseAdapter {
  public readonly adapterName = "MistralAdapter";

  constructor(modelId: string, config?: PromptAdapterConfig) {
    super(modelId, config);
  }

  protected async transformSystemPrompt(prompt: string) {
    const transformations: string[] = [];
    const optimizations: string[] = [];

    let result = this.convertToImperative(prompt);
    transformations.push("imperative-style");
    optimizations.push("concise-imperative");

    result = this.removeVerboseExplanations(result);
    transformations.push("remove-verbose");
    optimizations.push("explanation-removal");

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
      description: this.truncateDescription(tool.description),
    }));
  }

  private convertToImperative(text: string): string {
    return text
      .replace(/You should /g, "")
      .replace(/You must /g, "")
      .replace(/You need to /g, "")
      .replace(/You can /g, "")
      .replace(/Please /g, "");
  }

  private removeVerboseExplanations(text: string): string {
    const patterns = [
      /This is important because[^.]+\./g,
      /Note that[^.]+\./g,
      /Keep in mind that[^.]+\./g,
      /Remember that[^.]+\./g,
      /For example,[^.]+\./g,
    ];
    let result = text;
    for (const pattern of patterns) result = result.replace(pattern, "");
    return result.replace(/\n\n\n+/g, "\n\n");
  }

  private truncateDescription(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
    const truncated = description.substring(0, MAX_DESCRIPTION_LENGTH);
    const lastPeriod = truncated.lastIndexOf(".");
    if (lastPeriod > MAX_DESCRIPTION_LENGTH / 2) return truncated.substring(0, lastPeriod + 1);
    return truncated.trim() + "...";
  }
}
