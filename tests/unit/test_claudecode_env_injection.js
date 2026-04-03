/**
 * Unit tests for Claude Code environment variable injection (#82)
 *
 * Tests:
 * - Local mode injects MODEL_CONTEXT_WINDOW, CLAUDE_CODE_DISABLE_THINKING, CLAUDE_CODE_MAX_OUTPUT_TOKENS
 * - mlx-cluster mode injects same defaults
 * - openrouter mode does NOT inject these vars
 * - claude mode does NOT inject these vars
 * - User-set env vars are not overwritten (nullish coalescing)
 * - LOCAL_CONTEXT_LENGTH is used to derive MODEL_CONTEXT_WINDOW when set
 */

const assert = require("assert");

// ---------------------------------------------------------------------------
// Pure-logic simulation of the injection code from src/main.ts
// ---------------------------------------------------------------------------

/**
 * Simulate the claudeCodeEnvDefaults computation from main.ts.
 *
 * @param {string} mode - The anyclaude backend mode
 * @param {object} processEnv - A fake process.env for the test
 * @returns {object} The env object that would be passed to spawn()
 */
function computeSpawnEnv(mode, processEnv) {
  const isLocalMode = mode === "local" || mode === "mlx-cluster";
  const claudeCodeEnvDefaults = isLocalMode
    ? {
        MODEL_CONTEXT_WINDOW:
          processEnv.MODEL_CONTEXT_WINDOW ??
          String(Number(processEnv.LOCAL_CONTEXT_LENGTH) || 131072),
        CLAUDE_CODE_DISABLE_THINKING:
          processEnv.CLAUDE_CODE_DISABLE_THINKING ?? "true",
        CLAUDE_CODE_MAX_OUTPUT_TOKENS:
          processEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS ?? "8192",
      }
    : {};

  return {
    ...processEnv,
    ...claudeCodeEnvDefaults,
    // ANTHROPIC_BASE_URL always comes last (not relevant to our assertions)
    ANTHROPIC_BASE_URL: "http://localhost:49152",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\n=== Claude Code Env Var Injection Tests (#82) ===\n");

// -- local mode: defaults injected --

test("local mode: MODEL_CONTEXT_WINDOW defaults to 131072", () => {
  const env = computeSpawnEnv("local", {});
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "131072");
});

test("local mode: CLAUDE_CODE_DISABLE_THINKING defaults to 'true'", () => {
  const env = computeSpawnEnv("local", {});
  assert.strictEqual(env.CLAUDE_CODE_DISABLE_THINKING, "true");
});

test("local mode: CLAUDE_CODE_MAX_OUTPUT_TOKENS defaults to '8192'", () => {
  const env = computeSpawnEnv("local", {});
  assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "8192");
});

// -- mlx-cluster mode: same defaults --

test("mlx-cluster mode: MODEL_CONTEXT_WINDOW defaults to 131072", () => {
  const env = computeSpawnEnv("mlx-cluster", {});
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "131072");
});

test("mlx-cluster mode: CLAUDE_CODE_DISABLE_THINKING defaults to 'true'", () => {
  const env = computeSpawnEnv("mlx-cluster", {});
  assert.strictEqual(env.CLAUDE_CODE_DISABLE_THINKING, "true");
});

test("mlx-cluster mode: CLAUDE_CODE_MAX_OUTPUT_TOKENS defaults to '8192'", () => {
  const env = computeSpawnEnv("mlx-cluster", {});
  assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "8192");
});

// -- openrouter mode: no injection --

test("openrouter mode: MODEL_CONTEXT_WINDOW is NOT injected", () => {
  const env = computeSpawnEnv("openrouter", {});
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, undefined);
});

test("openrouter mode: CLAUDE_CODE_DISABLE_THINKING is NOT injected", () => {
  const env = computeSpawnEnv("openrouter", {});
  assert.strictEqual(env.CLAUDE_CODE_DISABLE_THINKING, undefined);
});

test("openrouter mode: CLAUDE_CODE_MAX_OUTPUT_TOKENS is NOT injected", () => {
  const env = computeSpawnEnv("openrouter", {});
  assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, undefined);
});

// -- claude mode: no injection --

test("claude mode: MODEL_CONTEXT_WINDOW is NOT injected", () => {
  const env = computeSpawnEnv("claude", {});
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, undefined);
});

test("claude mode: CLAUDE_CODE_DISABLE_THINKING is NOT injected", () => {
  const env = computeSpawnEnv("claude", {});
  assert.strictEqual(env.CLAUDE_CODE_DISABLE_THINKING, undefined);
});

// -- user-set values win --

test("user-set MODEL_CONTEXT_WINDOW is not overwritten", () => {
  const env = computeSpawnEnv("local", { MODEL_CONTEXT_WINDOW: "65536" });
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "65536");
});

test("user-set CLAUDE_CODE_DISABLE_THINKING='false' is not overwritten", () => {
  const env = computeSpawnEnv("local", { CLAUDE_CODE_DISABLE_THINKING: "false" });
  assert.strictEqual(env.CLAUDE_CODE_DISABLE_THINKING, "false");
});

test("user-set CLAUDE_CODE_MAX_OUTPUT_TOKENS is not overwritten", () => {
  const env = computeSpawnEnv("local", { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "4096" });
  assert.strictEqual(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "4096");
});

// -- LOCAL_CONTEXT_LENGTH derivation --

test("LOCAL_CONTEXT_LENGTH=32768 derives MODEL_CONTEXT_WINDOW='32768'", () => {
  const env = computeSpawnEnv("local", { LOCAL_CONTEXT_LENGTH: "32768" });
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "32768");
});

test("LOCAL_CONTEXT_LENGTH derivation is skipped if MODEL_CONTEXT_WINDOW already set", () => {
  const env = computeSpawnEnv("local", {
    LOCAL_CONTEXT_LENGTH: "32768",
    MODEL_CONTEXT_WINDOW: "65536",
  });
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "65536");
});

test("invalid LOCAL_CONTEXT_LENGTH falls back to 131072", () => {
  const env = computeSpawnEnv("local", { LOCAL_CONTEXT_LENGTH: "not-a-number" });
  assert.strictEqual(env.MODEL_CONTEXT_WINDOW, "131072");
});

// -- ANTHROPIC_BASE_URL always last --

test("ANTHROPIC_BASE_URL is always set regardless of mode", () => {
  const envLocal = computeSpawnEnv("local", {});
  const envCloud = computeSpawnEnv("openrouter", {});
  assert.strictEqual(envLocal.ANTHROPIC_BASE_URL, "http://localhost:49152");
  assert.strictEqual(envCloud.ANTHROPIC_BASE_URL, "http://localhost:49152");
});

console.log("\n");
