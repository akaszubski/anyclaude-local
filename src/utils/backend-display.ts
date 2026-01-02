/**
 * Backend Display Utilities
 *
 * Provides user-friendly display names and log prefixes for different backend modes.
 * Ensures consistent backend naming throughout the application.
 */

import type { AnyclaudeMode } from "../trace-logger";

/**
 * Backend display name mappings
 *
 * Maps internal mode identifiers to user-friendly display names.
 */
const BACKEND_DISPLAY_NAMES: Record<AnyclaudeMode, string> = {
  claude: "Claude",
  local: "Local",
  lmstudio: "LMStudio",
  openrouter: "OpenRouter",
  "mlx-cluster": "MLX Cluster",
};

/**
 * Get user-friendly display name for a backend mode
 *
 * @param mode - The backend mode identifier
 * @returns Display name for the backend (e.g., "LMStudio", "Claude")
 *
 * @example
 * getBackendDisplayName('lmstudio') // Returns: "LMStudio"
 * getBackendDisplayName('mlx-cluster') // Returns: "MLX Cluster"
 * getBackendDisplayName('invalid' as AnyclaudeMode) // Returns: "Unknown Backend"
 */
export function getBackendDisplayName(mode: AnyclaudeMode): string {
  return BACKEND_DISPLAY_NAMES[mode] || "Unknown Backend";
}

/**
 * Get bracketed log prefix for a backend mode
 *
 * @param mode - The backend mode identifier
 * @returns Bracketed display name for logging (e.g., "[LMStudio]", "[Claude]")
 *
 * @example
 * getBackendLogPrefix('openrouter') // Returns: "[OpenRouter]"
 * getBackendLogPrefix('claude') // Returns: "[Claude]"
 *
 * Usage in logs:
 * console.log(`${getBackendLogPrefix(mode)} Request received`);
 * // Output: "[LMStudio] Request received"
 */
export function getBackendLogPrefix(mode: AnyclaudeMode): string {
  return `[${getBackendDisplayName(mode)}]`;
}
