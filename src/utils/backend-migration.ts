/**
 * Backend Migration Utilities
 *
 * Provides migration helpers for renaming 'lmstudio' backend to 'local'.
 * Supports backward compatibility with deprecation warnings.
 */

import { warnDeprecation } from "./deprecation-warnings";

/**
 * Get environment variable value with migration support
 *
 * Checks for new environment variable first, then falls back to old variable
 * with deprecation warning. This allows smooth migration from old to new naming.
 *
 * @param newVarName - New environment variable name (e.g., 'LOCAL_URL')
 * @param oldVarName - Old environment variable name (e.g., 'LMSTUDIO_URL')
 * @returns Environment variable value if set, undefined otherwise
 *
 * @example
 * // Only new var set:
 * getMigratedEnvVar('LOCAL_URL', 'LMSTUDIO_URL') // Returns new value, no warning
 *
 * // Only old var set:
 * getMigratedEnvVar('LOCAL_URL', 'LMSTUDIO_URL') // Returns old value, emits warning
 *
 * // Both set:
 * getMigratedEnvVar('LOCAL_URL', 'LMSTUDIO_URL') // Returns new value, no warning
 *
 * // Neither set:
 * getMigratedEnvVar('LOCAL_URL', 'LMSTUDIO_URL') // Returns undefined
 */
export function getMigratedEnvVar(newVarName: string, oldVarName: string): string | undefined {
  const newValue = process.env[newVarName];
  if (newValue !== undefined) {
    return newValue;
  }
  const oldValue = process.env[oldVarName];
  if (oldValue !== undefined) {
    warnDeprecation(oldVarName, newVarName);
    return oldValue;
  }
  return undefined;
}

/**
 * Get configuration value with migration support
 *
 * Checks for new config key first, then falls back to old key
 * with deprecation warning. This allows smooth migration from old to new naming.
 *
 * @param config - Configuration object
 * @param newKey - New configuration key (e.g., 'local')
 * @param oldKey - Old configuration key (e.g., 'lmstudio')
 * @returns Configuration value if exists, undefined otherwise
 *
 * @example
 * const config = { lmstudio: { url: 'http://localhost:1234' } };
 *
 * // Only old key exists:
 * getMigratedBackendConfig(config, 'local', 'lmstudio')
 * // Returns lmstudio config, emits warning
 *
 * // Both keys exist:
 * getMigratedBackendConfig(config, 'local', 'lmstudio')
 * // Returns local config, no warning
 */
export function getMigratedBackendConfig(config: any, newKey: string, oldKey: string): any {
  if (config && config[newKey] !== undefined) {
    return config[newKey];
  }
  if (config && config[oldKey] !== undefined) {
    warnDeprecation(`config.${oldKey}`, `config.${newKey}`);
    return config[oldKey];
  }
  return undefined;
}

/**
 * Normalize backend mode name
 *
 * Converts 'lmstudio' to 'local' with deprecation warning.
 * Handles case-insensitive input.
 *
 * @param mode - Backend mode name
 * @returns Normalized mode name (lowercase)
 *
 * @example
 * normalizeBackendMode('lmstudio') // Returns 'local', emits warning
 * normalizeBackendMode('LMSTUDIO') // Returns 'local', emits warning
 * normalizeBackendMode('local') // Returns 'local', no warning
 * normalizeBackendMode('claude') // Returns 'claude', no warning
 */
export function normalizeBackendMode(mode: string): string {
  const normalized = mode.toLowerCase();
  if (normalized === 'lmstudio') {
    warnDeprecation('ANYCLAUDE_MODE=lmstudio', 'ANYCLAUDE_MODE=local');
    return 'local';
  }
  return normalized;
}
