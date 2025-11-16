/**
 * Setup and dependency checker for anyclaude
 * Verifies all required components are installed and configured
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface DependencyCheckResult {
  ok: boolean;
  message: string;
  canFix?: boolean;
}

interface SetupCheckResult {
  claudeVersion: string | null;
  hasLocalClaude: boolean;
  isClaudeMax: boolean;
  pythonVenvExists: boolean;
  vllmMlxDependencies: boolean;
  modelPath: string | null;
  allOk: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * Check if Claude Code is installed and what version
 */
export function checkClaudeInstallation(): DependencyCheckResult {
  try {
    const output = execSync("which claude 2>&1", { encoding: "utf8" }).trim();
    if (!output) {
      return {
        ok: false,
        message: "Claude Code CLI not found in PATH",
        canFix: true,
      };
    }

    const versionOutput = execSync("claude --version 2>&1", {
      encoding: "utf8",
    }).trim();

    // Check if it's Claude Code Max (web version)
    if (
      versionOutput.includes("Max") ||
      versionOutput.includes("web") ||
      versionOutput.includes("cloud")
    ) {
      return {
        ok: false,
        message: `Found Claude Code Max (web version): ${versionOutput}`,
        canFix: true,
      };
    }

    return {
      ok: true,
      message: `Found local Claude Code: ${versionOutput}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Claude Code not found",
      canFix: true,
    };
  }
}

/**
 * Check if Python virtual environment exists for MLX
 */
export function checkPythonVenv(): DependencyCheckResult {
  const venvPath = path.join(os.homedir(), ".venv-mlx");
  const pythonPath = path.join(venvPath, "bin", "python3");

  if (!fs.existsSync(pythonPath)) {
    return {
      ok: false,
      message: `Python venv not found at ${venvPath}`,
      canFix: true,
    };
  }

  // Check if required packages are installed
  try {
    execSync(`${pythonPath} -m pip list | grep -E "(uvicorn|fastapi|mlx)"`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    return {
      ok: true,
      message: `Python venv found with required packages at ${venvPath}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Python venv found but missing required packages`,
      canFix: true,
    };
  }
}

/**
 * Check if a model path is configured and exists
 */
export function checkModelConfiguration(): DependencyCheckResult {
  const configPath = path.join(process.cwd(), ".anyclauderc.json");

  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      message: ".anyclauderc.json not found",
      canFix: true,
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const modelPath = config.backends?.["vllm-mlx"]?.model;

    if (!modelPath) {
      return {
        ok: false,
        message: "No model path configured in .anyclauderc.json",
        canFix: true,
      };
    }

    if (!fs.existsSync(modelPath)) {
      return {
        ok: false,
        message: `Configured model path not found: ${modelPath}`,
        canFix: false,
      };
    }

    return {
      ok: true,
      message: `Model path configured and accessible: ${path.basename(modelPath)}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Error reading .anyclauderc.json configuration",
      canFix: false,
    };
  }
}

/**
 * Run full setup check
 */
