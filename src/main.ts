// Proxy wrapper to run Claude Code with LMStudio, MLX Cluster, OpenRouter, or Anthropic API

// Load environment variables from .env file
import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { spawn } from "child_process";
import {
  createAnthropicProxy,
  type CreateAnthropicProxyOptions,
} from "./anthropic-proxy";
import type { AnyclaudeMode } from "./trace-logger";
import { getBackendLogPrefix } from "./utils/backend-display";
import {
  normalizeBackendMode,
  getMigratedBackendConfig,
  getMigratedEnvVar,
} from "./utils/backend-migration";
import { debug, isDebugEnabled, logSessionContext } from "./debug";
import { displaySetupStatus, shouldFailStartup } from "./setup-checker";
import { getTimeoutConfig, getTimeoutInfoString } from "./timeout-config";
import {
  startMLXWorkerServer,
  wasServerLaunchedByUs,
  cleanupServerProcess,
  startSearxNGContainer,
} from "./server-launcher";
import {
  initializeCluster,
  getClusterManager,
  resetClusterManager,
} from "./cluster/cluster-manager";
import type { MLXClusterConfig } from "./cluster/cluster-types";

/**
 * Configuration file structure for .anyclauderc.json
 */
interface AnyclaudeConfig {
  backend?: string;
  debug?: {
    level?: number;
    enableTraces?: boolean;
    enableStreamLogging?: boolean;
  };
  backends?: {
    local?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      modelPath?: string; // Path to MLX model directory for auto-start
      compatibility?: string;
      description?: string;
      autoStartServer?: boolean; // Auto-start MLX worker when using localhost (default: true)
      startupTimeout?: number; // Server startup timeout in ms (default: 120000)
      truncateSystemPrompt?: boolean; // Truncate Claude Code system prompt to reduce cache pressure
      systemPromptMaxTokens?: number; // Max tokens for system prompt (default: 2000)
      safeSystemFilter?: boolean; // Enable safe system filter for intelligent prompt optimization
      filterTier?: "minimal" | "moderate" | "aggressive" | "extreme" | "auto"; // Filter aggressiveness
      smartSystemPrompt?: boolean; // Use AI-powered dynamic prompt optimization (EXPERIMENTAL)
      smartPromptMode?: "simple" | "intelligent"; // simple=keyword, intelligent=use LLM (default: simple)
      injectToolInstructions?: boolean; // Enable tool instruction injection for better tool calling
      toolInstructionStyle?: "explicit" | "subtle"; // Instruction style
      injectionThreshold?: number; // Confidence threshold (0-1)
      maxInjectionsPerConversation?: number; // Max injections per conversation
      stubToolDescriptions?: boolean; // Replace tool descriptions with stubs, expand as skills on demand
      localSearch?: boolean; // Auto-start SearXNG Docker container for local web search
    };
    lmstudio?: {
      // Deprecated: use 'local' instead
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      modelPath?: string; // Path to MLX model directory for auto-start
      compatibility?: string;
      description?: string;
      autoStartServer?: boolean; // Auto-start MLX worker when using localhost (default: true)
      startupTimeout?: number; // Server startup timeout in ms (default: 120000)
      truncateSystemPrompt?: boolean; // Truncate Claude Code system prompt to reduce cache pressure
      systemPromptMaxTokens?: number; // Max tokens for system prompt (default: 2000)
      safeSystemFilter?: boolean; // Enable safe system filter for intelligent prompt optimization
      filterTier?: "minimal" | "moderate" | "aggressive" | "extreme" | "auto"; // Filter aggressiveness
      smartSystemPrompt?: boolean; // Use AI-powered dynamic prompt optimization (EXPERIMENTAL)
      smartPromptMode?: "simple" | "intelligent"; // simple=keyword, intelligent=use LLM (default: simple)
      injectToolInstructions?: boolean; // Enable tool instruction injection for better tool calling
      toolInstructionStyle?: "explicit" | "subtle"; // Instruction style
      injectionThreshold?: number; // Confidence threshold (0-1)
      maxInjectionsPerConversation?: number; // Max injections per conversation
      stubToolDescriptions?: boolean; // Replace tool descriptions with stubs, expand as skills on demand
      localSearch?: boolean; // Auto-start SearXNG Docker container for local web search
    };
    claude?: {
      enabled?: boolean;
      description?: string;
    };
    openrouter?: {
      enabled?: boolean;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      description?: string;
    };
    "mlx-cluster"?: {
      enabled?: boolean;
      discovery?: {
        mode: "static" | "dynamic";
        nodes?: Array<{ url: string; nodeId: string }>;
        refreshIntervalMs?: number;
      };
      health?: {
        checkIntervalMs?: number;
        timeoutMs?: number;
        unhealthyThreshold?: number;
        healthyThreshold?: number;
      };
      routing?: {
        strategy:
          | "round-robin"
          | "least-loaded"
          | "cache-aware"
          | "latency-based";
        maxRetries?: number;
        retryDelayMs?: number;
      };
      cache?: {
        enabled?: boolean;
        maxCacheAgeSec?: number;
        checkIntervalMs?: number;
      };
    };
  };
}

