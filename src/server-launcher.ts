/**
 * Automatic server launcher for local backends
 * Starts MLX-LM, LMStudio, or other servers based on .anyclauderc.json config
 */

import { spawn, spawnSync, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { debug } from "./debug";

interface ServerLauncherConfig {
  backend: string;
  port?: number;
  model?: string;
  baseUrl?: string;
  pythonVenv?: string;
}

/**
 * Track spawned server processes for graceful shutdown
 */
let spawnedServerProcess: ChildProcess | null = null;

/**
 * Register a server process for cleanup on exit
 */
export function registerServerProcess(process: ChildProcess): void {
  spawnedServerProcess = process;
}

/**
 * Get the currently tracked server process
 */
export function getServerProcess(): ChildProcess | null {
  return spawnedServerProcess;
}

/**
 * Cleanup spawned server process
 */
export function cleanupServerProcess(): void {
  if (spawnedServerProcess) {
    try {
      // Kill the process group to ensure all child processes are terminated
      // Use negative PID to kill the entire process group
      if (spawnedServerProcess.pid) {
        debug(1, `[server-launcher] Killing process group for PID ${spawnedServerProcess.pid}`);
        process.kill(-spawnedServerProcess.pid, "SIGTERM");

        // Give it a moment to exit gracefully
        // Then send SIGKILL if still running
        setTimeout(() => {
          try {
            if (spawnedServerProcess && spawnedServerProcess.pid) {
              process.kill(-spawnedServerProcess.pid, "SIGKILL");
              debug(1, `[server-launcher] Sent SIGKILL to process group ${spawnedServerProcess.pid}`);
            }
          } catch (e) {
            // Process already exited
          }
        }, 1000);
      }
    } catch (error) {
      // Process may have already exited
      debug(1, "[server-launcher] Error killing server process:", error);
    }
    spawnedServerProcess = null;
  }
}

/**
 * Check if a server is already running on a given port
 */
export function isServerRunning(port: number): boolean {
  try {
    const result = spawnSync("lsof", ["-i", `-P`, `-n`, `-sTCP:LISTEN`], {
      encoding: "utf8",
    });

    if (result.stdout) {
      const lines = result.stdout.split("\n");
      return lines.some((line) => {
        const match = line.match(`:${port}\s/`);
        return match !== null;
      });
    }
    return false;
  } catch (error) {
    debug(1, "[server-launcher] Could not check if server is running:", error);
    return false;
  }
}

/**
 * Start MLX-LM server with a specific model
 */
export function startMLXLMServer(config: ServerLauncherConfig): void {
  const port = config.port || 8081;
  const modelPath = config.model;
  const pythonVenv = config.pythonVenv || path.join(os.homedir(), ".venv-mlx");

  if (!modelPath) {
    console.error("[anyclaude] MLX-LM model path is required in .anyclauderc.json");
    console.error("[anyclaude] Add backends.mlx-lm.model to your config file");
    process.exit(1);
  }

  // Check if model path exists
  if (!fs.existsSync(modelPath)) {
    console.error(`[anyclaude] Model path not found: ${modelPath}`);
    process.exit(1);
  }

  console.log(`[anyclaude] Starting MLX-LM server...`);
  console.log(`[anyclaude] Model: ${path.basename(modelPath)}`);
  console.log(`[anyclaude] Port: ${port}`);
  console.log(`[anyclaude] Waiting ~50 seconds for model to load...`);

  // Build command to activate venv and start MLX-LM
  const activateScript = path.join(pythonVenv, "bin", "activate");
  const command = `source ${activateScript} && python3 -m mlx_lm server --model "${modelPath}" --port ${port}`;

  const serverProcess = spawn("bash", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Create a new process group so we can kill all children
  });

  // Register process for cleanup on exit
  registerServerProcess(serverProcess);

  // Listen for output to know when server is ready
  let isReady = false;
  serverProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    if (output.includes("Starting httpd") || output.includes("listening")) {
      isReady = true;
      debug(1, "[server-launcher] MLX-LM server started successfully");
    }
  });

  serverProcess.stderr?.on("data", (data) => {
    const output = data.toString();
    if (output.includes("error") || output.includes("Error")) {
      console.error(`[anyclaude] MLX-LM error: ${output}`);
    }
  });

  serverProcess.on("error", (error) => {
    console.error(`[anyclaude] Failed to start MLX-LM server: ${error.message}`);
    process.exit(1);
  });

  // Keep the server running in the background
  serverProcess.unref();

  // Give server time to start
  return;
}

/**
 * Start LMStudio server (assumes it's already running or started manually)
 */
export function startLMStudioServer(config: ServerLauncherConfig): void {
  const port = config.port || 1234;
  const baseUrl = config.baseUrl || `http://localhost:${port}/v1`;

  console.log(`[anyclaude] LMStudio configured at ${baseUrl}`);
  console.log(`[anyclaude] Make sure LMStudio is running with a model loaded`);
  console.log(`[anyclaude] You can start it manually or configure auto-start in settings`);
}

