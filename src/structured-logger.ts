/**
 * Structured JSON logging module (Issue #60)
 *
 * Provides production-grade logging with:
 * - JSON format for log aggregators (ELK, Datadog, Splunk)
 * - Request correlation via X-Request-ID
 * - Automatic sensitive data redaction
 * - Backward compatible text format option
 */

import { randomUUID } from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  requestId?: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
}

// Global request context for correlation
let currentRequestId: string | undefined;

// Log format: json (default) or text (backward compatible)
const LOG_FORMAT = process.env.ANYCLAUDE_LOG_FORMAT || "json";

// Sensitive patterns to redact
const SENSITIVE_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-]+/g, // Anthropic API keys
  /sk-[a-zA-Z0-9_-]{20,}/g, // OpenAI-style keys (sk-proj-xxx, sk-xxx)
  /Bearer\s+[a-zA-Z0-9._-]+/gi, // Bearer tokens
  /api[_-]?key["\s:=]+["']?[a-zA-Z0-9-]+["']?/gi, // Generic API keys
  /authorization["\s:=]+["']?[a-zA-Z0-9._-]+["']?/gi, // Authorization headers
];

// Sensitive key names (for object key detection)
const SENSITIVE_KEY_PATTERNS = [
  "api_key",
  "apikey",
  "api-key",
  "x-api-key",
  "authorization",
  "token",
  "secret",
  "password",
  "bearer",
];

/**
 * Redact sensitive data from a string
 */
function redactSensitive(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Check if a key name is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(
    (pattern) => lowerKey === pattern || lowerKey.includes(pattern)
  );
}

/**
 * Redact sensitive data from an object recursively
 */
function redactObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return redactSensitive(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact known sensitive keys entirely
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Set the current request ID for correlation
 */
export function setRequestId(requestId: string | undefined): void {
  currentRequestId = requestId;
}

/**
 * Get the current request ID
 */
export function getRequestId(): string | undefined {
  return currentRequestId;
}

/**
 * Generate a new request ID if none provided
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Extract or generate request ID from headers
 */
export function extractRequestId(
  headers: Record<string, string | string[] | undefined>
): string {
  const existing =
    headers["x-request-id"] ||
    headers["X-Request-ID"] ||
    headers["X-Request-Id"];
  if (existing) {
    const value = Array.isArray(existing) ? existing[0] : existing;
    if (value) return value;
  }
  return generateRequestId();
}

/**
 * Format a log entry
 */
function formatLog(log: StructuredLog): string {
  if (LOG_FORMAT === "text") {
    // Backward compatible text format
    const parts = [
      `[${log.timestamp}]`,
      `[${log.level.toUpperCase()}]`,
      `[${log.component}]`,
    ];
    if (log.requestId) {
      parts.push(`[${log.requestId.slice(0, 8)}]`);
    }
    parts.push(log.message);
    if (log.error) {
      parts.push(`Error: ${log.error.message}`);
    }
    return parts.join(" ");
  }

  // JSON format (default) - only include requestId if present
  const output: Record<string, unknown> = {
    timestamp: log.timestamp,
    level: log.level,
    component: log.component,
    message: log.message,
  };
  if (log.requestId) {
    output.requestId = log.requestId;
  }
  if (log.context) {
    output.context = log.context;
  }
  if (log.error) {
    output.error = log.error;
  }
  return JSON.stringify(redactObject(output));
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message: redactSensitive(message),
    requestId: currentRequestId,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = redactObject(context) as Record<string, unknown>;
  }

  if (error) {
    entry.error = {
      message: redactSensitive(error.message),
      stack: error.stack ? redactSensitive(error.stack) : undefined,
    };
  }

  const formatted = formatLog(entry);

  // Output to appropriate stream
  if (level === "error") {
    process.stderr.write(formatted + "\n");
  } else {
    process.stdout.write(formatted + "\n");
  }
}

/**
 * Logger instance for a specific component
 */
export class Logger {
  constructor(private component: string) {}

  debug(message: string, context?: Record<string, unknown>): void {
    // Only log debug if ANYCLAUDE_DEBUG is set
    if (process.env.ANYCLAUDE_DEBUG) {
      log("debug", this.component, message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    log("info", this.component, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    log("warn", this.component, message, context);
  }

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): void {
    log("error", this.component, message, context, error);
  }
}

/**
 * Create a logger for a component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

// Pre-configured loggers for common components
export const proxyLogger = createLogger("anthropic-proxy");
export const circuitBreakerLogger = createLogger("circuit-breaker");
export const healthCheckLogger = createLogger("health-check");
