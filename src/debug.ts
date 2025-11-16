import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Store error messages to display later
let pendingErrorMessages: string[] = [];

// File stream for debug logging
let debugLogStream: fs.WriteStream | null = null;
let debugLogPath: string | null = null;

export interface DebugInfo {
  statusCode: number;
  request: {
    method?: string;
    url?: string;
    headers: any;
    body: any;
  };
  response?: {
    statusCode: number;
    headers: any;
    body: string;
  };
}

/**
 * Write debug info to a temp file when ANYCLAUDE_DEBUG is set
 * @returns The path to the debug file, or null if not written
 */
export function writeDebugToTempFile(
  statusCode: number,
  request: DebugInfo["request"],
  response?: DebugInfo["response"]
): string | null {
  // Log 4xx errors (except 429) when ANYCLAUDE_DEBUG is set
  const debugEnabled = process.env.ANYCLAUDE_DEBUG;

  if (
    !debugEnabled ||
    statusCode === 429 ||
    statusCode < 400 ||
    statusCode >= 500
  ) {
    return null;
  }

  try {
    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `anyclaude-debug-${timestamp}-${randomId}.json`;
    const filepath = path.join(tmpDir, filename);

    const debugData = {
      timestamp: new Date().toISOString(),
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      },
      response: response || null,
    };

    fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2), "utf8");

    // Also write a simpler error log file that's easier to tail
    const errorLogPath = path.join(tmpDir, "anyclaude-errors.log");
    const errorMessage = `[${new Date().toISOString()}] HTTP ${statusCode} - Debug: ${filepath}\n`;
    fs.appendFileSync(errorLogPath, errorMessage, "utf8");

    return filepath;
  } catch (error) {
    console.error("[ANYCLAUDE DEBUG] Failed to write debug file:", error);
    return null;
  }
}

/**
 * Queue an error message to be displayed later
 */
export function queueErrorMessage(message: string): void {
  pendingErrorMessages.push(message);
  // Display after a short delay to avoid being overwritten
  setTimeout(displayPendingErrors, 500);
}

/**
 * Display pending error messages to stderr with formatting
 */
function displayPendingErrors(): void {
  if (pendingErrorMessages.length > 0) {
    // Use stderr and add newlines to separate from Claude's output
    process.stderr.write("\n\n═══════════════════════════════════════\n");
    process.stderr.write("ANYCLAUDE DEBUG - Errors detected:\n");
    process.stderr.write("═══════════════════════════════════════\n");
    pendingErrorMessages.forEach((msg) => {
      process.stderr.write(msg + "\n");
    });
    process.stderr.write("═══════════════════════════════════════\n\n");
    pendingErrorMessages = [];
  }
}

/**
 * Log a debug error and queue it for display
 */
export function logDebugError(
  type: "HTTP" | "Provider" | "Streaming",
  statusCode: number,
  debugFile: string | null,
  context?: { provider?: string; model?: string }
): void {
  if (!debugFile) return;

  let message = `${type} error`;
  if (context?.provider && context?.model) {
    message += ` (${context.provider}/${context.model})`;
  } else if (statusCode) {
    message += ` ${statusCode}`;
  }
  message += ` - Debug info written to: ${debugFile}`;

  queueErrorMessage(message);
}

/**
 * Initialize debug log file if debug mode is enabled
 */