/**
 * Load configuration from .anyclauderc.json if it exists
 */
function loadConfig(): AnyclaudeConfig {
  const configPath = path.join(process.cwd(), ".anyclauderc.json");

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(configContent);
      return config as AnyclaudeConfig;
    } catch (error) {
      console.error(`[anyclaude] Error reading config file: ${error}`);
      return {};
    }
  }

  return {};
}

/**
 * Parse CLI arguments for --mode flag
 * Supports both --mode=value and --mode value syntax
 */
function parseModeFromArgs(args: string[]): AnyclaudeMode | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --mode=value syntax
    if (arg.startsWith("--mode=")) {
      const rawMode = arg.substring(7).toLowerCase();
      // Normalize mode (converts 'lmstudio' to 'local' with deprecation warning)
      const mode = normalizeBackendMode(rawMode);
      if (
        mode === "claude" ||
        mode === "local" ||
        mode === "openrouter" ||
        mode === "mlx-cluster"
      ) {
        return mode as AnyclaudeMode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${rawMode}. Must be 'claude', 'local', 'openrouter', or 'mlx-cluster'.`
      );
      process.exit(1);
    }

    // Handle --mode value syntax (space-separated)
    if (arg === "--mode" && i + 1 < args.length) {
      const rawMode = args[i + 1].toLowerCase();
      // Normalize mode (converts 'lmstudio' to 'local' with deprecation warning)
      const mode = normalizeBackendMode(rawMode);
      if (
        mode === "claude" ||
        mode === "local" ||
        mode === "openrouter" ||
        mode === "mlx-cluster"
      ) {
        return mode as AnyclaudeMode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${rawMode}. Must be 'claude', 'local', 'openrouter', or 'mlx-cluster'.`
      );
      process.exit(1);
    }
  }
  return null;
}

/**
 * Check if --test-model flag is present
 */
function shouldRunModelTest(args: string[]): boolean {
  return args.includes("--test-model");
}

/**
 * Run model compatibility test
 */
async function runModelTest() {
  const { spawn } = await import("child_process");

  console.log("[anyclaude] Running model compatibility test...");
  console.log("");

  const testProcess = spawn("./test-model-compatibility.sh", [], {
    stdio: "inherit",
    shell: false, // Security: avoid shell interpretation
  });

  testProcess.on("close", (code) => {
    process.exit(code || 0);
  });
}

// Valid backend modes
const VALID_BACKENDS = [
  "claude",
  "local",
  "openrouter",
  "mlx-cluster",
] as const;
const DEPRECATED_BACKENDS: Record<string, string> = {
  lmstudio: "local",
  "mlx-textgen": "local",
  mlx: "local",
  "mlx-lm": "local",
};

/**
 * Validate that a backend name is recognized
 * Throws a clear error if the backend is unknown
 */
function validateBackendName(
  backend: string,
  source: "ANYCLAUDE_MODE" | "config.backend" | "CLI --mode"
): void {
  const normalized = backend.toLowerCase();

  // Check if it's a valid backend
  if (VALID_BACKENDS.includes(normalized as any)) {
    return;
  }

  // Check if it's a deprecated backend (these are handled by normalizeBackendMode)
  if (normalized in DEPRECATED_BACKENDS) {
    return;
  }

  // Unknown backend - throw helpful error
  const validList = VALID_BACKENDS.join(", ");
  const deprecatedList = Object.keys(DEPRECATED_BACKENDS).join(", ");
  console.error(`\n❌ Error: Unknown backend "${backend}" in ${source}`);
  console.error(`\n   Valid backends: ${validList}`);
  console.error(`   Deprecated (still work): ${deprecatedList}`);
  console.error(`\n   Example: Set backend to "local" for MLX/LMStudio models`);
  console.error(`            Set backend to "openrouter" for cloud models`);
  console.error(`            Set backend to "claude" for Anthropic API\n`);
  process.exit(1);
}

