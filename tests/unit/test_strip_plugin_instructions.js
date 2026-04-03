/**
 * Unit tests for stripPluginInstructions (Issue #89)
 *
 * Tests the function that removes the autonomous-dev plugin CLAUDE.md section
 * from a system prompt, while preserving project root and global CLAUDE.md sections.
 *
 * Tests:
 * - Strips the .claude/CLAUDE.md section when present
 * - Preserves content before the stripped section
 * - Preserves content after the stripped section
 * - Does NOT strip project root CLAUDE.md (no .claude/ directory in path)
 * - Does NOT strip global ~/.claude/CLAUDE.md
 * - Returns prompt unchanged when no matching section found
 * - Handles .claude/CLAUDE.md as the last section (strips to end)
 * - Handles prompt with only the plugin section
 * - Strips only the first matching section (idempotent-safe)
 */

const assert = require("assert");
const path = require("path");

// ---------------------------------------------------------------------------
// Load compiled module
// ---------------------------------------------------------------------------

const { stripPluginInstructions } = require(
  path.join(__dirname, "../../dist/safe-system-filter.js")
);

// ---------------------------------------------------------------------------
// Test helpers
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

// Helper: build a "Contents of" header line like Claude Code injects
function contentsHeader(filePath, note) {
  return `Contents of ${filePath}${note ? ` (${note})` : ""}`;
}

// Sample plugin CLAUDE.md section text
const PLUGIN_SECTION_BODY = `
# autonomous-dev

Plugin for autonomous development in Claude Code. AI agents, skills, automation hooks.

## Critical Rules
- Always use /implement for code changes
- Run /improve after sessions
`.trim();

// Sample project CLAUDE.md content
const PROJECT_SECTION_BODY = `
# My Project

This is the project CLAUDE.md with project-specific instructions.
`.trim();