function initializeDebugLog(): void {
  if (debugLogStream) return; // Already initialized

  const level = getDebugLevel();
  if (level === 0) return; // Debug not enabled

  try {
    // Create ~/.anyclaude/logs directory if it doesn't exist
    const homeDir = os.homedir();
    const logsDir = path.join(homeDir, ".anyclaude", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const filename = `debug-session-${timestamp}.log`;
    debugLogPath = path.join(logsDir, filename);

    // Open write stream
    debugLogStream = fs.createWriteStream(debugLogPath, { flags: "a" });

    // Write header
    debugLogStream.write("═".repeat(60) + "\n");
    debugLogStream.write(`ANYCLAUDE DEBUG SESSION - Level ${level}\n`);
    debugLogStream.write(`Started: ${new Date().toISOString()}\n`);
    debugLogStream.write("═".repeat(60) + "\n\n");

    // Ensure log is flushed on exit
    process.on("exit", closeDebugLog);
    process.on("SIGINT", () => {
      closeDebugLog();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      closeDebugLog();
      process.exit(0);
    });
  } catch (error) {
    console.error("[ANYCLAUDE] Failed to initialize debug log:", error);
  }
}

/**
 * Close debug log file and write footer
 */
function closeDebugLog(): void {
  if (debugLogStream) {
    debugLogStream.write("\n" + "═".repeat(60) + "\n");
    debugLogStream.write(`Session ended: ${new Date().toISOString()}\n`);
    debugLogStream.write("═".repeat(60) + "\n");
    debugLogStream.end();
    debugLogStream = null;
  }
}

/**
 * Get the current debug log file path
 */
export function getDebugLogPath(): string | null {
  return debugLogPath;
}

/**
 * Log session context (backend, model, config) to debug file
 */
export function logSessionContext(context: {
  mode: string;
  model: string;
  backendUrl?: string;
  proxyUrl: string;
  config?: Record<string, any>;
}): void {
  if (!debugLogStream) {
    initializeDebugLog();
  }

  if (debugLogStream) {
    debugLogStream.write("\n" + "─".repeat(60) + "\n");
    debugLogStream.write("SESSION CONFIGURATION\n");
    debugLogStream.write("─".repeat(60) + "\n");
    debugLogStream.write(`Backend Mode: ${context.mode}\n`);
    debugLogStream.write(`Model: ${context.model}\n`);
    if (context.backendUrl) {
      debugLogStream.write(`Backend URL: ${context.backendUrl}\n`);
    }
    debugLogStream.write(`Proxy URL: ${context.proxyUrl}\n`);
    if (context.config) {
      debugLogStream.write(`\nConfiguration:\n`);
      debugLogStream.write(JSON.stringify(context.config, null, 2) + "\n");
    }
    debugLogStream.write("─".repeat(60) + "\n\n");
  }
}

/**
 * Display debug mode startup message
 */
export function displayDebugStartup(): void {
  const level = getDebugLevel();
  if (level > 0) {
    initializeDebugLog(); // Initialize log file

    // Only show log file path, keep screen clean
    if (debugLogPath) {
      process.stderr.write(`[anyclaude] Debug mode (level ${level}): ${debugLogPath}\n`);
    }
  }
}

/**
 * Check if debug mode is enabled
 */
/**
 * Get the debug level from ANYCLAUDE_DEBUG environment variable
 * Returns 0 if not set, 1 for basic debug, 2 for verbose debug, 3 for trace (tool schemas)
 * Defaults to 1 if unrecognized string is passed
 */
export function getDebugLevel(): number {
  const debugValue = process.env.ANYCLAUDE_DEBUG;
  if (!debugValue) return 0;

  const level = parseInt(debugValue, 10);
  if (isNaN(level)) return 1; // Default to level 1 for any non-numeric value

  return Math.max(0, Math.min(3, level)); // Clamp to 0-3 range
}

export function isDebugEnabled(): boolean {
  return getDebugLevel() > 0;
}

/**
 * Check if verbose debug mode (level 2) is enabled
 */
export function isVerboseDebugEnabled(): boolean {
  return getDebugLevel() >= 2;
}

/**
 * Check if trace debug mode (level 3) is enabled
 * This logs EVERYTHING including full tool schemas
 */
export function isTraceDebugEnabled(): boolean {
  return getDebugLevel() >= 3;
}

/**
 * Log a debug message at the specified level
 * @param level - Minimum debug level required to show this message (1, 2, or 3)
 * @param message - The message to log
 * @param data - Optional data to append to the message
 */
export function debug(level: 1 | 2 | 3, message: string, data?: any): void {
  if (getDebugLevel() >= level) {
    // Initialize log file if not already done
    if (!debugLogStream) {
      initializeDebugLog();
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [ANYCLAUDE DEBUG]`;

    let logMessage: string;
    if (data !== undefined) {
      // For level 3 (trace), show full objects without truncation
      // For levels 1-2, limit output length
      const dataStr =
        typeof data === "object"
          ? JSON.stringify(data, null, level >= 3 ? 2 : 0).substring(
              0,
              level >= 3 ? Infinity : 500
            )
          : String(data);
      logMessage = `${prefix} ${message} ${dataStr}\n`;
    } else {
      logMessage = `${prefix} ${message}\n`;
    }

    // Write to file only, never to screen
    if (debugLogStream) {
      debugLogStream.write(logMessage);
    }
    // Don't fallback to stderr - debug output stays in log file only
  }
}