/**
 * Detect anyclaude mode from config file, CLI args, or environment variable
 * Priority: CLI args > ANYCLAUDE_MODE env var > config file > default (local)
 */
function detectMode(config: AnyclaudeConfig): AnyclaudeMode {
  // Check CLI arguments first
  const cliMode = parseModeFromArgs(process.argv);
  if (cliMode) {
    return cliMode;
  }

  // Check environment variable (normalize handles lmstudio -> local with warning)
  const envMode = process.env.ANYCLAUDE_MODE?.toLowerCase();
  if (envMode) {
    // Validate before normalizing - catch unknown backends early
    validateBackendName(envMode, "ANYCLAUDE_MODE");
    const normalizedEnvMode = normalizeBackendMode(envMode);
    if (
      normalizedEnvMode === "claude" ||
      normalizedEnvMode === "local" ||
      normalizedEnvMode === "openrouter" ||
      normalizedEnvMode === "mlx-cluster"
    ) {
      return normalizedEnvMode as AnyclaudeMode;
    }
  }

  // Check config file (normalize handles lmstudio -> local with warning)
  if (config.backend) {
    // Validate before normalizing - catch unknown backends early
    validateBackendName(config.backend, "config.backend");
    const normalizedBackend = normalizeBackendMode(
      config.backend.toLowerCase()
    );
    if (
      normalizedBackend === "claude" ||
      normalizedBackend === "local" ||
      normalizedBackend === "openrouter" ||
      normalizedBackend === "mlx-cluster"
    ) {
      return normalizedBackend as AnyclaudeMode;
    }
  }

  // Default to local
  return "local";
}

// Check for --test-model flag before anything else
if (shouldRunModelTest(process.argv)) {
  runModelTest();
  // runModelTest() exits the process, so this line is never reached
}

// Load configuration
const config = loadConfig();

// Detect mode before configuring providers
const mode: AnyclaudeMode = detectMode(config);

// Enable trace logging by default for claude and openrouter modes (unless explicitly disabled)
// This allows users to analyze Claude Code's prompts and tool usage patterns
if (
  (mode === "claude" || mode === "openrouter") &&
  !process.env.ANYCLAUDE_DEBUG
) {
  process.env.ANYCLAUDE_DEBUG = "3";
  console.log(
    `[anyclaude] Trace logging enabled for ${mode} mode (prompts will be saved to ~/.anyclaude/traces/${mode}/)`
  );
  console.log(
    `[anyclaude] To disable: ANYCLAUDE_DEBUG=0 anyclaude --mode=${mode}`
  );
  console.log("");
}

// Check dependencies early and fail with helpful message if needed
if (!process.env.ANYCLAUDE_SKIP_SETUP_CHECK) {
  if (shouldFailStartup(mode)) {
    process.exit(1);
  }
}

// Show setup status if --check-setup flag is provided
if (process.argv.includes("--check-setup")) {
  displaySetupStatus();
  process.exit(0);
}

/**
 * Get configuration for a specific backend with priority:
 * Environment variables > config file > defaults
 *
 * Supports both 'local' (new) and 'lmstudio' (deprecated) naming with migration.
 */
