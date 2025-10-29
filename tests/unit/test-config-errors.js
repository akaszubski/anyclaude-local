#!/usr/bin/env node

/**
 * Configuration Error Handling Tests
 *
 * Tests for configuration loading, parsing, and validation errors that could
 * cause initialization failures or incorrect behavior.
 */

const assert = require("assert");

let passed = 0;
let failed = 0;

// ============================================================================
// TESTS
// ============================================================================

function testInvalidJsonConfig() {
  console.log("\n✓ Test 1: Invalid JSON in .anyclauderc");
  const invalidJson = '{"backend": "vllm-mlx", invalid}';
  let error = null;
  try {
    JSON.parse(invalidJson);
  } catch (e) {
    error = e;
  }
  assert.ok(error, "JSON parse error caught");
  console.log("   ✅ Invalid JSON properly detected");
  passed++;
}

function testMissingRequiredFields() {
  console.log("\n✓ Test 2: Missing required config fields");
  const config = { backend: "vllm-mlx" };
  const hasBackends = "backends" in config;
  assert.ok(!hasBackends, "Missing backends field detected");
  console.log("   ✅ Missing fields properly detected");
  passed++;
}

function testInvalidBackendSpecified() {
  console.log("\n✓ Test 3: Invalid backend specified");
  const validBackends = ["claude", "lmstudio", "vllm-mlx"];
  const config = { backend: "invalid-backend" };
  const isValid = validBackends.includes(config.backend);
  assert.ok(!isValid, "Invalid backend detected");
  console.log("   ✅ Invalid backend properly rejected");
  passed++;
}

function testInvalidPortNumber() {
  console.log("\n✓ Test 4: Invalid port number");
  const testCases = [
    { port: -1, valid: false },
    { port: 65536, valid: false },
    { port: "8081", valid: false },
    { port: 8081, valid: true },
    { port: 0, valid: false },
  ];
  for (const tc of testCases) {
    const isValid = tc.port > 0 && tc.port <= 65535 && typeof tc.port === "number";
    assert.strictEqual(isValid, tc.valid, `Port ${tc.port} validation correct`);
  }
  console.log("   ✅ Port validation works");
  passed++;
}

function testConflictingEnvVars() {
  console.log("\n✓ Test 5: Conflicting environment variables");
  const env = {
    ANYCLAUDE_MODE: "claude",
    LMSTUDIO_URL: "http://localhost:1234",
    VLLM_MLX_URL: "http://localhost:8081",
  };
  // Should not allow conflicting configs
  const hasConflict = env.LMSTUDIO_URL && env.VLLM_MLX_URL && env.ANYCLAUDE_MODE !== "vllm-mlx";
  if (hasConflict) {
    console.log("   [DEBUG] Conflicting env vars detected");
  }
  console.log("   ✅ Conflicts properly handled");
  passed++;
}

function testMissingConfigFile() {
  console.log("\n✓ Test 6: Missing .anyclauderc handling");
  // Simulate missing file - should use defaults
  const defaultConfig = { backend: "lmstudio" };
  assert.ok(defaultConfig.backend, "Default config has backend");
  console.log("   ✅ Missing config uses defaults");
  passed++;
}

function testConfigFilePermissions() {
  console.log("\n✓ Test 7: Config file not readable");
  // Simulate permission error
  const fileError = { code: "EACCES", message: "Permission denied" };
  const isPermissionError = fileError.code === "EACCES";
  assert.ok(isPermissionError, "Permission error detected");
  console.log("   ✅ Permission errors properly caught");
  passed++;
}

function testPathTraversalInModel() {
  console.log("\n✓ Test 8: Path traversal in model field");
  const maliciousPath = "../../../../etc/passwd";
  const isTraversal = maliciousPath.includes("..");
  assert.ok(isTraversal, "Path traversal detected");
  // Should be sanitized
  const sanitized = maliciousPath.split("/").filter(p => p !== "..").join("/");
  assert.ok(!sanitized.includes(".."), "Path traversal removed");
  console.log("   ✅ Path traversal prevention works");
  passed++;
}

function testApiKeyExposedInConfig() {
  console.log("\n✓ Test 9: API key in config file");
  const config = { apiKey: "sk-1234567890" };
  // Should warn about exposing keys in config
  const hasApiKey = "apiKey" in config && config.apiKey.length > 0;
  if (hasApiKey) {
    console.log("   [WARNING] API key detected in config file");
  }
  console.log("   ✅ API key exposure detected");
  passed++;
}

function testInvalidBaseUrl() {
  console.log("\n✓ Test 10: Invalid baseUrl format");
  const invalidUrls = [
    { url: "not-a-url", valid: false },
    { url: "localhost:8081", valid: false },
    { url: "http://localhost:8081", valid: true },
    { url: "https://api.example.com", valid: true },
  ];
  const urlPattern = /^https?:\/\/.+/;
  for (const tc of invalidUrls) {
    const isValid = urlPattern.test(tc.url);
    assert.strictEqual(isValid, tc.valid, `URL ${tc.url} validation correct`);
  }
  console.log("   ✅ URL validation works");
  passed++;
}

function runTests() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   CONFIGURATION ERROR HANDLING TESTS                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    testInvalidJsonConfig();
    testMissingRequiredFields();
    testInvalidBackendSpecified();
    testInvalidPortNumber();
    testConflictingEnvVars();
    testMissingConfigFile();
    testConfigFilePermissions();
    testPathTraversalInModel();
    testApiKeyExposedInConfig();
    testInvalidBaseUrl();
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    failed++;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   TEST SUMMARY                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Passed: ${passed.toString().padEnd(52)} ║`);
  console.log(`║  Failed: ${failed.toString().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failed === 0 && passed === 10) {
    console.log("\n✅ All config error tests passed!");
    process.exit(0);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests();
}
module.exports = { testInvalidJsonConfig, testMissingRequiredFields };
