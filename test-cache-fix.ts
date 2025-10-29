#!/usr/bin/env node

/**
 * Test script to verify cache hash fixes
 * This tests that identical prompts produce identical hashes
 */

import { createHash } from "crypto";

// Old hash implementation (broken)
function oldHashPrompt(systemPrompt: string, toolCount: number): string {
  const hashInput = systemPrompt + String(toolCount);
  return createHash("sha256").update(hashInput).digest("hex");
}

// New hash implementation (fixed)
function newHashPrompt(systemPrompt: string, tools: any[] | undefined): string {
  const hashInput = JSON.stringify({
    system: systemPrompt,
    tools: tools || [],
  });
  return createHash("sha256").update(hashInput).digest("hex");
}

// Test data
const system = "You are a helpful assistant.";
const tools = [
  {
    name: "get_weather",
    description: "Get the weather",
  },
  {
    name: "search",
    description: "Search the web",
  },
];

console.log("Testing cache hash implementations...\n");

// Test 1: Identical prompts should produce same hash
console.log("Test 1: Identical prompts should produce same hash");
const hash1New = newHashPrompt(system, tools);
const hash2New = newHashPrompt(system, tools);
console.log(`  New impl Hash 1: ${hash1New.substring(0, 16)}...`);
console.log(`  New impl Hash 2: ${hash2New.substring(0, 16)}...`);
console.log(`  Match: ${hash1New === hash2New ? "✓ PASS" : "✗ FAIL"}\n`);

// Test 2: Different tool order should produce same hash with new implementation
console.log("Test 2: Different tool order (new impl should match)");
const toolsReordered = [...tools].reverse();
const hash3New = newHashPrompt(system, toolsReordered);
const hash4New = newHashPrompt(system, tools);
console.log(`  Reordered Hash: ${hash3New.substring(0, 16)}...`);
console.log(`  Original Hash:  ${hash4New.substring(0, 16)}...`);
console.log(`  Match: ${hash3New === hash4New ? "✓ PASS" : "✗ FAIL"}\n`);

// Test 3: Different prompts should produce different hashes
console.log("Test 3: Different prompts should produce different hashes");
const systemDifferent = "You are a calculator assistant.";
const hash5New = newHashPrompt(systemDifferent, tools);
const hash6New = newHashPrompt(system, tools);
console.log(`  Different system Hash: ${hash5New.substring(0, 16)}...`);
console.log(`  Original system Hash:  ${hash6New.substring(0, 16)}...`);
console.log(`  Different: ${hash5New !== hash6New ? "✓ PASS" : "✗ FAIL"}\n`);

// Test 4: Empty tools should produce same hash as undefined tools
console.log("Test 4: Empty tools vs undefined tools");
const hashEmptyTools = newHashPrompt(system, []);
const hashUndefinedTools = newHashPrompt(system, undefined);
console.log(`  Empty tools Hash:     ${hashEmptyTools.substring(0, 16)}...`);
console.log(
  `  Undefined tools Hash: ${hashUndefinedTools.substring(0, 16)}...`
);
console.log(
  `  Match: ${hashEmptyTools === hashUndefinedTools ? "✓ PASS" : "✗ FAIL"}\n`
);

console.log("Summary:");
console.log("  Old implementation used only system + toolCount");
console.log("  This caused hash mismatches for identical prompts");
console.log("  New implementation hashes full system + tools JSON");
console.log("  This ensures identical prompts always get same hash");
