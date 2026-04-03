/**
 * Tool allowlist filter for local models (Issue #83)
 *
 * Filters the tool list to only those included in the configured allowlist.
 * This reduces token usage by preventing irrelevant tools from being sent to
 * local models that may not handle large tool lists well.
 */

export interface FilterToolsResult {
  filtered: any[];
  removedCount: number;
}

/**
 * Filter tools to only those in the allowlist.
 *
 * Matching is case-insensitive against tool.name.
 *
 * @param tools - Array of tool objects (each must have a `name` field)
 * @param allowlist - Array of allowed tool names. When `undefined` or `null`,
 *   all tools are returned unchanged. When empty (`[]`), no tools are returned.
 * @returns Object with filtered tool array and count of removed tools.
 */
export function filterToolsByAllowlist(
  tools: any[],
  allowlist: string[] | undefined | null
): FilterToolsResult {
  // No allowlist configured — pass all tools through unchanged
  if (allowlist === undefined || allowlist === null) {
    return { filtered: tools, removedCount: 0 };
  }

  // Build a lowercase set for O(1) lookup
  const allowedNames = new Set(allowlist.map((name) => name.toLowerCase()));

  const filtered = tools.filter((tool) => {
    const toolName: string = typeof tool?.name === "string" ? tool.name : "";
    return allowedNames.has(toolName.toLowerCase());
  });

  return {
    filtered,
    removedCount: tools.length - filtered.length,
  };
}
