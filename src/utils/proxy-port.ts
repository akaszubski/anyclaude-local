/**
 * Proxy port configuration (Issue #77)
 */

/** Default proxy port - first port in the dynamic/private range */
export const DEFAULT_PROXY_PORT = 49152;

function isValidPort(port: number): boolean {
  return Number.isFinite(port) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Get the proxy port from environment variable, config, or default.
 * Priority: ANYCLAUDE_PORT env var > config.port > DEFAULT_PROXY_PORT
 */
export function getProxyPort(config: any): number {
  // Try env var first
  const envPort = process.env.ANYCLAUDE_PORT;
  if (envPort !== undefined && envPort !== "") {
    const parsed = parseInt(envPort.trim(), 10);
    if (isValidPort(parsed)) {
      return parsed;
    }
    // Invalid env var - fall through to config
  }

  // Try config.port
  if (config && config.port !== undefined && config.port !== null) {
    const port = typeof config.port === "string" ? parseInt(config.port, 10) : config.port;
    if (isValidPort(port)) {
      return port;
    }
  }

  return DEFAULT_PROXY_PORT;
}
