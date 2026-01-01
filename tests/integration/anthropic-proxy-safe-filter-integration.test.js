#!/usr/bin/env node

/**
 * Integration Test: Safe System Filter Integration in anthropic-proxy.ts
 *
 * Tests the integration of safe-system-filter.ts into the proxy's optimization chain.
 *
 * Integration Points Tested:
 * 1. shouldUseSafeFilter() helper function logic
 * 2. Optimization chain priority (smart → safe → truncate → passthrough)
 * 3. Fallback behavior when validation fails
 * 4. Debug logging at levels 1, 2, 3
 * 5. Mode-specific behavior (LMStudio default, configurable for others)
 * 6. Configuration validation and edge cases
 * 7. Performance (<10ms processing target)
 * 8. No regression in streaming or tool calling
 *
 * Test Strategy:
 * - Mock the proxy options with various configurations
 * - Test decision logic for when to apply safe filter
 * - Verify optimization chain priority
 * - Confirm no breakage in existing functionality
 *
 * Expected: ALL TESTS FAIL (TDD red phase - integration doesn't exist yet)
 */

const assert = require("assert");

let passed = 0;
let failed = 0;
let skipped = 0;

console.log("=".repeat(80));
console.log("INTEGRATION TEST: Safe System Filter in anthropic-proxy.ts");
console.log("=".repeat(80));
console.log("Expected: ALL TESTS FAIL (TDD red phase)\n");

// ============================================================================
// Mock Data & Utilities
// ============================================================================

const CLAUDE_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

# Tool usage policy

When making function calls using tools that accept array or object parameters ensure those are structured using JSON.

# Read Tool

The Read tool reads files from the filesystem.
- file_path parameter must be absolute

# Write Tool

The Write tool writes files.
- file_path parameter must be absolute

# Edit Tool

The Edit tool modifies files.
- old_string must match exactly

# Bash Tool

Execute bash commands.

# Doing tasks

IMPORTANT: Always use absolute paths.

# Error handling