function getBackendConfig(
  backend: AnyclaudeMode,
  configBackends?: AnyclaudeConfig["backends"]
) {
  if (backend === "local" || backend === "lmstudio") {
    // Use migration helpers to support both old and new naming
    const localConfig = getMigratedBackendConfig(
      configBackends,
      "local",
      "lmstudio"
    );
    const defaultConfig = {
      baseURL: "http://localhost:8082/v1",
      apiKey: "lm-studio",
      model: "current-model",
    };
    return {
      baseURL:
        getMigratedEnvVar("LOCAL_URL", "LMSTUDIO_URL") ||
        localConfig?.baseUrl ||
        defaultConfig.baseURL,
      apiKey:
        getMigratedEnvVar("LOCAL_API_KEY", "LMSTUDIO_API_KEY") ||
        localConfig?.apiKey ||
        defaultConfig.apiKey,
      model:
        getMigratedEnvVar("LOCAL_MODEL", "LMSTUDIO_MODEL") ||
        localConfig?.model ||
        defaultConfig.model,
    };
  } else if (backend === "openrouter") {
    const defaultConfig = {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || "",
      model: "z-ai/glm-4.6", // Default to GLM-4.6
    };
    return {
      baseURL:
        process.env.OPENROUTER_BASE_URL ||
        configBackends?.openrouter?.baseUrl ||
        defaultConfig.baseURL,
      apiKey:
        process.env.OPENROUTER_API_KEY ||
        configBackends?.openrouter?.apiKey ||
        defaultConfig.apiKey,
      model:
        process.env.OPENROUTER_MODEL ||
        configBackends?.openrouter?.model ||
        defaultConfig.model,
    };
  }
  return null;
}

// Configure providers based on mode
const localConfig = getBackendConfig("local", config.backends);
const openrouterConfig = getBackendConfig("openrouter", config.backends);

const providers: CreateAnthropicProxyOptions["providers"] = {
  local: createOpenAI({
    baseURL: localConfig?.baseURL || "http://localhost:8082/v1",
    apiKey: localConfig?.apiKey || "lm-studio",
    // @ts-ignore - compatibility is valid but not in TypeScript types
    compatibility: "legacy", // LMStudio requires Chat Completions format
    fetch: (async (url, init) => {
      if (init?.body && typeof init.body === "string") {
        const body = JSON.parse(init.body);

        // Map max_tokens for compatibility
        const maxTokens = body.max_tokens;
        delete body.max_tokens;
        if (typeof maxTokens !== "undefined") {
          body.max_completion_tokens = maxTokens;
        }

        // Remove parameters that LMStudio doesn't support
        delete body.reasoning;
        delete body.service_tier;

        // Disable parallel tool calls for better compatibility
        body.parallel_tool_calls = false;

        // ENABLE PROMPT CACHING: llama.cpp's cache_prompt parameter
        // This tells LMStudio to cache the prompt prefix (system + history)
        // and reuse it across requests, avoiding full recomputation
        body.cache_prompt = true;

        init.body = JSON.stringify(body);
      }

      const response = await globalThis.fetch(url, init);

      // Log raw LMStudio SSE stream when debugging tool calls
      if (isDebugEnabled() && response.body && response.ok) {
        const originalBody = response.body;
        const [stream1, stream2] = originalBody.tee(); // Clone stream for both logging and AI SDK

        // Log stream asynchronously
        (async () => {
          const reader = stream1.getReader();
          const decoder = new TextDecoder();
          let chunkCount = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = decoder.decode(value, { stream: true });
              const lines = text.split("\n");

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.substring(6));

                    // Log tool call related chunks from backend
                    if (data.choices?.[0]?.delta?.tool_calls) {
                      debug(
                        1,
                        `${getBackendLogPrefix(mode)} → Raw SSE] Chunk ${chunkCount++}:`,
                        data.choices[0].delta.tool_calls
                      );
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
          } catch (err) {
            debug(
              1,
              `${getBackendLogPrefix(mode)} SSE Debug] Stream read error:`,
              err
            );
          }
        })();

        // Return response with the second stream for AI SDK
        return new Response(stream2, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      return response;
    }) as typeof fetch,
  }),
  openrouter: createOpenAI({
    baseURL: openrouterConfig?.baseURL || "https://openrouter.ai/api/v1",
    apiKey: openrouterConfig?.apiKey || process.env.OPENROUTER_API_KEY || "",
    fetch: (async (url, init) => {
      if (init?.body && typeof init.body === "string") {
        const body = JSON.parse(init.body);

        // Map max_tokens for OpenRouter compatibility
        const maxTokens = body.max_tokens;
        delete body.max_tokens;
        if (typeof maxTokens !== "undefined") {
          body.max_completion_tokens = maxTokens;
        }

        // Remove parameters that some OpenRouter models don't support
        delete body.reasoning;
        delete body.service_tier;

        init.body = JSON.stringify(body);
      }

      return await globalThis.fetch(url, init);
    }) as typeof fetch,
  }),
  claude: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  }) as any,
};

