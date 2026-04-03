/**
 * Unit tests for tool-allowlist-filter (Issue #83)
 *
 * Tests the filterToolsByAllowlist function which reduces token usage by
 * filtering tools to only those in the configured allowlist.
 *
 * Tests:
 * - Returns all tools unchanged when allowlist is undefined
 * - Returns all tools unchanged when allowlist is null
 * - Returns empty array when allowlist is empty []
 * - Filters tools to only those in the allowlist
 * - Matching is case-insensitive
 * - Silently ignores allowlist entries that match no tools
 * - Returns correct removedCount
 * - Preserves full tool object structure
 * - Handles empty tools array gracefully
 * - Handles tools with no name field
 * - Single-item allowlist keeps only that tool
 */

const assert = require("assert");

// ---------------------------------------------------------------------------
// Pure-logic implementation of filterToolsByAllowlist (inlined from src/)
// ---------------------------------------------------------------------------

/**
 * Filter tools to only those in the allowlist.
 *
 * Matching is case-insensitive against tool.name.
 *
 * @param {any[]} tools - Array of tool objects (each must have a `name` field)
 * @param {string[] | undefined | null} allowlist - Array of allowed tool names.
 *   When `undefined` or `null`, all tools are returned unchanged.
 *   When empty (`[]`), no tools are returned.
 * @returns {{filtered: any[], removedCount: number}} Object with filtered
 *   tool array and count of removed tools.
 */
function filterToolsByAllowlist(tools, allowlist) {
  // No allowlist configured — pass all tools through unchanged
  if (allowlist === undefined || allowlist === null) {
    return { filtered: tools, removedCount: 0 };
  }

  // Build a lowercase set for O(1) lookup
  const allowedNames = new Set(allowlist.map((name) => name.toLowerCase()));

  const filtered = tools.filter((tool) => {
    const toolName = typeof tool?.name === "string" ? tool.name : "";
    return allowedNames.has(toolName.toLowerCase());
  });

  return {
    filtered,
    removedCount: tools.length - filtered.length,
  };
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeTool(name, extra = {}) {
  return {
    name,
    description: `Description for ${name}`,
    input_schema: { type: "object", properties: {} },
    ...extra,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\n=== Tool Allowlist Filter Tests (#83) ===\n");

const allTools = [
  makeTool("Read"),
  makeTool("Write"),
  makeTool("Edit"),
  makeTool("Bash"),
  makeTool("Glob"),
  makeTool("Grep"),
  makeTool("WebSearch"),
];

test("returns all tools unchanged when allowlist is undefined", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, undefined);
  assert.strictEqual(filtered.length, allTools.length);
  assert.strictEqual(filtered, allTools); // same reference — no copy
  assert.strictEqual(removedCount, 0);
});

test("returns all tools unchanged when allowlist is null", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, null);
  assert.strictEqual(filtered.length, allTools.length);
  assert.strictEqual(removedCount, 0);
});

test("returns empty array when allowlist is an empty array", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, []);
  assert.strictEqual(filtered.length, 0);
  assert.strictEqual(removedCount, allTools.length);
});

test("filters tools to only those in the allowlist", () => {
  const allowlist = ["Read", "Write", "Bash"];
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, allowlist);
  assert.strictEqual(filtered.length, 3);

  const names = filtered.map((t) => t.name);
  assert.ok(names.includes("Read"));
  assert.ok(names.includes("Write"));
  assert.ok(names.includes("Bash"));
  assert.strictEqual(removedCount, allTools.length - 3);
});

test("matching is case-insensitive", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, [
    "read",
    "BASH",
    "gReP",
  ]);
  assert.strictEqual(filtered.length, 3);

  const names = filtered.map((t) => t.name);
  assert.ok(names.includes("Read"));
  assert.ok(names.includes("Bash"));
  assert.ok(names.includes("Grep"));
  assert.strictEqual(removedCount, allTools.length - 3);
});

test("silently ignores allowlist entries that match no tools", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, [
    "Read",
    "NonExistentTool",
  ]);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, "Read");
  assert.strictEqual(removedCount, allTools.length - 1);
});

test("returns correct removedCount", () => {
  const { removedCount } = filterToolsByAllowlist(allTools, ["Glob", "Grep"]);
  assert.strictEqual(removedCount, 5); // 7 - 2
});

test("preserves the full tool object structure", () => {
  const toolWithExtra = makeTool("Read", { myCustomProp: 42 });
  const { filtered } = filterToolsByAllowlist([toolWithExtra], ["Read"]);
  assert.deepStrictEqual(filtered[0], toolWithExtra);
});

test("handles an empty tools array gracefully", () => {
  const { filtered, removedCount } = filterToolsByAllowlist([], ["Read"]);
  assert.strictEqual(filtered.length, 0);
  assert.strictEqual(removedCount, 0);
});

test("handles tools with no name field (skips them when allowlist is set)", () => {
  const namelessTool = { description: "no name" };
  const { filtered, removedCount } = filterToolsByAllowlist(
    [namelessTool, makeTool("Read")],
    ["Read"]
  );
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, "Read");
  assert.strictEqual(removedCount, 1);
});

test("single-item allowlist keeps only that tool", () => {
  const { filtered, removedCount } = filterToolsByAllowlist(allTools, ["Grep"]);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, "Grep");
  assert.strictEqual(removedCount, allTools.length - 1);
});

console.log("\n");