export function runFullSetupCheck(): SetupCheckResult {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check Claude installation
  const claudeCheck = checkClaudeInstallation();
  let claudeVersion: string | null = null;
  let hasLocalClaude = false;
  let isClaudeMax = false;

  if (claudeCheck.ok) {
    hasLocalClaude = true;
    claudeVersion = claudeCheck.message.split(": ")[1] || "unknown";
  } else {
    issues.push(claudeCheck.message);
    if (claudeCheck.canFix) {
      suggestions.push(
        "Install Claude Code CLI: npm install -g @anthropic-ai/sdk"
      );
      suggestions.push(
        "Or follow: https://docs.anthropic.com/en/docs/build-a-bot#quickstart"
      );
    }
    if (claudeCheck.message.includes("Max")) {
      isClaudeMax = true;
      suggestions.push(
        "Uninstall Claude Code Max and install the local CLI version instead"
      );
      suggestions.push("Local version supports ANTHROPIC_BASE_URL proxy");
    }
  }

  // Check Python venv
  const venvCheck = checkPythonVenv();
  let pythonVenvExists = venvCheck.ok;

  if (!venvCheck.ok) {
    issues.push(venvCheck.message);
    if (venvCheck.canFix) {
      suggestions.push("Set up Python venv: scripts/setup-vllm-mlx-venv.sh");
    }
  }

  // Check model configuration
  const modelCheck = checkModelConfiguration();
  let modelPath: string | null = null;

  if (modelCheck.ok) {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), ".anyclauderc.json"), "utf8")
    );
    modelPath = config.backends?.["vllm-mlx"]?.model;
  } else {
    issues.push(modelCheck.message);
    if (modelCheck.canFix) {
      suggestions.push(
        "Update .anyclauderc.json with vllm-mlx backend configuration"
      );
      suggestions.push(
        "Set backends.vllm-mlx.model to your MLX model directory path"
      );
    }
  }

  const allOk = issues.length === 0;

  return {
    claudeVersion,
    hasLocalClaude,
    isClaudeMax,
    pythonVenvExists,
    vllmMlxDependencies: venvCheck.ok,
    modelPath,
    allOk,
    issues,
    suggestions,
  };
}

/**
 * Display setup status report
 */
export function displaySetupStatus(): void {
  const result = runFullSetupCheck();

  console.log("\n" + "=".repeat(60));
  console.log("🔍 anyclaude Setup Check");
  console.log("=".repeat(60) + "\n");

  // Claude version
  console.log("📦 Claude Code:");
  if (result.hasLocalClaude) {
    console.log(`  ✅ Local CLI installed (${result.claudeVersion})`);
  } else if (result.isClaudeMax) {
    console.log(`  ❌ Claude Code Max (web) detected - not compatible`);
  } else {
    console.log(`  ❌ Not installed`);
  }

  // Python venv
  console.log("\n🐍 Python Environment:");
  if (result.pythonVenvExists) {
    console.log(`  ✅ Virtual environment ready at ~/.venv-mlx`);
  } else {
    console.log(`  ❌ Virtual environment not found`);
  }

  // Model configuration
  console.log("\n🤖 Model Configuration:");
  if (result.modelPath) {
    console.log(`  ✅ Model configured: ${path.basename(result.modelPath)}`);
  } else {
    console.log(`  ❌ Model not configured`);
  }

  // Overall status
  console.log("\n" + "-".repeat(60));
  if (result.allOk) {
    console.log("✅ All dependencies OK - Ready to run anyclaude!");
  } else {
    console.log(`⚠️  ${result.issues.length} issue(s) found:\n`);
    result.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });

    console.log("\n💡 Suggested fixes:\n");
    result.suggestions.forEach((suggestion, i) => {
      console.log(`  ${i + 1}. ${suggestion}`);
    });
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Check if we should fail startup due to missing dependencies
 */
export function shouldFailStartup(mode: string): boolean {
  if (mode === "claude") {
    // Claude mode doesn't need local backend
    return false;
  }

  const result = runFullSetupCheck();

  if (!result.hasLocalClaude) {
    console.error(
      "\n❌ ERROR: Local Claude Code CLI required for mode: " + mode
    );
    console.error(
      "\nClimate Code Max (web version) does not support custom endpoints."
    );
    console.error("\nInstall local Claude CLI:");
    console.error("  npm install -g @anthropic-ai/sdk");
    console.error("");
    return true;
  }

  // Only vllm-mlx mode requires Python (for auto-launch)
  // lmstudio and openrouter modes connect to existing servers
  if (mode === "vllm-mlx" && !result.pythonVenvExists) {
    console.error("\n❌ ERROR: Python environment required for mode: " + mode);
    console.error("\nSet up Python environment:");
    console.error("  scripts/setup-vllm-mlx-venv.sh");
    console.error("");
    return true;
  }

  return false;
}