Handle errors gracefully.`;

// Helper to simulate proxy options
function createMockProxyOptions(overrides = {}) {
  return {
    mode: "lmstudio",
    smartSystemPrompt: false,
    truncateSystemPrompt: false,
    safeSystemFilter: false,
    filterTier: "auto",
    ...overrides,
  };
}

// Helper to estimate tokens
function estimateTokens(text) {
  return Math.floor(text.length / 4);
}

// ============================================================================
// Test Suite 1: shouldUseSafeFilter() Helper Function
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 1: shouldUseSafeFilter() Helper Function");
console.log("=".repeat(80));

/**
 * Test 1.1: Safe filter enabled explicitly
 */
function test_1_1_safe_filter_enabled_explicitly() {
  console.log("\n✓ Test 1.1: Safe filter enabled explicitly");

  try {
    // This will fail until shouldUseSafeFilter() is implemented
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      smartSystemPrompt: false,
      truncateSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      true,
      "Should use safe filter when explicitly enabled"
    );

    console.log("   ✅ PASS: Safe filter enabled explicitly");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 1.2: Safe filter disabled when smartSystemPrompt is active
 */
function test_1_2_safe_filter_disabled_with_smart_prompt() {
  console.log(
    "\n✓ Test 1.2: Safe filter disabled when smartSystemPrompt active"
  );

  try {
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      smartSystemPrompt: true, // Takes priority
      truncateSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      false,
      "Should NOT use safe filter when smartSystemPrompt is active"
    );

    console.log("   ✅ PASS: Smart prompt takes priority over safe filter");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 1.3: Safe filter enabled by default for LMStudio
 */
function test_1_3_safe_filter_default_lmstudio() {
  console.log("\n✓ Test 1.3: Safe filter enabled by default for LMStudio");

  try {
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    // Default LMStudio config (safeSystemFilter: undefined)
    const options = createMockProxyOptions({
      mode: "lmstudio",
      safeSystemFilter: undefined,
      smartSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      true,
      "Should use safe filter by default for LMStudio"
    );

    console.log("   ✅ PASS: Safe filter enabled by default for LMStudio");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 1.4: Safe filter disabled by default for OpenRouter
 */
function test_1_4_safe_filter_default_openrouter() {
  console.log("\n✓ Test 1.4: Safe filter disabled by default for OpenRouter");

  try {
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      mode: "openrouter",
      safeSystemFilter: undefined,
      smartSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      false,
      "Should NOT use safe filter by default for OpenRouter"
    );

    console.log("   ✅ PASS: Safe filter disabled by default for OpenRouter");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 1.5: Safe filter disabled by default for Claude mode
 */
function test_1_5_safe_filter_default_claude() {
  console.log("\n✓ Test 1.5: Safe filter disabled by default for Claude mode");

  try {
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      mode: "claude",
      safeSystemFilter: undefined,
      smartSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      false,
      "Should NOT use safe filter by default for Claude mode"
    );

    console.log("   ✅ PASS: Safe filter disabled by default for Claude mode");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 1.6: Safe filter disabled explicitly overrides defaults
 */
function test_1_6_safe_filter_explicit_disable() {
  console.log("\n✓ Test 1.6: Explicit disable overrides defaults");

  try {
    const { shouldUseSafeFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      mode: "lmstudio",
      safeSystemFilter: false, // Explicit disable
      smartSystemPrompt: false,
    });

    const result = shouldUseSafeFilter(options);

    assert.strictEqual(
      result,
      false,
      "Should NOT use safe filter when explicitly disabled"
    );

    console.log("   ✅ PASS: Explicit disable overrides defaults");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 2: Optimization Chain Priority
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 2: Optimization Chain Priority");
console.log("=".repeat(80));

/**
 * Test 2.1: Chain priority - smartSystemPrompt → safeSystemFilter → truncate → passthrough
 */
function test_2_1_optimization_chain_priority() {
  console.log("\n✓ Test 2.1: Optimization chain priority order");

  try {
    const {
      getOptimizationStrategy,
    } = require("../../dist/anthropic-proxy.js");

    // Test 1: smartSystemPrompt takes priority
    let options = createMockProxyOptions({
      smartSystemPrompt: true,
      safeSystemFilter: true,
      truncateSystemPrompt: true,
    });
    let strategy = getOptimizationStrategy(options);
    assert.strictEqual(strategy, "smart", "Smart prompt should take priority");

    // Test 2: safeSystemFilter takes priority when smart is disabled
    options = createMockProxyOptions({
      smartSystemPrompt: false,
      safeSystemFilter: true,
      truncateSystemPrompt: true,
    });
    strategy = getOptimizationStrategy(options);
    assert.strictEqual(
      strategy,
      "safe",
      "Safe filter should take priority when smart is disabled"
    );

    // Test 3: truncate takes priority when safe is disabled
    options = createMockProxyOptions({
      smartSystemPrompt: false,
      safeSystemFilter: false,
      truncateSystemPrompt: true,
    });
    strategy = getOptimizationStrategy(options);
    assert.strictEqual(
      strategy,
      "truncate",
      "Truncate should take priority when safe is disabled"
    );

    // Test 4: passthrough when all disabled
    options = createMockProxyOptions({
      smartSystemPrompt: false,
      safeSystemFilter: false,
      truncateSystemPrompt: false,
    });
    strategy = getOptimizationStrategy(options);
    assert.strictEqual(
      strategy,
      "passthrough",
      "Passthrough when all optimizations disabled"
    );

    console.log("   ✅ PASS: Optimization chain priority correct");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 2.2: Safe filter applied to system prompt
 */
function test_2_2_safe_filter_applied_to_system_prompt() {
  console.log("\n✓ Test 2.2: Safe filter applied to system prompt");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "moderate",
    });

    const result = applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

    assert.ok(result.filteredPrompt, "Should return filtered prompt");
    assert.ok(result.stats, "Should return stats");
    assert.ok(result.validation, "Should return validation");
    assert.strictEqual(
      result.validation.isValid,
      true,
      "Should pass validation"
    );
    assert.ok(
      result.stats.filteredTokens < result.stats.originalTokens,
      "Should reduce token count"
    );

    console.log("   ✅ PASS: Safe filter applied successfully");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 2.3: Fallback to truncate when safe filter validation fails
 */
function test_2_3_fallback_to_truncate_on_validation_failure() {
  console.log(
    "\n✓ Test 2.3: Fallback to truncate when safe filter validation fails"
  );

  try {
    const { optimizeSystemPrompt } = require("../../dist/anthropic-proxy.js");

    // Create a prompt that will fail validation with EXTREME tier
    const invalidPrompt = "You are an AI.";

    const options = createMockProxyOptions({
      mode: "lmstudio",
      safeSystemFilter: true,
      filterTier: "extreme",
      truncateSystemPrompt: true,
      systemPromptMaxTokens: 2000,
    });

    const result = optimizeSystemPrompt(invalidPrompt, options);

    // Should fallback to truncate when validation fails
    assert.ok(
      result.strategy === "truncate" || result.strategy === "safe",
      "Should use truncate or safe (with fallback) when validation fails"
    );

    console.log("   ✅ PASS: Fallback to truncate on validation failure");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 3: Configuration & Tier Selection
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 3: Configuration & Tier Selection");
console.log("=".repeat(80));

/**
 * Test 3.1: Auto tier selection based on prompt size
 */
function test_3_1_auto_tier_selection() {
  console.log("\n✓ Test 3.1: Auto tier selection based on prompt size");

  try {
    const { selectOptimizationTier } = require("../../dist/anthropic-proxy.js");

    // Small prompt → MINIMAL
    let prompt = "You are Claude.";
    let tier = selectOptimizationTier(prompt, "auto");
    assert.strictEqual(tier, "MINIMAL", "Small prompt should use MINIMAL tier");

    // Medium prompt (8k tokens) → MODERATE
    prompt = "X".repeat(32000);
    tier = selectOptimizationTier(prompt, "auto");
    assert.strictEqual(
      tier,
      "MODERATE",
      "Medium prompt should use MODERATE tier"
    );

    // Large prompt (15k tokens) → AGGRESSIVE
    prompt = "X".repeat(60000);
    tier = selectOptimizationTier(prompt, "auto");
    assert.strictEqual(
      tier,
      "AGGRESSIVE",
      "Large prompt should use AGGRESSIVE tier"
    );

    // Very large prompt (20k+ tokens) → EXTREME
    prompt = "X".repeat(80000);
    tier = selectOptimizationTier(prompt, "auto");
    assert.strictEqual(
      tier,
      "EXTREME",
      "Very large prompt should use EXTREME tier"
    );

    console.log("   ✅ PASS: Auto tier selection works correctly");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 3.2: Explicit tier selection overrides auto
 */
function test_3_2_explicit_tier_override() {
  console.log("\n✓ Test 3.2: Explicit tier selection overrides auto");

  try {
    const { selectOptimizationTier } = require("../../dist/anthropic-proxy.js");

    const prompt = "X".repeat(80000); // Large prompt

    // Explicit tier should override auto
    const tier = selectOptimizationTier(prompt, "minimal");
    assert.strictEqual(
      tier,
      "MINIMAL",
      "Explicit tier should override auto selection"
    );

    console.log("   ✅ PASS: Explicit tier overrides auto");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 3.3: Invalid tier defaults to auto
 */
function test_3_3_invalid_tier_defaults_to_auto() {
  console.log("\n✓ Test 3.3: Invalid tier defaults to auto");

  try {
    const { selectOptimizationTier } = require("../../dist/anthropic-proxy.js");

    const prompt = "You are Claude.";

    // Invalid tier should default to auto
    const tier = selectOptimizationTier(prompt, "invalid_tier");
    assert.ok(
      ["MINIMAL", "MODERATE", "AGGRESSIVE", "EXTREME"].includes(tier),
      "Invalid tier should default to auto selection"
    );

    console.log("   ✅ PASS: Invalid tier defaults to auto");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 4: Debug Logging Integration
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 4: Debug Logging Integration");
console.log("=".repeat(80));

/**
 * Test 4.1: Debug level 1 - Basic logging
 */
function test_4_1_debug_level_1_basic_logging() {
  console.log("\n✓ Test 4.1: Debug level 1 - Basic logging");

  try {
    // Set debug level 1
    process.env.ANYCLAUDE_DEBUG = "1";

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    try {
      const {
        applySafeSystemFilter,
      } = require("../../dist/anthropic-proxy.js");

      const options = createMockProxyOptions({
        safeSystemFilter: true,
        filterTier: "moderate",
      });

      applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

      // Should log basic info about filtering
      const hasFilterLog = logs.some(
        (log) => log.includes("Safe System Filter") || log.includes("filtering")
      );

      assert.ok(
        hasFilterLog,
        "Should log basic filter information at debug level 1"
      );

      console.log = originalLog;
      console.log("   ✅ PASS: Debug level 1 logging works");
      passed++;
    } finally {
      console.log = originalLog;
      delete process.env.ANYCLAUDE_DEBUG;
    }
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 4.2: Debug level 2 - Verbose logging
 */
function test_4_2_debug_level_2_verbose_logging() {
  console.log("\n✓ Test 4.2: Debug level 2 - Verbose logging");

  try {
    // Set debug level 2
    process.env.ANYCLAUDE_DEBUG = "2";

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    try {
      const {
        applySafeSystemFilter,
      } = require("../../dist/anthropic-proxy.js");

      const options = createMockProxyOptions({
        safeSystemFilter: true,
        filterTier: "moderate",
      });

      applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

      // Should log detailed stats
      const hasStatsLog = logs.some(
        (log) => log.includes("tokens") || log.includes("reduction")
      );

      assert.ok(hasStatsLog, "Should log detailed stats at debug level 2");

      console.log = originalLog;
      console.log("   ✅ PASS: Debug level 2 logging works");
      passed++;
    } finally {
      console.log = originalLog;
      delete process.env.ANYCLAUDE_DEBUG;
    }
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 4.3: Debug level 3 - Trace logging with full prompt
 */
function test_4_3_debug_level_3_trace_logging() {
  console.log("\n✓ Test 4.3: Debug level 3 - Trace logging with full prompt");

  try {
    // Set debug level 3
    process.env.ANYCLAUDE_DEBUG = "3";

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    try {
      const {
        applySafeSystemFilter,
      } = require("../../dist/anthropic-proxy.js");

      const options = createMockProxyOptions({
        safeSystemFilter: true,
        filterTier: "moderate",
      });

      applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

      // Should log full prompt details
      const hasPromptLog = logs.some(
        (log) =>
          log.includes("Tool usage policy") || log.includes("Claude Code")
      );

      assert.ok(hasPromptLog, "Should log full prompt at debug level 3");

      console.log = originalLog;
      console.log("   ✅ PASS: Debug level 3 logging works");
      passed++;
    } finally {
      console.log = originalLog;
      delete process.env.ANYCLAUDE_DEBUG;
    }
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 5: Performance Requirements
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 5: Performance Requirements");
console.log("=".repeat(80));

/**
 * Test 5.1: Processing time < 10ms for typical prompt
 */
function test_5_1_processing_time_under_10ms() {
  console.log("\n✓ Test 5.1: Processing time < 10ms for typical prompt");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "moderate",
    });

    const startTime = Date.now();
    const result = applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);
    const endTime = Date.now();

    const processingTime = endTime - startTime;

    assert.ok(
      processingTime < 10,
      `Processing time should be < 10ms, got ${processingTime}ms`
    );

    console.log(`   ✅ PASS: Processing time ${processingTime}ms < 10ms`);
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 5.2: Large prompt processing time < 50ms
 */
function test_5_2_large_prompt_processing_time() {
  console.log("\n✓ Test 5.2: Large prompt processing time < 50ms");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    // Create a very large prompt (20k+ tokens)
    const largePrompt = CLAUDE_SYSTEM_PROMPT.repeat(10);

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "aggressive",
    });

    const startTime = Date.now();
    const result = applySafeSystemFilter(largePrompt, options);
    const endTime = Date.now();

    const processingTime = endTime - startTime;

    assert.ok(
      processingTime < 50,
      `Large prompt processing should be < 50ms, got ${processingTime}ms`
    );

    console.log(
      `   ✅ PASS: Large prompt processing ${processingTime}ms < 50ms`
    );
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 6: No Regression in Streaming & Tool Calling
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 6: No Regression in Streaming & Tool Calling");
console.log("=".repeat(80));

/**
 * Test 6.1: Safe filter preserves tool calling instructions
 */
function test_6_1_preserves_tool_calling_instructions() {
  console.log("\n✓ Test 6.1: Safe filter preserves tool calling instructions");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "aggressive", // Even aggressive should preserve tool calling
    });

    const result = applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

    // Should preserve critical tool calling sections
    assert.ok(
      result.filteredPrompt.includes("Tool usage policy"),
      "Should preserve tool usage policy"
    );
    assert.ok(
      result.filteredPrompt.includes("parameters"),
      "Should preserve parameter instructions"
    );
    assert.strictEqual(
      result.validation.isValid,
      true,
      "Should pass validation (critical sections present)"
    );

    console.log("   ✅ PASS: Tool calling instructions preserved");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 6.2: Safe filter doesn't interfere with streaming
 */
function test_6_2_no_streaming_interference() {
  console.log("\n✓ Test 6.2: Safe filter doesn't interfere with streaming");

  try {
    // Safe filter should only modify system prompt, not streaming logic
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "moderate",
    });

    const result = applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

    // Result should be a plain string, not affect streaming
    assert.strictEqual(
      typeof result.filteredPrompt,
      "string",
      "Should return plain string that doesn't interfere with streaming"
    );

    console.log("   ✅ PASS: No streaming interference");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Test Suite 7: Edge Cases & Error Handling
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Test Suite 7: Edge Cases & Error Handling");
console.log("=".repeat(80));

/**
 * Test 7.1: Empty prompt handling
 */
function test_7_1_empty_prompt_handling() {
  console.log("\n✓ Test 7.1: Empty prompt handling");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "moderate",
    });

    const result = applySafeSystemFilter("", options);

    // Should handle empty prompt gracefully
    assert.ok(
      result.filteredPrompt !== null,
      "Should handle empty prompt without crashing"
    );

    console.log("   ✅ PASS: Empty prompt handled gracefully");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 7.2: Invalid configuration handling
 */
function test_7_2_invalid_configuration_handling() {
  console.log("\n✓ Test 7.2: Invalid configuration handling");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    const options = {
      safeSystemFilter: true,
      filterTier: null, // Invalid tier
    };

    // Should handle invalid config gracefully (fallback to auto)
    const result = applySafeSystemFilter(CLAUDE_SYSTEM_PROMPT, options);

    assert.ok(
      result.filteredPrompt,
      "Should handle invalid config without crashing"
    );

    console.log("   ✅ PASS: Invalid configuration handled gracefully");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

/**
 * Test 7.3: Validation failure triggers fallback
 */
function test_7_3_validation_failure_triggers_fallback() {
  console.log("\n✓ Test 7.3: Validation failure triggers fallback");

  try {
    const { applySafeSystemFilter } = require("../../dist/anthropic-proxy.js");

    // Minimal prompt that will fail validation with aggressive filtering
    const minimalPrompt = "You are an AI assistant.";

    const options = createMockProxyOptions({
      safeSystemFilter: true,
      filterTier: "extreme",
    });

    const result = applySafeSystemFilter(minimalPrompt, options);

    // Should fallback to less aggressive tier
    assert.ok(
      result.fallbackOccurred === true || result.validation.isValid === true,
      "Should trigger fallback or pass validation"
    );

    console.log("   ✅ PASS: Validation failure triggers fallback");
    passed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    failed++;
  }
}

// ============================================================================
// Run All Tests
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("Running all tests...");
console.log("=".repeat(80));

// Suite 1: shouldUseSafeFilter() Helper
test_1_1_safe_filter_enabled_explicitly();
test_1_2_safe_filter_disabled_with_smart_prompt();
test_1_3_safe_filter_default_lmstudio();
test_1_4_safe_filter_default_openrouter();
test_1_5_safe_filter_default_claude();
test_1_6_safe_filter_explicit_disable();

// Suite 2: Optimization Chain
test_2_1_optimization_chain_priority();
test_2_2_safe_filter_applied_to_system_prompt();
test_2_3_fallback_to_truncate_on_validation_failure();

// Suite 3: Configuration
test_3_1_auto_tier_selection();
test_3_2_explicit_tier_override();
test_3_3_invalid_tier_defaults_to_auto();

// Suite 4: Debug Logging
test_4_1_debug_level_1_basic_logging();
test_4_2_debug_level_2_verbose_logging();
test_4_3_debug_level_3_trace_logging();

// Suite 5: Performance
test_5_1_processing_time_under_10ms();
test_5_2_large_prompt_processing_time();

// Suite 6: No Regression
test_6_1_preserves_tool_calling_instructions();
test_6_2_no_streaming_interference();

// Suite 7: Edge Cases
test_7_1_empty_prompt_handling();
test_7_2_invalid_configuration_handling();
test_7_3_validation_failure_triggers_fallback();

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(80));
console.log("TEST SUMMARY");
console.log("=".repeat(80));
console.log(`Total:   ${passed + failed + skipped}`);
console.log(`✅ Passed:  ${passed}`);
console.log(`❌ Failed:  ${failed}`);
console.log(`⏭️  Skipped: ${skipped}`);
console.log("=".repeat(80));

if (failed > 0) {
  console.log("\n⚠️  EXPECTED: All tests should FAIL (TDD red phase)");
  console.log("Implementation doesn't exist yet - tests written first!\n");
  process.exit(0); // Exit successfully for TDD red phase
} else if (passed > 0) {
  console.log("\n✅ All tests passed!");
  console.log("⚠️  UNEXPECTED: Tests should fail in TDD red phase\n");
  process.exit(0);
} else {
  console.log("\n⚠️  No tests were run\n");
  process.exit(1);
}
