/**
 * Unit tests for trace logger
 *
 * Tests:
 * - Trace directory creation
 * - Trace file writing
 * - API key sanitization
 * - File permissions
 * - Trace file reading
 * - Trace file clearing
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// We'll import the trace logger functions directly
// Note: This requires the TypeScript to be compiled or using ts-node
let traceLogger;
try {
  // Try to load from compiled JS
  traceLogger = require("../../dist/trace-logger.cjs");
} catch (e) {
  try {
    // Try to load from TypeScript source with ts-node
    require("ts-node/register");
    traceLogger = require("../../src/trace-logger.ts");
  } catch (e2) {
    console.error(
      "Failed to load trace-logger. Make sure to build the project first or install ts-node."
    );
    process.exit(1);
  }
}

const {
  getTraceDirectory,
  ensureTraceDirectory,
  writeTrace,
  getTraceFiles,
  readTrace,
  clearTraces,
} = traceLogger;

function test_trace_directory_path() {
  console.log("Testing: Trace directory path generation...");

  const claudeDir = getTraceDirectory("claude");
  const expectedClaude = path.join(
    os.homedir(),
    ".anyclaude",
    "traces",
    "claude"
  );
  assert.strictEqual(claudeDir, expectedClaude, "Claude trace directory path");

  const lmstudioDir = getTraceDirectory("lmstudio");
  const expectedLmstudio = path.join(
    os.homedir(),
    ".anyclaude",
    "traces",
    "lmstudio"
  );
  assert.strictEqual(
    lmstudioDir,
    expectedLmstudio,
    "LMStudio trace directory path"
  );

  console.log("✓ Trace directory paths are correct");
}

function test_trace_directory_creation() {
  console.log("Testing: Trace directory creation...");

  const testMode = "claude";
  const traceDir = getTraceDirectory(testMode);

  // Clean up first
  if (fs.existsSync(traceDir)) {
    fs.rmSync(traceDir, { recursive: true });
  }

  ensureTraceDirectory(testMode);
  assert(fs.existsSync(traceDir), "Trace directory should be created");

  // Check permissions (0700 = rwx------)
  const stats = fs.statSync(traceDir);
  const mode = stats.mode & 0o777;
  assert.strictEqual(
    mode,
    0o700,
    "Trace directory should have 0700 permissions"
  );

  console.log("✓ Trace directory creation works");
}

function test_trace_file_writing() {
  console.log("Testing: Trace file writing...");

  const testMode = "claude";
  clearTraces(testMode); // Clean slate

  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: { "content-type": "application/json" },
    body: { model: "claude-3-5-sonnet-20241022", messages: [] },
  };

  const response = {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: { id: "msg_123", content: [] },
  };

  const filepath = writeTrace(testMode, request, response);
  assert(filepath, "Should return filepath");
  assert(fs.existsSync(filepath), "Trace file should exist");

  // Check file permissions (0600 = rw-------)
  const stats = fs.statSync(filepath);
  const mode = stats.mode & 0o777;
  assert.strictEqual(mode, 0o600, "Trace file should have 0600 permissions");

  console.log("✓ Trace file writing works");
}

function test_api_key_sanitization() {
  console.log("Testing: API key sanitization...");

  const testMode = "claude";
  clearTraces(testMode);

  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: {
      "x-api-key": "sk-ant-very-secret-key",
      "content-type": "application/json",
      Authorization: "Bearer secret-token",
    },
    body: {
      model: "claude-3-5-sonnet-20241022",
      api_key: "another-secret",
    },
  };

  const filepath = writeTrace(testMode, request);
  assert(filepath, "Should write trace");

  const trace = readTrace(filepath);
  assert(trace, "Should read trace");

  // Check that API keys are redacted
  assert.strictEqual(
    trace.request.headers["x-api-key"],
    "[REDACTED]",
    "x-api-key should be redacted"
  );
  assert.strictEqual(
    trace.request.headers["Authorization"],
    "[REDACTED]",
    "Authorization should be redacted"
  );
  assert.strictEqual(
    trace.request.body.api_key,
    "[REDACTED]",
    "Body api_key should be redacted"
  );

  // Check that other data is preserved
  assert.strictEqual(
    trace.request.headers["content-type"],
    "application/json",
    "Non-sensitive headers should be preserved"
  );
  assert.strictEqual(
    trace.request.body.model,
    "claude-3-5-sonnet-20241022",
    "Non-sensitive body data should be preserved"
  );

  console.log("✓ API key sanitization works");
}

function test_trace_file_reading() {
  console.log("Testing: Trace file reading...");

  const testMode = "claude";
  clearTraces(testMode);

  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: { "content-type": "application/json" },
    body: { model: "test-model" },
  };

  const filepath = writeTrace(testMode, request);
  const trace = readTrace(filepath);

  assert(trace, "Should read trace");
  assert.strictEqual(trace.mode, "claude", "Mode should be claude");
  assert.strictEqual(trace.request.method, "POST", "Method should be POST");
  assert.strictEqual(
    trace.request.url,
    "/v1/messages",
    "URL should be /v1/messages"
  );

  console.log("✓ Trace file reading works");
}

async function test_get_trace_files() {
  console.log("Testing: Get trace files...");

  const testMode = "lmstudio"; // Use different mode to avoid conflicts
  clearTraces(testMode);

  // Write multiple traces with small delay to ensure unique timestamps
  for (let i = 0; i < 3; i++) {
    writeTrace(testMode, {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: { index: i },
    });
    // Small delay to ensure unique millisecond timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const files = getTraceFiles(testMode);
  assert.strictEqual(files.length, 3, "Should have 3 trace files");

  // Clean up
  clearTraces(testMode);

  // Files should be sorted by timestamp (most recent first)
  for (let i = 0; i < files.length; i++) {
    assert(files[i].endsWith(".json"), "File should be JSON");
  }

  console.log("✓ Get trace files works");
}

async function test_clear_traces() {
  console.log("Testing: Clear traces...");

  const testMode = "claude";
  clearTraces(testMode); // Start fresh

  // Write some traces with delay
  for (let i = 0; i < 5; i++) {
    writeTrace(testMode, {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: { index: i },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const filesBefore = getTraceFiles(testMode);
  assert.strictEqual(filesBefore.length, 5, "Should have 5 trace files");

  const deletedCount = clearTraces(testMode);
  assert.strictEqual(deletedCount, 5, "Should delete 5 files");

  const filesAfter = getTraceFiles(testMode);
  assert.strictEqual(filesAfter.length, 0, "Should have 0 trace files");

  console.log("✓ Clear traces works");
}

function test_trace_format() {
  console.log("Testing: Trace file format...");

  const testMode = "claude";
  clearTraces(testMode);

  const request = {
    method: "POST",
    url: "/v1/messages",
    headers: { "content-type": "application/json" },
    body: { model: "test-model" },
  };

  const response = {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: { id: "msg_123" },
  };

  const filepath = writeTrace(testMode, request, response);
  const trace = readTrace(filepath);

  // Check required fields
  assert(trace.timestamp, "Should have timestamp");
  assert(trace.mode, "Should have mode");
  assert(trace.request, "Should have request");
  assert(trace.response, "Should have response");

  // Check timestamp format (ISO 8601)
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert(
    timestampRegex.test(trace.timestamp),
    "Timestamp should be ISO 8601 format"
  );

  console.log("✓ Trace file format is correct");
}

function runTests() {
  console.log("\n=== Trace Logger Tests ===\n");

  try {
    test_trace_directory_path();
    test_trace_directory_creation();
    test_trace_file_writing();
    test_api_key_sanitization();
    test_trace_file_reading();
    test_get_trace_files();
    test_clear_traces();
    test_trace_format();

    console.log("\n✅ All trace logger tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
