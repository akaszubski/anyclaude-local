import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type AnyclaudeMode =
  | "claude"
  | "lmstudio"
  | "openrouter"
  | "mlx-cluster";

export interface TraceRequest {
  method?: string;
  url?: string;
  headers: Record<string, any>;
  body: any;
}

export interface TraceResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: any;
}

export interface TraceData {
  timestamp: string;
  mode: AnyclaudeMode;
  request: TraceRequest;
  response?: TraceResponse;
}

/**
 * Get the trace directory path for the current mode
 */
export function getTraceDirectory(mode: AnyclaudeMode): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".anyclaude", "traces", mode);
}

/**
 * Ensure trace directory exists with proper permissions
 */
export function ensureTraceDirectory(mode: AnyclaudeMode): void {
  const traceDir = getTraceDirectory(mode);

  // Create directory recursively if it doesn't exist
  if (!fs.existsSync(traceDir)) {
    fs.mkdirSync(traceDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Sanitize sensitive data from headers and body
 */
function sanitizeData(data: any): any {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Redact API keys and sensitive headers
    if (
      lowerKey.includes("api-key") ||
      lowerKey.includes("api_key") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("authorization") ||
      lowerKey.includes("x-api-key")
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Write a trace file for a request/response pair
 */
export function writeTrace(
  mode: AnyclaudeMode,
  request: TraceRequest,
  response?: TraceResponse
): string | null {
  try {
    ensureTraceDirectory(mode);

    const timestamp = new Date().toISOString();
    const filenameTimestamp = timestamp.replace(/[:.]/g, "-");
    const traceDir = getTraceDirectory(mode);
    const filename = `${filenameTimestamp}.json`;
    const filepath = path.join(traceDir, filename);

    const traceData: TraceData = {
      timestamp,
      mode,
      request: {
        method: request.method,
        url: request.url,
        headers: sanitizeData(request.headers),
        body: sanitizeData(request.body),
      },
      response: response
        ? {
            statusCode: response.statusCode,
            headers: sanitizeData(response.headers),
            body: sanitizeData(response.body),
          }
        : undefined,
    };

    // Write file with restrictive permissions
    fs.writeFileSync(filepath, JSON.stringify(traceData, null, 2), {
      mode: 0o600,
      encoding: "utf8",
    });

    return filepath;
  } catch (error) {
    console.error("[TRACE] Failed to write trace file:", error);
    return null;
  }
}

/**
 * Log a trace and return the filepath
 */
export function logTrace(
  mode: AnyclaudeMode,
  request: TraceRequest,
  response?: TraceResponse
): void {
  const filepath = writeTrace(mode, request, response);
  if (filepath && process.env.ANYCLAUDE_DEBUG) {
    console.error(`[TRACE] Saved to: ${filepath}`);
  }
}

/**
 * Get all trace files for a given mode
 */
export function getTraceFiles(mode: AnyclaudeMode): string[] {
  try {
    const traceDir = getTraceDirectory(mode);

    if (!fs.existsSync(traceDir)) {
      return [];
    }

    return fs
      .readdirSync(traceDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(traceDir, file))
      .sort()
      .reverse(); // Most recent first
  } catch (error) {
    console.error("[TRACE] Failed to read trace directory:", error);
    return [];
  }
}

/**
 * Read a trace file
 */
export function readTrace(filepath: string): TraceData | null {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    return JSON.parse(content) as TraceData;
  } catch (error) {
    console.error(`[TRACE] Failed to read trace file ${filepath}:`, error);
    return null;
  }
}

/**
 * Clear all trace files for a given mode
 */
export function clearTraces(mode: AnyclaudeMode): number {
  try {
    const traceFiles = getTraceFiles(mode);
    let deletedCount = 0;

    for (const filepath of traceFiles) {
      try {
        fs.unlinkSync(filepath);
        deletedCount++;
      } catch (error) {
        console.error(`[TRACE] Failed to delete ${filepath}:`, error);
      }
    }

    return deletedCount;
  } catch (error) {
    console.error("[TRACE] Failed to clear traces:", error);
    return 0;
  }
}
