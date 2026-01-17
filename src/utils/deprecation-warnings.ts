/**
 * Deprecation Warning System
 *
 * Manages deprecation warnings for the 'lmstudio' to 'local' backend migration.
 * Implements deduplication to prevent warning spam (one warning per session per deprecated name).
 */

/**
 * Track warnings to prevent spam (one per session)
 */
const shownWarnings = new Set<string>();

/**
 * Emit a deprecation warning with tracking to prevent duplicates
 *
 * @param deprecatedName - The deprecated name (e.g., 'lmstudio', 'LMSTUDIO_URL')
 * @param replacementName - The new name to use instead (e.g., 'local', 'LOCAL_URL')
 * @param message - Optional custom message. If not provided, uses default format
 * @returns true if warning was emitted, false if already shown this session
 *
 * @example
 * warnDeprecation('lmstudio', 'local', 'Backend mode lmstudio is deprecated')
 * // First call: emits warning, returns true
 * // Subsequent calls: silent, returns false
 */
export function warnDeprecation(
  deprecatedName: string,
  replacementName: string,
  message?: string
): boolean {
  if (shownWarnings.has(deprecatedName)) {
    return false;
  }
  shownWarnings.add(deprecatedName);
  const msg =
    message ||
    `${deprecatedName} is deprecated, use ${replacementName} instead`;
  console.warn(`[DEPRECATED] ${msg}`);
  return true;
}

/**
 * Reset all warning tracking state
 *
 * Clears the set of shown warnings, allowing warnings to be re-emitted.
 * Primarily used for testing.
 *
 * @example
 * resetWarnings();
 * // All deprecation warnings can now be shown again
 */
export function resetWarnings(): void {
  shownWarnings.clear();
}
