#!/usr/bin/env node
/**
 * Checkpoint script for test-master agent
 * Saves completion status after test creation
 */

const path = require("path");
const fs = require("fs");

// Portable path detection (works from any directory)
let current = process.cwd();
let projectRoot;

while (current !== path.dirname(current)) {
  if (
    fs.existsSync(path.join(current, ".git")) ||
    fs.existsSync(path.join(current, ".claude"))
  ) {
    projectRoot = current;
    break;
  }
  current = path.dirname(current);
}

if (!projectRoot) {
  projectRoot = process.cwd();
}

// Add lib to path for imports
const libPath = path.join(projectRoot, "plugins/autonomous-dev/lib");
if (fs.existsSync(libPath)) {
  // Try to import and use AgentTracker
  try {
    const AgentTracker = require(
      path.join(libPath, "agent_tracker.js")
    ).AgentTracker;
    AgentTracker.save_agent_checkpoint(
      "test-master",
      "Tests complete - 63 tests created for mlx-cluster mode integration"
    );
    console.log("✅ Checkpoint saved");
  } catch (error) {
    console.log(
      "ℹ️  Checkpoint skipped (library not available):",
      error.message
    );
  }
} else {
  console.log("ℹ️  Checkpoint skipped (user project)");
}
