/**
 * Unit tests for structured JSON logging (Issue #60)
 */

import {
  Logger,
  createLogger,
  setRequestId,
  getRequestId,
  generateRequestId,
  extractRequestId,
} from "../../src/structured-logger";

describe("Structured Logger", () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    stdoutOutput = [];
    stderrOutput = [];
    originalEnv = { ...process.env };

    // Mock stdout/stderr
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutOutput.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrOutput.push(chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    // Clear request ID
    setRequestId(undefined);

    // Enable debug logging for tests
    process.env.ANYCLAUDE_DEBUG = "1";
    // Use JSON format
    delete process.env.ANYCLAUDE_LOG_FORMAT;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.env = originalEnv;
  });

  describe("Request ID Management", () => {
    test("should generate unique request IDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      // UUID format check
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test("should set and get request ID", () => {
      expect(getRequestId()).toBeUndefined();

      setRequestId("test-request-123");
      expect(getRequestId()).toBe("test-request-123");

      setRequestId(undefined);
      expect(getRequestId()).toBeUndefined();
    });

    test("should extract X-Request-ID from headers", () => {
      const headers1 = { "x-request-id": "existing-id" };
      expect(extractRequestId(headers1)).toBe("existing-id");

      const headers2 = { "X-Request-ID": "capital-id" };
      expect(extractRequestId(headers2)).toBe("capital-id");
    });

    test("should generate ID if not in headers", () => {
      const headers = { "content-type": "application/json" };
      const id = extractRequestId(headers);

      expect(id).toBeDefined();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test("should handle array header values", () => {
      const headers = { "x-request-id": ["first-id", "second-id"] };
      expect(extractRequestId(headers)).toBe("first-id");
    });
  });

  describe("Logger Class", () => {
    test("should create logger with component name", () => {
      const logger = createLogger("test-component");
      expect(logger).toBeInstanceOf(Logger);
    });

    test("should output JSON format by default", () => {
      const logger = createLogger("test");
      logger.info("Test message");

      expect(stdoutOutput.length).toBe(1);
      const log = JSON.parse(stdoutOutput[0]);
      expect(log.level).toBe("info");
      expect(log.component).toBe("test");
      expect(log.message).toBe("Test message");
      expect(log.timestamp).toBeDefined();
    });

    test("should include context in log", () => {
      const logger = createLogger("test");
      logger.info("Test with context", { key: "value", count: 42 });

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context).toEqual({ key: "value", count: 42 });
    });

    test("should include request ID when set", () => {
      setRequestId("req-123");
      const logger = createLogger("test");
      logger.info("Test message");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.requestId).toBe("req-123");
    });

    test("should output error logs to stderr", () => {
      const logger = createLogger("test");
      logger.error("Error message");

      expect(stderrOutput.length).toBe(1);
      expect(stdoutOutput.length).toBe(0);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.level).toBe("error");
    });

    test("should include error details when provided", () => {
      const logger = createLogger("test");
      const error = new Error("Something went wrong");
      logger.error("Operation failed", error);

      const log = JSON.parse(stderrOutput[0]);
      expect(log.error).toBeDefined();
      expect(log.error.message).toBe("Something went wrong");
      expect(log.error.stack).toBeDefined();
    });

    test("should only log debug when ANYCLAUDE_DEBUG is set", () => {
      const logger = createLogger("test");

      // Debug should log when enabled
      logger.debug("Debug message");
      expect(stdoutOutput.length).toBe(1);

      // Clear and disable debug
      stdoutOutput = [];
      delete process.env.ANYCLAUDE_DEBUG;

      logger.debug("Hidden debug");
      expect(stdoutOutput.length).toBe(0);
    });
  });

  describe("Sensitive Data Redaction", () => {
    test("should redact Anthropic API keys", () => {
      const logger = createLogger("test");
      logger.info("Key: sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.message).not.toContain("sk-ant-api03");
      expect(log.message).toContain("[REDACTED]");
    });

    test("should redact OpenAI-style API keys", () => {
      const logger = createLogger("test");
      logger.info("Key: sk-proj-abcdefghijklmnopqrstuvwxyz");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.message).not.toContain("sk-proj");
      expect(log.message).toContain("[REDACTED]");
    });

    test("should redact Bearer tokens", () => {
      const logger = createLogger("test");
      logger.info("Authorization: Bearer my-secret-token-123");

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.message).not.toContain("my-secret-token");
      expect(log.message).toContain("[REDACTED]");
    });

    test("should redact sensitive keys in context", () => {
      const logger = createLogger("test");
      logger.info("Request", {
        api_key: "secret-key-value",
        authorization: "Bearer token",
        normal_key: "visible-value",
      });

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.api_key).toBe("[REDACTED]");
      expect(log.context.authorization).toBe("[REDACTED]");
      expect(log.context.normal_key).toBe("visible-value");
    });

    test("should redact nested sensitive data", () => {
      const logger = createLogger("test");
      logger.info("Config", {
        headers: {
          "x-api-key": "nested-secret",
          "content-type": "application/json",
        },
      });

      const log = JSON.parse(stdoutOutput[0]);
      expect(log.context.headers["x-api-key"]).toBe("[REDACTED]");
      expect(log.context.headers["content-type"]).toBe("application/json");
    });
  });

  describe("Log Levels", () => {
    test("should support all log levels", () => {
      const logger = createLogger("test");

      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      // Debug and info to stdout
      expect(stdoutOutput.length).toBe(3); // debug, info, warn
      // Error to stderr
      expect(stderrOutput.length).toBe(1);

      expect(JSON.parse(stdoutOutput[0]).level).toBe("debug");
      expect(JSON.parse(stdoutOutput[1]).level).toBe("info");
      expect(JSON.parse(stdoutOutput[2]).level).toBe("warn");
      expect(JSON.parse(stderrOutput[0]).level).toBe("error");
    });
  });
});
