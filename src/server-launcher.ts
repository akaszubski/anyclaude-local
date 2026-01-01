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
 * Returns the PID if found, or null if not running
 */
export function getProcessOnPort(port: number): number | null {
  try {
    const result = spawnSync("lsof", ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    });

    if (result.stdout && result.stdout.trim()) {
      const pid = parseInt(result.stdout.trim().split("\n")[0], 10);
      if (!isNaN(pid)) {
        return pid;
      }
    }
    return null;
  } catch (error) {
    debug(1, "[server-launcher] Could not check port:", error);
    return null;
  }
}

/**
 * Check if a server is already running on a given port
 */
export function isServerRunning(port: number): boolean {
  return getProcessOnPort(port) !== null;
}

/**
 * Kill process on a given port (cleanup stale servers)
 */
export function killProcessOnPort(port: number): boolean {
  const pid = getProcessOnPort(port);
  if (pid === null) {
    return false;
  }

  try {
    console.log(
      `[anyclaude] Found stale process (PID ${pid}) on port ${port}, cleaning up...`
    );

    // Try graceful termination first
    process.kill(pid, "SIGTERM");

    // Wait a bit and check if it's still running
    const maxWait = 3000; // 3 seconds
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (getProcessOnPort(port) === null) {
        console.log(`[anyclaude] ✓ Cleaned up stale process on port ${port}`);
        return true;
      }
      // Sleep 100ms
      spawnSync("sleep", ["0.1"]);
    }

    // Force kill if still running
    console.log(`[anyclaude] Process didn't exit gracefully, force killing...`);
    process.kill(pid, "SIGKILL");

    // Wait a bit more
    const forceKillWait = 1000;
    const forceStartTime = Date.now();
    while (Date.now() - forceStartTime < forceKillWait) {
      if (getProcessOnPort(port) === null) {
        console.log(`[anyclaude] ✓ Force killed process on port ${port}`);
        return true;
      }
      spawnSync("sleep", ["0.1"]);
    }

    console.error(`[anyclaude] ✗ Could not kill process on port ${port}`);
    return false;
  } catch (error) {
    debug(1, `[server-launcher] Error killing process on port ${port}:`, error);
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
 * Start MLX server using mistral.rs (production-ready MLX backend)
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

  console.log(`[anyclaude] Starting mistral.rs MLX server...`);
  console.log(`[anyclaude] Model: ${path.basename(modelPath)}`);
  console.log(`[anyclaude] Port: ${port}`);
  console.log(`[anyclaude] Waiting ~30 seconds for model to load...`);

  // Create log directory if it doesn't exist
  const logDir = path.join(os.homedir(), ".anyclaude", "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Log file for server output
  const logFile = path.join(logDir, "mistralrs-server.log");
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  logStream.write(
    `\n=== mistral.rs Server Started at ${new Date().toISOString()} ===\n`
  );

  // Find mistralrs-server binary
  const mistralrsBin = path.join(
    os.homedir(),
    "Documents",
    "GitHub",
    "mistral.rs",
    "target",
    "release",
    "mistralrs-server"
  );

  if (!fs.existsSync(mistralrsBin)) {
    console.error(`[anyclaude] mistralrs-server not found at: ${mistralrsBin}`);
    console.error("[anyclaude] Please build mistral.rs:");
    console.error("[anyclaude]   cd ~/Documents/GitHub/mistral.rs");
    console.error("[anyclaude]   cargo build --release --features metal");
    process.exit(1);
  }

  // Detect architecture (qwen3moe, llama, etc.) from model path
  const modelName = path.basename(modelPath).toLowerCase();
  let architecture = "qwen3moe"; // default for Qwen3 MoE models

  if (modelName.includes("llama")) {
    architecture = "llama";
  } else if (modelName.includes("mistral")) {
    architecture = "mistral";
  }

  // Build command for mistral.rs
  // Use 'plain' subcommand for pre-quantized models (no additional ISQ needed)
  const command = `"${mistralrsBin}" --port ${port} --token-source none plain --model-id "${modelPath}" --arch ${architecture} 2>&1`;

  const serverProcess = spawn("bash", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
    },
  });

  // Register process for cleanup on exit
  registerServerProcess(serverProcess);

  // Write server output to log file
  let hasStarted = false;
  const STARTUP_TIMEOUT_MS = 120000; // 2 minutes

  const handleServerOutput = (data: Buffer) => {
    const output = data.toString();
    logStream.write(output);

    // Check if server has started
    if (
      !hasStarted &&
      (output.includes("listening on") ||
        output.includes("OpenAI-compatible server") ||
        output.includes("Model loaded"))
    ) {
      hasStarted = true;
      debug(1, "[server-launcher] mistral.rs server started successfully");
      console.log(`[anyclaude] MLX server is ready`);
    }

    // Log errors to console
    if (
      output.includes("error") ||
      output.includes("Error") ||
      output.includes("failed") ||
      output.includes("Failed") ||
      output.includes("cannot find tensor")
    ) {
      console.error(`[anyclaude] MLX: ${output.trim()}`);
    }
  };

  serverProcess.stdout?.on("data", handleServerOutput);
  serverProcess.stderr?.on("data", handleServerOutput);

  // Startup timeout - kill server if it doesn't start in time
  const startupTimeout = setTimeout(() => {
    if (!hasStarted) {
      logStream.write(
        `TIMEOUT: Server failed to start within ${STARTUP_TIMEOUT_MS / 1000}s\n`
      );
      console.error(
        `[anyclaude] mistral.rs startup timeout (${STARTUP_TIMEOUT_MS / 1000}s)`
      );
      console.error(`[anyclaude] Check logs at: ${logFile}`);

      if (serverProcess.pid) {
        try {
          process.kill(-serverProcess.pid, "SIGTERM");
        } catch (e) {
          // Process may have already exited
        }
      }
      process.exit(1);
    }
  }, STARTUP_TIMEOUT_MS);

  serverProcess.on("error", (error) => {
    clearTimeout(startupTimeout);
    logStream.write(`ERROR: ${error.message}\n`);
    console.error(`[anyclaude] Failed to start mistral.rs: ${error.message}`);
    console.error(`[anyclaude] Check logs at: ${logFile}`);
    process.exit(1);
  });

  serverProcess.on("exit", (code, signal) => {
    clearTimeout(startupTimeout);
    const message =
      code !== null
        ? `exited with code ${code}`
        : `killed with signal ${signal}`;
    logStream.write(`Process ${message} at ${new Date().toISOString()}\n`);

    if (!hasStarted && code !== 0) {
      console.error(`[anyclaude] mistral.rs failed to start (${message})`);
      console.error(`[anyclaude] Check logs at: ${logFile}`);
      console.error(
        `[anyclaude] Common issues: model path wrong, architecture mismatch, missing weights`
      );
    }
  });

  // Keep the server running in the background
  serverProcess.unref();
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
    const pid = getProcessOnPort(port);
    console.log(
      `[anyclaude] Found existing process (PID ${pid}) on port ${port}`
    );

    // For MLX backend, kill stale processes automatically
    // For LMStudio, user might want to keep it running
    if (mode === "mlx") {
      console.log(`[anyclaude] Cleaning up stale MLX server...`);
      const killed = killProcessOnPort(port);
      if (!killed) {
        console.error(
          `[anyclaude] ✗ Could not cleanup process on port ${port}`
        );
        console.error(`[anyclaude] Please kill it manually: kill -9 ${pid}`);
        process.exit(1);
      }
      // Continue to launch new server
    } else if (mode === "lmstudio") {
      console.log(
        `[anyclaude] LMStudio server already running, will use existing instance`
      );
      return;
    } else {
      console.log(
        `[anyclaude] ${mode} server already running, will use existing instance`
      );
      return;
    }
  }

  // Launch appropriate server
  if (mode === "mlx") {
    startVLLMMLXServer({
      backend: mode,
      port,
      model: backendConfig.model,
      modelPath: backendConfig.modelPath,
      serverScript: backendConfig.serverScript,
      pythonVenv: backendConfig.pythonVenv || config.pythonVenv,
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
