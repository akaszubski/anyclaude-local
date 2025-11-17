/**
 * Request Logger Module
 *
 * FIX #3: Logs all API requests to JSONL format for debugging and observability.
 * This provides visibility into what's happening when issues occur.
 *
 * Logs are written to: ~/.anyclaude/request-logs/YYYY-MM-DD.jsonl
 * Format: One JSON object per line (JSONL - JSON Lines format)
 *
 * Fields logged:
 * - timestamp: ISO 8601 timestamp when request was received
 * - systemSize: Byte size of system prompt
 * - toolCount: Number of tools in the request
 * - messageCount: Number of messages in the conversation
 * - streaming: Whether streaming was enabled
 * - provider: Backend provider (mlx, lmstudio, claude, openrouter)
 * - model: Model name/path
 */

import * as fs from "fs";
import * as path from "path";
import { debug } from "./debug";

export interface RequestLog {
  timestamp: string;
  systemSize: number;
  toolCount: number;
  messageCount: number;
  streaming: boolean;
  provider: string;
  model: string;
}

/**
 * Log a request to the JSONL request log file
 *
 * @param body - The request body object
 * @param provider - Backend provider name
 * @param model - Model name/path being used
 */
export function logRequest(
  body: Record<string, any>,
  provider: string,
  model: string
): void {
  try {
    // Build log entry
    const log: RequestLog = {
      timestamp: new Date().toISOString(),
      systemSize: body.system ? String(body.system).length : 0,
      toolCount: body.tools ? body.tools.length : 0,
      messageCount: body.messages ? body.messages.length : 0,
      streaming: body.stream || false,
      provider,
      model,
    };

    // Ensure log directory exists
    const logDir = path.join(
      process.env.HOME || "~",
      ".anyclaude",
      "request-logs"
    );
    fs.mkdirSync(logDir, { recursive: true });

    // Create date-based log file name (YYYY-MM-DD.jsonl)
    const now = new Date();
    const dateString = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const logFile = path.join(logDir, `${dateString}.jsonl`);

    // Append log entry as JSON line
    fs.appendFileSync(logFile, JSON.stringify(log) + "\n");

    debug(2, `[Request Logging] Logged request`, {
      systemSize: log.systemSize,
      toolCount: log.toolCount,
      streaming: log.streaming,
      provider,
      model,
    });
  } catch (error) {
    // Don't crash the request if logging fails
    // Just log the error and continue
    debug(
      1,
      `[Request Logging] Failed to log request:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Get the path to the current request log file
 * Useful for debugging and analysis
 */
export function getRequestLogPath(): string {
  const logDir = path.join(
    process.env.HOME || "~",
    ".anyclaude",
    "request-logs"
  );
  const now = new Date();
  const dateString = now.toISOString().split("T")[0];
  return path.join(logDir, `${dateString}.jsonl`);
}
