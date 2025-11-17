/**
 * Integration Test: MLX Server Restoration (Phase 1.1)
 *
 * Tests the restoration of scripts/archive/vllm-mlx-server.py to scripts/mlx-server.py
 * This validates:
 * - File structure and content integrity
 * - Configuration integration
 * - Documentation completeness
 * - No regression to production backend
 *
 * Expected to FAIL until implementation is complete (TDD Red Phase)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.repoRoot = path.resolve(__dirname, "../..");
  }

  test(description, fn) {
    this.tests.push({ description, fn });
  }

  async run() {
    console.log("=".repeat(60));
    console.log("MLX Server Restoration - Integration Tests");
    console.log("=".repeat(60));
    console.log("");

    for (const { description, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`${colors.green}✓${colors.reset} ${description}`);
      } catch (error) {
        this.failed++;
        console.log(`${colors.red}✗${colors.reset} ${description}`);
        console.log(`  ${colors.yellow}${error.message}${colors.reset}`);
      }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("Test Summary");
    console.log("=".repeat(60));
    console.log(`Total: ${this.tests.length}`);
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log("");

    if (this.failed === 0) {
      console.log(`${colors.green}✓ All tests passed!${colors.reset}`);
      process.exit(0);
    } else {
      console.log(
        `${colors.red}✗ ${this.failed} test(s) failed!${colors.reset}`
      );
      console.log("This is expected in TDD Red phase.");
      console.log("");
      console.log("Next steps:");
      console.log("1. Implement the restoration script");
      console.log("2. Update configuration and documentation");
      console.log("3. Re-run this test suite");
      process.exit(1);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  readFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
  }

  isExecutable(filePath) {
    try {
      const stats = fs.statSync(filePath);
      // Check if owner has execute permission (mode & 0o100)
      return (stats.mode & 0o100) !== 0;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Test Definitions
// ============================================================================

const runner = new TestRunner();

// Category 1: File Structure Tests
// ============================================================================

runner.test("Restored file exists at scripts/mlx-server.py", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  runner.assert(runner.fileExists(destPath), `File not found at ${destPath}`);
});

runner.test("Restored file has executable permissions", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist (run previous test first)");
  }
  runner.assert(
    runner.isExecutable(destPath),
    "File is not executable (chmod +x required)"
  );
});

runner.test("File contains correct Python3 shebang", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  const firstLine = content.split("\n")[0];

  runner.assert(
    firstLine === "#!/usr/bin/env python3",
    `Expected shebang '#!/usr/bin/env python3', got '${firstLine}'`
  );
});

runner.test("File size is similar to archived version", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  const archivePath = path.join(
    runner.repoRoot,
    "scripts/archive/vllm-mlx-server.py"
  );

  if (!runner.fileExists(destPath)) {
    throw new Error("Destination file does not exist");
  }

  const destSize = fs.statSync(destPath).size;
  const archiveSize = fs.statSync(archivePath).size;

  // Allow 10% variance
  const minSize = archiveSize * 0.9;
  const maxSize = archiveSize * 1.1;

  runner.assert(
    destSize >= minSize && destSize <= maxSize,
    `File size ${destSize} bytes is outside expected range [${minSize}, ${maxSize}] (archive: ${archiveSize} bytes)`
  );
});

// Category 2: Code Quality Tests
// ============================================================================

runner.test("File contains valid Python syntax", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  try {
    execSync(`python3 -m py_compile "${destPath}"`, { stdio: "pipe" });
  } catch (error) {
    throw new Error(`Python syntax validation failed: ${error.message}`);
  }
});

runner.test("File contains required imports (mlx.core)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("import mlx.core"),
    "Missing required import: mlx.core"
  );
});

runner.test("File contains required imports (fastapi)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("from fastapi import FastAPI"),
    "Missing required import: FastAPI"
  );
});

runner.test("File contains required imports (uvicorn)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("import uvicorn"),
    "Missing required import: uvicorn"
  );
});

runner.test("File contains required imports (mlx_lm)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("import mlx_lm"),
    "Missing required import: mlx_lm"
  );
});

runner.test("File contains module docstring", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes('"""') || content.includes("'''"),
    "File should have a module-level docstring"
  );
});

// Category 3: Class Definitions
// ============================================================================

runner.test("File defines MLXKVCacheManager class", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.match(/^class MLXKVCacheManager/m),
    "Missing class definition: MLXKVCacheManager"
  );
});

runner.test("File defines PromptCache class", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.match(/^class PromptCache/m),
    "Missing class definition: PromptCache"
  );
});

runner.test("File defines VLLMMLXServer class", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.match(/^class VLLMMLXServer/m),
    "Missing class definition: VLLMMLXServer"
  );
});

runner.test("File implements CLI argument parsing (argparse)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("argparse"),
    "Should use argparse for CLI argument parsing"
  );
});

// Category 4: Security Tests
// ============================================================================

runner.test("No hardcoded API keys detected", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  const apiKeyPattern = /sk-[a-zA-Z0-9]{48}/;

  runner.assert(
    !apiKeyPattern.test(content),
    "Hardcoded API key pattern detected (sk-...)"
  );
});

runner.test("No hardcoded passwords detected", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  const passwordPattern = /password\s*=\s*["'][^"']+["']/i;

  runner.assert(!passwordPattern.test(content), "Hardcoded password detected");
});

runner.test("Uses pathlib.Path for safe path handling", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("from pathlib import Path"),
    "Should import pathlib.Path for safe path operations"
  );
});

runner.test("No shell injection vulnerabilities (os.system)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    !content.includes("os.system"),
    "Should not use os.system (shell injection risk)"
  );
});

runner.test("No shell injection vulnerabilities (shell=True)", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    !content.includes("shell=True"),
    "Should not use shell=True (shell injection risk)"
  );
});

runner.test("Uses environment variables for configuration", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const content = runner.readFile(destPath);
  runner.assert(
    content.includes("os.environ.get") || content.includes("os.getenv"),
    "Should use os.environ.get() or os.getenv() for configuration"
  );
});

// Category 5: Configuration Integration
// ============================================================================

runner.test("Example config documents legacy MLX backend", () => {
  const configPath = path.join(runner.repoRoot, ".anyclauderc.example.json");
  const content = runner.readFile(configPath);

  runner.assert(
    content.includes("mlx-server") ||
      content.includes('"mlx"') ||
      content.includes("legacy"),
    "Example config should document the legacy MLX backend option"
  );
});

runner.test("Example config still references production backend", () => {
  const configPath = path.join(runner.repoRoot, ".anyclauderc.example.json");
  const content = runner.readFile(configPath);

  runner.assert(
    content.includes("mlx-textgen-server.sh"),
    "Example config should still reference production MLX-Textgen backend"
  );
});

// Category 6: Documentation
// ============================================================================

runner.test("Migration documentation exists", () => {
  const docPath = path.join(runner.repoRoot, "docs/guides/mlx-migration.md");
  runner.assert(
    runner.fileExists(docPath),
    "Should create docs/guides/mlx-migration.md explaining migration"
  );
});

runner.test("Migration documentation explains differences", () => {
  const docPath = path.join(runner.repoRoot, "docs/guides/mlx-migration.md");
  if (!runner.fileExists(docPath)) {
    throw new Error("Migration documentation does not exist");
  }

  const content = runner.readFile(docPath);
  runner.assert(
    content.includes("mlx-server") && content.includes("mlx-textgen"),
    "Migration doc should explain differences between legacy and production"
  );
});

runner.test("Archive README documents MLX server files", () => {
  const readmePath = path.join(runner.repoRoot, "scripts/archive/README.md");
  const content = runner.readFile(readmePath);

  runner.assert(
    content.includes("mlx-server") || content.includes("vllm-mlx-server"),
    "Archive README should document MLX server files"
  );
});

runner.test("CHANGELOG mentions restoration", () => {
  const changelogPath = path.join(runner.repoRoot, "CHANGELOG.md");
  const content = runner.readFile(changelogPath);

  // Check first 100 lines for recent changes (changelog entries are newest-first)
  const lines = content.split("\n");
  const recentLines = lines.slice(0, 100).join("\n");

  runner.assert(
    /mlx-server|restore.*mlx|legacy.*mlx/i.test(recentLines),
    "CHANGELOG should document MLX server restoration"
  );
});

// Category 7: Regression Prevention
// ============================================================================

runner.test("Production backend still exists (mlx-textgen-server.sh)", () => {
  const prodPath = path.join(runner.repoRoot, "scripts/mlx-textgen-server.sh");
  runner.assert(
    runner.fileExists(prodPath),
    "Production backend (mlx-textgen-server.sh) should be unaffected"
  );
});

runner.test("File organization standards maintained", () => {
  const destPath = path.join(runner.repoRoot, "scripts/mlx-server.py");
  if (!runner.fileExists(destPath)) {
    throw new Error("File does not exist");
  }

  const dirName = path.dirname(destPath);
  const expectedDir = path.join(runner.repoRoot, "scripts");

  runner.assert(
    dirName === expectedDir,
    `File should be in scripts/, got ${dirName}`
  );
});

runner.test("Archive directory is clean (no temp files)", () => {
  const archiveDir = path.join(runner.repoRoot, "scripts/archive");
  const files = fs.readdirSync(archiveDir);

  const tempFiles = files.filter(
    (file) =>
      file.endsWith(".log") ||
      file.endsWith(".tmp") ||
      file.endsWith(".pyc") ||
      file.endsWith("~")
  );

  runner.assert(
    tempFiles.length === 0,
    `Found ${tempFiles.length} temporary files in archive: ${tempFiles.join(", ")}`
  );
});

runner.test("No files created in project root", () => {
  const rootDir = runner.repoRoot;
  const files = fs.readdirSync(rootDir);

  // Check for any new .py files in root (shouldn't be there)
  const pythonFilesInRoot = files.filter(
    (file) => file.endsWith(".py") && !file.startsWith(".")
  );

  runner.assert(
    pythonFilesInRoot.length === 0,
    `Python files should not be in project root, found: ${pythonFilesInRoot.join(", ")}`
  );
});

// ============================================================================
// Run Tests
// ============================================================================

runner.run().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