// Wrap initialization in async IIFE
// Skip execution in test environment to allow function exports to be tested
if (process.env.NODE_ENV !== "test") {
  (async () => {
    // Setup signal handlers for graceful shutdown
    const handleShutdown = async () => {
      debug(1, "[anyclaude] Received shutdown signal, cleaning up...");

      // Shutdown cluster manager if initialized
      try {
        const clusterMgr = getClusterManager();
        if (clusterMgr) {
          debug(1, "[anyclaude] Shutting down cluster manager...");
          await clusterMgr.shutdown();
        }
      } catch (error) {
        // Cluster manager may not be initialized
        debug(2, "[anyclaude] Cluster manager shutdown skipped:", error);
      }

      // Cleanup MLX Worker server if we started it
      if (wasServerLaunchedByUs()) {
        debug(1, "[anyclaude] Stopping MLX Worker server...");
        cleanupServerProcess();
      }

      // Import cache monitor to display stats on exit
      try {
        const { getCacheMonitor } = await import("./cache-monitor-dashboard");
        const monitor = getCacheMonitor();
        const stats = monitor.getMetrics();
        if (stats.totalRequests > 0) {
          monitor.displayReport();
          monitor.save();
        }
      } catch (error) {
        // Cache monitor may not be available
      }

      process.exit(0);
    };

    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);

    // Also cleanup on uncaught exceptions and process exit
    process.on("uncaughtException", (error) => {
      debug(1, "[anyclaude] Uncaught exception, cleaning up...", error);
      if (wasServerLaunchedByUs()) {
        cleanupServerProcess();
      }
      process.exit(1);
    });

    process.on("exit", () => {
      // Synchronous cleanup on exit
      if (wasServerLaunchedByUs()) {
        debug(1, "[anyclaude] Process exiting, cleaning up server...");
        cleanupServerProcess();
      }
    });

    // Initialize cluster manager if mlx-cluster mode is selected
    if (mode === "mlx-cluster") {
      const clusterConfig = config.backends?.["mlx-cluster"];

      if (!clusterConfig) {
        console.error(
          "[anyclaude] ERROR: mlx-cluster mode selected but no cluster configuration found in .anyclauderc.json"
        );
        console.error(
          "[anyclaude] Please add 'mlx-cluster' configuration to backends section"
        );
        process.exit(1);
      }

      // Validate required fields
      if (
        !clusterConfig.discovery ||
        !clusterConfig.health ||
        !clusterConfig.routing ||
        !clusterConfig.cache
      ) {
        console.error("[anyclaude] ERROR: Incomplete cluster configuration");
        console.error(
          "[anyclaude] Required fields: discovery, health, routing, cache"
        );
        process.exit(1);
      }

      try {
        debug(1, "[anyclaude] Initializing MLX cluster...");
        await initializeCluster(clusterConfig as MLXClusterConfig);

        const clusterMgr = getClusterManager();
        if (clusterMgr) {
          const status = clusterMgr.getStatus();
          debug(
            1,
            `[anyclaude] Cluster initialized: ${status.totalNodes} nodes, ${status.healthyNodes} healthy`
          );
        }
      } catch (error) {
        console.error(
          "[anyclaude] ERROR: Failed to initialize cluster:",
          error
        );
        if (error instanceof Error) {
          console.error("[anyclaude] Details:", error.message);
        }
        process.exit(1);
      }
    }

    // Auto-start MLX worker for local mode when using localhost
    if (mode === "local") {
      // Get local backend config with migration support (local or deprecated lmstudio)
      const localBackendConfig = getMigratedBackendConfig(
        config.backends,
        "local",
        "lmstudio"
      );
      const backendUrl = localConfig?.baseURL || "http://localhost:8082/v1";
      const isLocalhost =
        backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1");
      const autoStart = localBackendConfig?.autoStartServer ?? true;

      if (isLocalhost && autoStart) {
        // Extract port from URL
        const urlMatch = backendUrl.match(/:(\d+)/);
        const port = urlMatch ? parseInt(urlMatch[1], 10) : 8081;
        const modelPath =
          localBackendConfig?.modelPath || process.env.MLX_MODEL_PATH;
        const startupTimeout = localBackendConfig?.startupTimeout || 120000;

        if (modelPath) {
          debug(1, `[anyclaude] Auto-starting MLX Worker on port ${port}...`);
          const started = await startMLXWorkerServer({
            port,
            modelPath,
            startupTimeout,
          });

          if (!started) {
            console.error("[anyclaude] Failed to start MLX Worker server");
            console.error("[anyclaude] Please start it manually:");
            console.error(
              `[anyclaude]   uvicorn src.mlx_worker.server:app --port ${port}`
            );
            process.exit(1);
          }
        } else {
          debug(
            1,
            "[anyclaude] No modelPath configured, expecting server to be running"
          );
        }
      }
    }

    // Auto-start SearXNG container if local search is enabled
    // Check SEARXNG_URL env var or localSearch config option
    const localSearchEnabled =
      process.env.SEARXNG_URL ||
      config.backends?.local?.localSearch ||
      config.backends?.lmstudio?.localSearch;

    if (localSearchEnabled) {
      debug(
        1,
        "[anyclaude] Local search enabled, checking SearXNG container..."
      );
      const searxngStarted = await startSearxNGContainer();
      if (searxngStarted) {
        // Set SEARXNG_URL if not already set so search executor uses it
        if (!process.env.SEARXNG_URL) {
          process.env.SEARXNG_URL = "http://localhost:8080";
          console.log(
            `[anyclaude] ✓ Local search enabled (${process.env.SEARXNG_URL})`
          );
        }
      } else {
        debug(
          1,
          "[anyclaude] SearXNG container not started, will use fallback search"
        );
      }
    }

    const proxyURL = createAnthropicProxy({
      providers,
      defaultProvider: mode,
      defaultModel:
        mode === "claude"
          ? "claude-3-5-sonnet-20241022"
          : mode === "openrouter"
            ? openrouterConfig?.model || "z-ai/glm-4.6"
            : localConfig?.model || "current-model",
      mode,
      backendUrl:
        mode === "local"
          ? localConfig?.baseURL
          : mode === "openrouter"
            ? openrouterConfig?.baseURL
            : undefined,
      // Truncate for local backend as fallback when safe filter validation fails
      // Default: true (acts as safety net for local models with limited context)
      truncateSystemPrompt:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.truncateSystemPrompt ?? true)
          : false,
      systemPromptMaxTokens:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.systemPromptMaxTokens ?? 2000)
          : 0,
      smartSystemPrompt:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.smartSystemPrompt ?? false)
          : false,
      smartPromptMode:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.smartPromptMode ?? "simple")
          : "simple",
      // Safe system filter (Issue #21)
      safeSystemFilter:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.safeSystemFilter ?? true)
          : false,
      filterTier:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.filterTier ?? "aggressive")
          : undefined,
      // Tool instruction injection (Issue #35)
      injectToolInstructions:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.injectToolInstructions ?? false)
          : false,
      toolInstructionStyle:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.toolInstructionStyle ?? "explicit")
          : "explicit",
      injectionThreshold:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.injectionThreshold ?? 0.7)
          : 0.7,
      maxInjectionsPerConversation:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.maxInjectionsPerConversation ?? 10)
          : 10,
      // Adaptive tool context (skill-based tool descriptions)
      stubToolDescriptions:
        mode === "local"
          ? (getMigratedBackendConfig(config.backends, "local", "lmstudio")
              ?.stubToolDescriptions ?? false)
          : false,
    });

    console.log(`[anyclaude] Backend: ${mode.toUpperCase()}`);
    console.log(`[anyclaude] Proxy URL: ${proxyURL}`);
    if (fs.existsSync(path.join(process.cwd(), ".anyclauderc.json"))) {
      console.log(`[anyclaude] Config: .anyclauderc.json`);
    }

    // Validate and display timeout configuration
    const timeoutConfig = getTimeoutConfig();
    console.log(`[anyclaude] ${getTimeoutInfoString(timeoutConfig)}`);
    if (timeoutConfig.warnings.length > 0) {
      timeoutConfig.warnings.forEach((warning) => {
        console.warn(`[anyclaude] ${warning}`);
      });
    }
    console.log("");

    if (mode === "local") {
      const endpoint = localConfig?.baseURL || "http://localhost:1234/v1";
      console.log(
        `[anyclaude] ${getBackendLogPrefix(mode)} endpoint: ${endpoint}`
      );
      console.log(
        `[anyclaude] Model: ${localConfig?.model || "current-model"} (whatever is loaded in ${getBackendLogPrefix(mode)})`
      );
      console.log(
        `[anyclaude] Make sure ${getBackendLogPrefix(mode)} is running with a model loaded`
      );
    } else if (mode === "openrouter") {
      const modelName = openrouterConfig?.model || "z-ai/glm-4.6";
      console.log(`[anyclaude] Using OpenRouter API`);
      console.log(`[anyclaude] Model: ${modelName}`);
      console.log(
        `[anyclaude] Base URL: ${openrouterConfig?.baseURL || "https://openrouter.ai/api/v1"}`
      );
      console.log(`[anyclaude] Features: tool calling + streaming`);
      if (process.env.ANYCLAUDE_DEBUG) {
        const traceDir =
          require("os").homedir() + "/.anyclaude/traces/openrouter";
        console.log(`[anyclaude] Trace directory: ${traceDir}`);
      }
    } else if (mode === "claude") {
      console.log(`[anyclaude] Using real Anthropic API (Claude 3.5 Sonnet)`);
      if (process.env.ANYCLAUDE_DEBUG) {
        const traceDir = require("os").homedir() + "/.anyclaude/traces/claude";
        console.log(`[anyclaude] Trace directory: ${traceDir}`);
      }
    } else if (mode === "mlx-cluster") {
      const clusterMgr = getClusterManager();
      if (clusterMgr) {
        const status = clusterMgr.getStatus();
        console.log(`[anyclaude] Using MLX Cluster`);
        console.log(
          `[anyclaude] Nodes: ${status.totalNodes} total, ${status.healthyNodes} healthy`
        );
        console.log(
          `[anyclaude] Strategy: ${config.backends?.["mlx-cluster"]?.routing?.strategy || "cache-aware"}`
        );

        if (status.nodes && status.nodes.length > 0) {
          console.log(`[anyclaude] Cluster status:`);
          status.nodes.forEach((node) => {
            const healthIndicator = node.healthy ? "✓" : "✗";
            const latency = node.latencyMs ? ` (${node.latencyMs}ms)` : "";
            console.log(
              `[anyclaude]   ${healthIndicator} ${node.id}: ${node.url}${latency}`
            );
          });
        }

        if (process.env.ANYCLAUDE_DEBUG) {
          const traceDir =
            require("os").homedir() + "/.anyclaude/traces/mlx-cluster";
          console.log(`[anyclaude] Trace directory: ${traceDir}`);
        }
      }
    }
    console.log("");

    // Log session context to debug file
    if (isDebugEnabled()) {
      logSessionContext({
        mode,
        model:
          mode === "local"
            ? localConfig?.model || "current-model"
            : mode === "openrouter"
              ? openrouterConfig?.model || "z-ai/glm-4.6"
              : "claude-3-5-sonnet-20241022",
        backendUrl:
          mode === "local"
            ? localConfig?.baseURL
            : mode === "openrouter"
              ? openrouterConfig?.baseURL
              : undefined,
        proxyUrl: proxyURL,
        config: {
          backend: mode,
          debugLevel: process.env.ANYCLAUDE_DEBUG,
          configFile: fs.existsSync(
            path.join(process.cwd(), ".anyclauderc.json")
          )
            ? ".anyclauderc.json"
            : "none",
        },
      });
    }

    if (process.env.PROXY_ONLY === "true") {
      console.log("Proxy only mode - not spawning Claude Code");
    } else {
      // Filter out --mode flag from arguments passed to Claude Code
      const claudeArgs = process.argv
        .slice(2)
        .filter((arg) => !arg.startsWith("--mode="));

      const proc = spawn("claude", claudeArgs, {
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: proxyURL,
        },
        // Fix for piped stdin (e.g., when using `2>&1 | tee`):
        // Only inherit stdin if it's a TTY, otherwise ignore it
        stdio: [
          process.stdin.isTTY ? "inherit" : "ignore", // stdin
          "inherit", // stdout
          "inherit", // stderr
        ],
      });

      proc.on("exit", (code) => {
        process.exit(code ?? 0);
      });
    }
  })();
}

// Export functions for testing
export { parseModeFromArgs, detectMode };
