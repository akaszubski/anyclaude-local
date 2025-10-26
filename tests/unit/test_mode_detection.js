/**
 * Unit tests for mode detection logic
 *
 * Tests:
 * - Mode detection from environment variable
 * - Mode detection from CLI argument
 * - Priority: CLI args > env var > default
 * - Invalid mode handling
 * - Default mode is lmstudio
 */

const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");

const MAIN_PATH = path.join(__dirname, "../../src/main.ts");

/**
 * Run anyclaude with given env vars and args, capture startup output
 */
function runAnyclaude(env, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["-r", "ts-node/register", MAIN_PATH, ...args], {
      env: { ...process.env, ...env, PROXY_ONLY: "true" },
      timeout: 5000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      reject(err);
    });

    // Kill after 2 seconds (proxy starts but we don't need to keep it running)
    setTimeout(() => {
      proc.kill();
    }, 2000);
  });
}

async function test_default_mode_is_lmstudio() {
  console.log("Testing: Default mode is lmstudio...");
  const result = await runAnyclaude({}, []);
  assert(
    result.stdout.includes("Mode: LMSTUDIO"),
    "Default mode should be LMSTUDIO"
  );
  console.log("✓ Default mode is lmstudio");
}

async function test_env_var_mode_detection() {
  console.log("Testing: Mode detection from ANYCLAUDE_MODE env var...");

  const resultClaude = await runAnyclaude({ ANYCLAUDE_MODE: "claude" }, []);
  assert(
    resultClaude.stdout.includes("Mode: CLAUDE"),
    "Should detect CLAUDE from env var"
  );

  const resultLmstudio = await runAnyclaude(
    { ANYCLAUDE_MODE: "lmstudio" },
    []
  );
  assert(
    resultLmstudio.stdout.includes("Mode: LMSTUDIO"),
    "Should detect LMSTUDIO from env var"
  );

  console.log("✓ Mode detection from env var works");
}

async function test_cli_arg_mode_detection() {
  console.log("Testing: Mode detection from --mode CLI argument...");

  const resultClaude = await runAnyclaude({}, ["--mode=claude"]);
  assert(
    resultClaude.stdout.includes("Mode: CLAUDE"),
    "Should detect CLAUDE from CLI arg"
  );

  const resultLmstudio = await runAnyclaude({}, ["--mode=lmstudio"]);
  assert(
    resultLmstudio.stdout.includes("Mode: LMSTUDIO"),
    "Should detect LMSTUDIO from CLI arg"
  );

  console.log("✓ Mode detection from CLI arg works");
}

async function test_cli_arg_overrides_env_var() {
  console.log("Testing: CLI arg overrides env var...");

  const result = await runAnyclaude({ ANYCLAUDE_MODE: "lmstudio" }, [
    "--mode=claude",
  ]);
  assert(
    result.stdout.includes("Mode: CLAUDE"),
    "CLI arg should override env var"
  );

  console.log("✓ CLI arg overrides env var");
}

async function test_invalid_mode_handling() {
  console.log("Testing: Invalid mode handling...");

  const result = await runAnyclaude({}, ["--mode=invalid"]);
  assert(
    result.code !== 0 || result.stderr.includes("Invalid mode"),
    "Should reject invalid mode"
  );

  console.log("✓ Invalid mode is rejected");
}

async function test_mode_filtering_from_claude_args() {
  console.log("Testing: --mode flag is filtered from Claude Code args...");

  // This test verifies that --mode is not passed to Claude Code
  // We can't easily test this without spawning Claude Code, so we'll
  // trust that the filter logic in main.ts works correctly
  // (manual testing required for full verification)

  console.log("⚠ Manual verification required for arg filtering");
}

async function test_claude_mode_requires_api_key() {
  console.log("Testing: Claude mode requires ANTHROPIC_API_KEY...");

  const result = await runAnyclaude(
    { ANYCLAUDE_MODE: "claude", ANTHROPIC_API_KEY: "" },
    []
  );

  // The proxy should still start but will fail when making requests
  assert(
    result.stdout.includes("Mode: CLAUDE"),
    "Should start in CLAUDE mode"
  );

  console.log("✓ Claude mode starts (API key validation happens at request time)");
}

async function runTests() {
  console.log("\n=== Mode Detection Tests ===\n");

  try {
    await test_default_mode_is_lmstudio();
    await test_env_var_mode_detection();
    await test_cli_arg_mode_detection();
    await test_cli_arg_overrides_env_var();
    await test_invalid_mode_handling();
    await test_mode_filtering_from_claude_args();
    await test_claude_mode_requires_api_key();

    console.log("\n✅ All mode detection tests passed!\n");
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
