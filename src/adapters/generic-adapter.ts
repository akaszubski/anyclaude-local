/**
 * Generic pass-through adapter (no modifications)
 *
 * Used as fallback for unknown models or when no optimization is needed.
 */

import { BaseAdapter } from "./base-adapter";
import type { PromptAdapterConfig } from "../prompt-adapter";

export class GenericAdapter extends BaseAdapter {
  public readonly adapterName = "GenericAdapter";

  constructor(modelId: string, config?: PromptAdapterConfig) {
    super(modelId, config);
  }

  protected async transformSystemPrompt(prompt: string) {
    return { content: prompt, transformations: [] as string[], optimizations: [] as string[] };
  }
}
