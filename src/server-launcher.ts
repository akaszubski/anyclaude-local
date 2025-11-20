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
  modelPath?: string;
  baseUrl?: string;
  pythonVenv?: string;
  serverScript?: string;
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
        debug(
          1,
          `[server-launcher] Killing process group for PID ${spawnedServerProcess.pid}`
        );
        process.kill(-spawnedServerProcess.pid, "SIGTERM");

        // Give it a moment to exit gracefully
        // Then send SIGKILL if still running
        setTimeout(() => {
          try {
            if (spawnedServerProcess && spawnedServerProcess.pid) {
              process.kill(-spawnedServerProcess.pid, "SIGKILL");
              debug(
                1,
                `[server-launcher] Sent SIGKILL to process group ${spawnedServerProcess.pid}`
              );
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
 * Start LMStudio server (assumes it's already running or started manually)
 */
export function startLMStudioServer(config: ServerLauncherConfig): void {
  const port = config.port || 1234;
  const baseUrl = config.baseUrl || `http://localhost:${port}/v1`;

  console.log(`[anyclaude] LMStudio configured at ${baseUrl}`);
  console.log(`[anyclaude] Make sure LMStudio is running with a model loaded`);
  console.log(
    `[anyclaude] You can start it manually or configure auto-start in settings`
  );
}

/**
 * Start MLX server (official mlx_lm.server)
 */
export function startVLLMMLXServer(config: ServerLauncherConfig): void {
  const port = config.port || 8081;
  const modelPath = config.modelPath || config.model;

  // Return early if no model path - user must provide model path for auto-launch
  if (!modelPath || modelPath === "current-model") {
    console.log(
      `[anyclaude] MLX: No model path configured in .anyclauderc.json`
    );
    console.log(
      `[anyclaude] MLX: Expecting server to be running at http://localhost:${port}/v1`
    );
    debug(
      1,
      "[server-launcher] MLX auto-launch skipped (no model path in config)"
    );
    return;
  }

  // Check if model path exists
  if (!fs.existsSync(modelPath)) {
    console.error(`[anyclaude] Model path not found: ${modelPath}`);
    console.error(
      "[anyclaude] Make sure the model path in .anyclauderc.json is correct"
    );
    process.exit(1);
  }

  console.log(`[anyclaude] Starting official MLX-LM server...`);
  console.log(`[anyclaude] Model: ${path.basename(modelPath)}`);
  console.log(`[anyclaude] Port: ${port}`);
  console.log(`[anyclaude] Waiting ~30 seconds for model to load...`);

  // Create log directory if it doesn't exist
  const logDir = path.join(os.homedir(), ".anyclaude", "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Log file for server output (helps with debugging)
  const logFile = path.join(logDir, "mlx-lm-server.log");
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  logStream.write(
    `\n=== Official MLX-LM Server Started at ${new Date().toISOString()} ===\n`
  );

  // Find mlx_lm.server in PATH (installed via pipx)
  const mlxServerPath = path.join(os.homedir(), ".local", "bin", "mlx_lm.server");

  if (!fs.existsSync(mlxServerPath)) {
    console.error(`[anyclaude] mlx_lm.server not found at: ${mlxServerPath}`);
    console.error("[anyclaude] Please install mlx-lm:");
    console.error("[anyclaude]   pipx install mlx-lm");
    process.exit(1);
  }

  // Build command for official mlx_lm.server
  const command = `${mlxServerPath} --model "${modelPath}" --port ${port} --host 127.0.0.1 --log-level INFO 2>&1`;

  const serverProcess = spawn("bash", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Create a new process group so we can kill all children
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PATH: `${path.join(os.homedir(), ".local", "bin")}:${process.env.PATH}`,
    },
  });

  // Register process for cleanup on exit
  registerServerProcess(serverProcess);

  // Write server output to log file and console (for errors)
  let hasStarted = false;

  const handleServerOutput = (data: Buffer) => {
    const output = data.toString();

    // Write to log file
    logStream.write(output);

    // Check if server has started (official mlx_lm.server messages)
    if (
      !hasStarted &&
      (output.includes("Uvicorn running") ||
        output.includes("Application startup complete") ||
        output.includes("Started server process"))
    ) {
      hasStarted = true;
      debug(1, "[server-launcher] Official MLX-LM server started successfully");
      console.log(`[anyclaude] MLX server is ready`);
    }

    // Also log errors to console
    if (
      output.includes("error") ||
      output.includes("Error") ||
      output.includes("failed") ||
      output.includes("Failed")
    ) {
      console.error(`[anyclaude] MLX: ${output.trim()}`);
    }
  };

  serverProcess.stdout?.on("data", handleServerOutput);
  serverProcess.stderr?.on("data", handleServerOutput);

  serverProcess.on("error", (error) => {
    logStream.write(`ERROR: ${error.message}\n`);
    console.error(`[anyclaude] Failed to start MLX server: ${error.message}`);
    console.error(`[anyclaude] Check logs at: ${logFile}`);
    process.exit(1);
  });

  serverProcess.on("exit", (code, signal) => {
    const message =
      code !== null
        ? `exited with code ${code}`
        : `killed with signal ${signal}`;
    logStream.write(`Process ${message} at ${new Date().toISOString()}\n`);

    if (!hasStarted && code !== 0) {
      console.error(`[anyclaude] MLX server failed to start (${message})`);
      console.error(`[anyclaude] Check logs at: ${logFile}`);
    }
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
    debug(
      1,
      "[server-launcher] Auto-launch disabled via ANYCLAUDE_NO_AUTO_LAUNCH"
    );
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

  const port = backendConfig.port || (mode === "mlx" ? 8081 : 1234);

  // Check if server is already running
  if (isServerRunning(port)) {
    console.log(`[anyclaude] ${mode} server already running on port ${port}`);
    return;
  }

  // Launch appropriate server
  if (mode === "mlx") {
    startVLLMMLXServer({
      backend: mode,
      port,
      model: backendConfig.model,
      modelPath: backendConfig.modelPath,
      serverScript: backendConfig.serverScript,
      pythonVenv: config.pythonVenv,
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
  timeout: number = 120000 // 2 minutes for MLX model loading
): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;

    // Check if spawned server process has crashed
    if (spawnedServerProcess && spawnedServerProcess.exitCode !== null) {
      const exitCode = spawnedServerProcess.exitCode;
      const signal = (spawnedServerProcess as any).signalCode;
      console.error(`[anyclaude] ✗ Backend server crashed during startup`);
      console.error(
        `[anyclaude] Exit code: ${exitCode}${signal ? ` (signal: ${signal})` : ""}`
      );
      console.error(
        `[anyclaude] Check logs at: ${path.join(os.homedir(), ".anyclaude", "logs", "mlx-textgen-server.log")}`
      );
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(baseUrl + "/models", {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        debug(
          1,
          `[server-launcher] Backend server is ready after ${attempts} attempts (${Date.now() - startTime}ms)`
        );
        return true;
      } else {
        debug(
          1,
          `[server-launcher] Server responded with status ${response.status}, attempt ${attempts}`
        );
      }
    } catch (error) {
      // Server not ready yet, keep waiting
      debug(
        1,
        `[server-launcher] Server not ready (attempt ${attempts}): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Wait before retrying (shorter wait to be more responsive)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.warn(
    `[anyclaude] Backend server did not respond within ${timeout}ms (${attempts} attempts)`
  );
  return false;
}