/**
 * Start vLLM-MLX server
 */
export function startVLLMMLXServer(config: ServerLauncherConfig): void {
  const port = config.port || 8081;
  const modelPath = config.model;
  const serverScript = "scripts/vllm-mlx-server.py";
  const pythonVenv = config.pythonVenv || path.join(os.homedir(), ".venv-mlx");

  if (!modelPath || modelPath === "current-model") {
    console.log("[anyclaude] vLLM-MLX auto-launch disabled (no model path configured)");
    console.log("[anyclaude] Assuming server is running on http://localhost:8081");
    console.log("[anyclaude] To enable auto-launch, add backends.vllm-mlx.model to .anyclauderc.json");
    return;
  }

  // Check if model path exists
  if (!fs.existsSync(modelPath)) {
    console.error(`[anyclaude] Model path not found: ${modelPath}`);
    console.error("[anyclaude] Make sure the model path in .anyclauderc.json is correct");
    process.exit(1);
  }

  console.log(`[anyclaude] Starting vLLM-MLX server...`);
  console.log(`[anyclaude] Model: ${path.basename(modelPath)}`);
  console.log(`[anyclaude] Port: ${port}`);
  console.log(`[anyclaude] Waiting ~30 seconds for model to load...`);

  // Get the absolute path to the server script
  const serverScriptPath = path.resolve(serverScript);

  if (!fs.existsSync(serverScriptPath)) {
    console.error(`[anyclaude] Server script not found: ${serverScriptPath}`);
    process.exit(1);
  }

  // Check if venv exists
  const activateScript = path.join(pythonVenv, "bin", "activate");
  if (!fs.existsSync(activateScript)) {
    console.error(`[anyclaude] Python virtual environment not found: ${pythonVenv}`);
    console.error("[anyclaude] Please run: scripts/setup-vllm-mlx-venv.sh");
    process.exit(1);
  }

  // Build command to activate venv and start vLLM-MLX
  const command = `source ${activateScript} && python3 ${serverScriptPath} --model "${modelPath}" --port ${port}`;

  const serverProcess = spawn("bash", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Create a new process group so we can kill all children
  });

  // Register process for cleanup on exit
  registerServerProcess(serverProcess);

  // Listen for output to know when server is ready
  serverProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    if (output.includes("Uvicorn running") || output.includes("Application startup complete")) {
      debug(1, "[server-launcher] vLLM-MLX server started successfully");
    }
  });

  serverProcess.stderr?.on("data", (data) => {
    const output = data.toString();
    if (output.includes("error") || output.includes("Error")) {
      console.error(`[anyclaude] vLLM-MLX error: ${output}`);
    }
  });

  serverProcess.on("error", (error) => {
    console.error(`[anyclaude] Failed to start vLLM-MLX server: ${error.message}`);
    process.exit(1);
  });

  // Keep the server running in the background
  serverProcess.unref();

  return;
}

/**
 * Launch backend server based on configuration
 */
export function launchBackendServer(
  mode: string,
  config: { backends?: Record<string, any>; pythonVenv?: string }
): void {
  if (process.env.ANYCLAUDE_NO_AUTO_LAUNCH) {
    debug(1, "[server-launcher] Auto-launch disabled via ANYCLAUDE_NO_AUTO_LAUNCH");
    return;
  }

  // Skip if backend is Claude API (no local server needed)
  if (mode === "claude") {
    debug(1, "[server-launcher] Using Claude API, no local server needed");
    return;
  }

  const backendConfig = config.backends?.[mode];
  if (!backendConfig) {
    debug(1, `[server-launcher] No config found for backend: ${mode}`);
    return;
  }

  const port = backendConfig.port || (mode === "mlx-lm" || mode === "vllm-mlx" ? 8081 : 1234);

  // Check if server is already running
  if (isServerRunning(port)) {
    console.log(`[anyclaude] ${mode} server already running on port ${port}`);
    return;
  }

  // Launch appropriate server
  if (mode === "mlx-lm") {
    startMLXLMServer({
      backend: mode,
      port,
      model: backendConfig.model,
      pythonVenv: config.pythonVenv,
    });
  } else if (mode === "vllm-mlx") {
    startVLLMMLXServer({
      backend: mode,
      port,
      model: backendConfig.model,
    });
  } else if (mode === "lmstudio") {
    startLMStudioServer({
      backend: mode,
      port,
      baseUrl: backendConfig.baseUrl,
    });
  } else {
    debug(1, `[server-launcher] No auto-launch support for backend: ${mode}`);
  }
}

/**
 * Wait for server to be ready with health check
 */
export async function waitForServerReady(
  baseUrl: string,
  timeout: number = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(baseUrl + "/models", {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        debug(1, "[server-launcher] Backend server is ready");
        return true;
      }
    } catch (error) {
      // Server not ready yet, keep waiting
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.warn("[anyclaude] Backend server did not respond within timeout");
  return false;
}