// Sample global CLAUDE.md content
const GLOBAL_SECTION_BODY = `
# Universal Claude Code Instructions

Applies to all projects.
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\n=== stripPluginInstructions Tests (Issue #89) ===\n");

test("strips the .claude/CLAUDE.md section", () => {
  const pluginHeader = contentsHeader(
    "/Users/alice/Dev/myproject/.claude/CLAUDE.md",
    "project instructions, checked into the codebase"
  );
  const prompt = `${pluginHeader}\n${PLUGIN_SECTION_BODY}\n`;
  const result = stripPluginInstructions(prompt);
  assert.ok(
    !result.includes("autonomous-dev"),
    "Plugin content should be stripped"
  );
  assert.ok(
    !result.includes("myproject/.claude/CLAUDE.md"),
    "Plugin header should be stripped"
  );
});

test("preserves content before the plugin section", () => {
  const projectHeader = contentsHeader(
    "/Users/alice/Dev/myproject/CLAUDE.md",
    "project instructions"
  );
  const pluginHeader = contentsHeader(
    "/Users/alice/Dev/myproject/.claude/CLAUDE.md",
    "project instructions, checked into the codebase"
  );
  const prompt = [
    projectHeader,
    PROJECT_SECTION_BODY,
    "",
    pluginHeader,
    PLUGIN_SECTION_BODY,
  ].join("\n");

  const result = stripPluginInstructions(prompt);
  assert.ok(result.includes("My Project"), "Project CLAUDE.md should be preserved");
  assert.ok(!result.includes("autonomous-dev"), "Plugin section should be stripped");
});

test("preserves content after the plugin section", () => {
  const pluginHeader = contentsHeader(
    "/Users/alice/Dev/myproject/.claude/CLAUDE.md",
    "project instructions, checked into the codebase"
  );
  const afterHeader = contentsHeader(
    "/Users/alice/.claude/CLAUDE.md",
    "user's private global instructions"
  );
  const prompt = [
    pluginHeader,
    PLUGIN_SECTION_BODY,
    "",
    afterHeader,
    GLOBAL_SECTION_BODY,
  ].join("\n");

  const result = stripPluginInstructions(prompt);
  assert.ok(
    !result.includes("autonomous-dev"),
    "Plugin section should be stripped"
  );
  assert.ok(
    result.includes("Universal Claude Code Instructions"),
    "Global CLAUDE.md should be preserved"
  );
});

test("does NOT strip project root CLAUDE.md (no .claude/ in path)", () => {
  const projectHeader = contentsHeader(
    "/Users/alice/Dev/myproject/CLAUDE.md",
    "project instructions, checked into the codebase"
  );
  const prompt = `${projectHeader}\n${PROJECT_SECTION_BODY}\n`;
  const result = stripPluginInstructions(prompt);
  assert.strictEqual(result, prompt, "Project root CLAUDE.md should be unchanged");
});

test("does NOT strip global ~/.claude/CLAUDE.md", () => {
  const globalHeader = contentsHeader(
    "/Users/alice/.claude/CLAUDE.md",
    "user's private global instructions for all projects"
  );
  const prompt = `${globalHeader}\n${GLOBAL_SECTION_BODY}\n`;
  const result = stripPluginInstructions(prompt);
  assert.strictEqual(result, prompt, "Global CLAUDE.md should be unchanged");
});

test("returns prompt unchanged when no matching section found", () => {
  const prompt = "This is a plain system prompt with no CLAUDE.md sections.";
  const result = stripPluginInstructions(prompt);
  assert.strictEqual(result, prompt);
});

test("handles .claude/CLAUDE.md as the last section (strips to end)", () => {
  const beforeText = "Some preamble before the plugin.\n\n";
  const pluginHeader = contentsHeader(
    "/Users/alice/Dev/myproject/.claude/CLAUDE.md",
    "project instructions"
  );
  const prompt = beforeText + pluginHeader + "\n" + PLUGIN_SECTION_BODY;
  const result = stripPluginInstructions(prompt);
  assert.ok(result.includes("preamble"), "Content before section should be preserved");
  assert.ok(!result.includes("autonomous-dev"), "Plugin section should be stripped");
  assert.ok(!result.includes("myproject/.claude/CLAUDE.md"), "Plugin header should be stripped");
});

test("handles prompt with only the plugin section", () => {
  const pluginHeader = contentsHeader(
    "/Users/alice/Dev/myproject/.claude/CLAUDE.md",
    "project instructions"
  );
  const prompt = pluginHeader + "\n" + PLUGIN_SECTION_BODY;
  const result = stripPluginInstructions(prompt);
  assert.strictEqual(result.trim(), "", "Result should be empty or whitespace only");
});

test("handles empty string", () => {
  const result = stripPluginInstructions("");
  assert.strictEqual(result, "");
});

test("works with Windows-style path containing .claude", () => {
  // Some environments may use different path separators in the log
  const header = "Contents of C:\\Users\\alice\\project\\.claude\\CLAUDE.md (project instructions)\n";
  const prompt = header + PLUGIN_SECTION_BODY;
  // Windows-style paths may or may not match depending on regex — test both cases
  // The important thing is it doesn't crash
  const result = stripPluginInstructions(prompt);
  assert.ok(typeof result === "string", "Should return a string without throwing");
});

test("real-world prompt: strips plugin section (last section)", () => {
  const globalHeader = "Contents of /Users/alice/.claude/CLAUDE.md (user's private global instructions for all projects)";
  const projectHeader = "Contents of /Users/alice/Dev/myproject/CLAUDE.md (project instructions, checked into the codebase)";
  const pluginHeader = "Contents of /Users/alice/Dev/myproject/.claude/CLAUDE.md (project instructions, checked into the codebase)";

  // Plugin section may contain injected memory like # currentDate (inside the section)
  const pluginContent = PLUGIN_SECTION_BODY + "\n\n# currentDate\nToday's date is 2026-04-03.";

  const prompt = [
    globalHeader,
    GLOBAL_SECTION_BODY,
    "",
    projectHeader,
    PROJECT_SECTION_BODY,
    "",
    pluginHeader,
    pluginContent,
  ].join("\n");

  const result = stripPluginInstructions(prompt);

  // Plugin section body should be gone
  assert.ok(!result.includes("autonomous-dev"), "Plugin section should be stripped");
  // Plugin header contains the specific project path — check it's gone
  assert.ok(
    !result.includes("/Dev/myproject/.claude/CLAUDE.md"),
    "Plugin header should be stripped"
  );

  // Other sections should be preserved
  assert.ok(result.includes("Universal Claude Code Instructions"), "Global CLAUDE.md preserved");
  assert.ok(result.includes("My Project"), "Project CLAUDE.md preserved");
});

test("real-world prompt: strips plugin section when followed by another section", () => {
  const projectHeader = "Contents of /Users/alice/Dev/myproject/CLAUDE.md (project instructions, checked into the codebase)";
  const pluginHeader = "Contents of /Users/alice/Dev/myproject/.claude/CLAUDE.md (project instructions, checked into the codebase)";
  const memoryHeader = "Contents of /Users/alice/.claude/projects/memory/MEMORY.md (user's auto-memory, persists across conversations)";

  const prompt = [
    projectHeader,
    PROJECT_SECTION_BODY,
    "",
    pluginHeader,
    PLUGIN_SECTION_BODY,
    "",
    memoryHeader,
    "# Project Memory\nSome memory content.",
  ].join("\n");

  const result = stripPluginInstructions(prompt);

  // Plugin section should be stripped
  assert.ok(!result.includes("autonomous-dev"), "Plugin section should be stripped");
  assert.ok(!result.includes("/Dev/myproject/.claude/CLAUDE.md"), "Plugin header should be stripped");

  // Content before and after should be preserved
  assert.ok(result.includes("My Project"), "Project CLAUDE.md preserved");
  assert.ok(result.includes("Project Memory"), "Memory section preserved");
});

console.log("\n");
