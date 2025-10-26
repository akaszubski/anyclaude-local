/**
 * Security test: Verify API keys are never leaked in trace files
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Load trace logger
let traceLogger;
try {
  traceLogger = require("../../dist/trace-logger.cjs");
} catch (e) {
  console.error("Failed to load trace-logger. Run 'npm run build' first.");
  process.exit(1);
}

const { writeTrace, readTrace, clearTraces, getTraceFiles } = traceLogger;

function test_api_key_redaction_in_headers() {
  console.log("Testing: API keys in headers are redacted...");

  const mode = "claude";
  clearTraces(mode);

  const sensitiveHeaders = {
    "x-api-key": "sk-ant-api03-very-secret-key-12345",
    "X-API-KEY": "ANOTHER-SECRET-KEY",
    "api-key": "secret-key-123",
    API_KEY: "secret-key-456",
    apikey: "secret-key-789",
    Authorization: "Bearer secret-token-xyz",
    authorization: "Bearer another-secret",
    "content-type": "application/json", // Should NOT be redacted
  };

  const filepath = writeTrace(
    mode,
    {
      method: "POST",
      url: "/v1/messages",
      headers: sensitiveHeaders,
      body: {},
    },
    {
      statusCode: 200,
      headers: {},
      body: {},
    }
  );

  const trace = readTrace(filepath);

  // Check all sensitive headers are redacted
  assert.strictEqual(trace.request.headers["x-api-key"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["X-API-KEY"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["api-key"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["API_KEY"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["apikey"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["Authorization"], "[REDACTED]");
  assert.strictEqual(trace.request.headers["authorization"], "[REDACTED]");

  // Check non-sensitive headers are preserved
  assert.strictEqual(trace.request.headers["content-type"], "application/json");

  // Verify no actual secrets in the trace file
  const fileContent = fs.readFileSync(filepath, "utf8");
  assert(
    !fileContent.includes("sk-ant-api03"),
    "Real API key found in trace file!"
  );
  assert(
    !fileContent.includes("ANOTHER-SECRET"),
    "Secret found in trace file!"
  );
  assert(
    !fileContent.includes("secret-token"),
    "Secret token found in trace file!"
  );

  clearTraces(mode);
  console.log("✓ API keys in headers are properly redacted");
}

function test_api_key_redaction_in_body() {
  console.log("Testing: API keys in request body are redacted...");

  const mode = "claude";
  clearTraces(mode);

  const sensitiveBody = {
    model: "claude-3-5-sonnet-20241022",
    api_key: "sk-ant-secret-body-key",
    apiKey: "another-secret-key",
    API_KEY: "UPPERCASE-SECRET",
    messages: [
      {
        role: "user",
        content: "This should be preserved",
      },
    ],
  };

  const filepath = writeTrace(
    mode,
    {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: sensitiveBody,
    },
    {
      statusCode: 200,
      headers: {},
      body: {},
    }
  );

  const trace = readTrace(filepath);

  // Check sensitive fields are redacted
  assert.strictEqual(trace.request.body.api_key, "[REDACTED]");
  assert.strictEqual(trace.request.body.apiKey, "[REDACTED]");
  assert.strictEqual(trace.request.body.API_KEY, "[REDACTED]");

  // Check non-sensitive fields are preserved
  assert.strictEqual(trace.request.body.model, "claude-3-5-sonnet-20241022");
  assert.strictEqual(
    trace.request.body.messages[0].content,
    "This should be preserved"
  );

  // Verify no actual secrets in the trace file
  const fileContent = fs.readFileSync(filepath, "utf8");
  assert(
    !fileContent.includes("sk-ant-secret-body-key"),
    "API key found in trace file!"
  );
  assert(
    !fileContent.includes("another-secret-key"),
    "Secret key found in trace file!"
  );

  clearTraces(mode);
  console.log("✓ API keys in request body are properly redacted");
}

function test_nested_api_keys_redacted() {
  console.log("Testing: Nested API keys are redacted...");

  const mode = "claude";
  clearTraces(mode);

  const nestedBody = {
    config: {
      api_key: "nested-secret-123",
      auth: {
        apiKey: "deeply-nested-secret",
      },
    },
    data: {
      should_preserve: "This value should be kept",
    },
  };

  const filepath = writeTrace(
    mode,
    {
      method: "POST",
      url: "/v1/messages",
      headers: {},
      body: nestedBody,
    },
    {
      statusCode: 200,
      headers: {},
      body: {},
    }
  );

  const trace = readTrace(filepath);

  // Check nested sensitive fields are redacted
  assert.strictEqual(trace.request.body.config.api_key, "[REDACTED]");
  assert.strictEqual(trace.request.body.config.auth.apiKey, "[REDACTED]");

  // Check non-sensitive fields are preserved
  assert.strictEqual(
    trace.request.body.data.should_preserve,
    "This value should be kept"
  );

  // Verify no actual secrets in the trace file
  const fileContent = fs.readFileSync(filepath, "utf8");
  assert(
    !fileContent.includes("nested-secret-123"),
    "Nested secret found in trace file!"
  );
  assert(
    !fileContent.includes("deeply-nested-secret"),
    "Deeply nested secret found in trace file!"
  );

  clearTraces(mode);
  console.log("✓ Nested API keys are properly redacted");
}

function test_file_permissions() {
  console.log("Testing: Trace files have restrictive permissions...");

  const mode = "claude";
  clearTraces(mode);

  const filepath = writeTrace(mode, {
    method: "POST",
    url: "/v1/messages",
    headers: {},
    body: {},
  });

  const stats = fs.statSync(filepath);
  const fileMode = stats.mode & 0o777;

  assert.strictEqual(
    fileMode,
    0o600,
    "Trace file should have 0600 permissions"
  );

  clearTraces(mode);
  console.log("✓ Trace files have proper permissions (0600)");
}

function test_directory_permissions() {
  console.log("Testing: Trace directory has restrictive permissions...");

  const mode = "claude";
  const os = require("os");
  const traceDir = path.join(os.homedir(), ".anyclaude", "traces", mode);

  const stats = fs.statSync(traceDir);
  const dirMode = stats.mode & 0o777;

  assert.strictEqual(
    dirMode,
    0o700,
    "Trace directory should have 0700 permissions"
  );

  console.log("✓ Trace directory has proper permissions (0700)");
}

function runSecurityTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║           API KEY SANITIZATION SECURITY TESTS            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  try {
    test_api_key_redaction_in_headers();
    test_api_key_redaction_in_body();
    test_nested_api_keys_redacted();
    test_file_permissions();
    test_directory_permissions();

    console.log(
      "\n╔══════════════════════════════════════════════════════════╗"
    );
    console.log("║               ✅ ALL SECURITY TESTS PASSED               ║");
    console.log(
      "╚══════════════════════════════════════════════════════════╝\n"
    );
    process.exit(0);
  } catch (error) {
    console.error(
      "\n╔══════════════════════════════════════════════════════════╗"
    );
    console.error(
      "║               ❌ SECURITY TEST FAILED!                   ║"
    );
    console.error(
      "╚══════════════════════════════════════════════════════════╝\n"
    );
    console.error("Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runSecurityTests();
}

module.exports = { runSecurityTests };
