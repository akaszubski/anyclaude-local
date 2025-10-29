import { debug } from "./debug";
import { LMStudioClient } from "./lmstudio-client";

// Re-export for backwards compatibility
export type { ModelInfo as LMStudioModelInfo } from "./lmstudio-client";

/**
 * Get the currently loaded model from LMStudio
 * @deprecated Use LMStudioClient.getLoadedModel() instead
 */
export async function getLoadedModel(lmstudioUrl: string): Promise<any | null> {
  const client = new LMStudioClient(lmstudioUrl);

  try {
    debug(
      1,
      `[LMStudio] Querying model info from: ${lmstudioUrl}/api/v0/models`
    );

    const model = await client.getLoadedModel();

    if (!model) {
      debug(1, `[LMStudio] No model currently loaded`);
      return null;
    }

    const contextLength =
      model.loaded_context_length || model.max_context_length || 0;
    debug(
      1,
      `[LMStudio] Loaded model: ${model.id} | Context: ${contextLength.toLocaleString()} tokens`
    );

    return model;
  } catch (error) {
    debug(
      1,
      `[LMStudio] Failed to query model info:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Get the context length for the currently loaded model
 * @deprecated Use LMStudioClient.getContextLength() instead
 */
export async function getModelContextLength(
  lmstudioUrl: string
): Promise<number | null> {
  const client = new LMStudioClient(lmstudioUrl);
  return client.getContextLength();
}
