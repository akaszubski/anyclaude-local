/**
 * Resolve executable paths by checking known locations (Issue #76)
 */

import * as fs from "fs";
import * as os from "os";

/** Known paths for Docker executable */
export const DOCKER_KNOWN_PATHS = [
  "/usr/local/bin/docker",
  "/usr/bin/docker",
  "/opt/homebrew/bin/docker",
];

/** Known paths for Bun executable */
export const BUN_KNOWN_PATHS = [
  "/usr/local/bin/bun",
  "/opt/homebrew/bin/bun",
  "~/.bun/bin/bun",
];

/**
 * Resolve an executable by checking known filesystem paths.
 * Returns the first found absolute path, or the bare command name as fallback.
 */
export function resolveExecutable(name: string, knownPaths: string[]): string {
  if (!knownPaths || !Array.isArray(knownPaths)) {
    return name;
  }

  for (const p of knownPaths) {
    const expanded = p.startsWith("~/")
      ? os.homedir() + p.slice(1)
      : p;

    if (fs.existsSync(expanded)) {
      return expanded;
    }
  }

  return name;
}
