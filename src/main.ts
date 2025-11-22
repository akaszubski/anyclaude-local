// Proxy wrapper to run Claude Code with LMStudio local models or real Anthropic API

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
import { debug, isDebugEnabled, logSessionContext } from "./debug";
import { displaySetupStatus, shouldFailStartup } from "./setup-checker";
import { getTimeoutConfig, getTimeoutInfoString } from "./timeout-config";

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
    lmstudio?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      compatibility?: string;
      description?: string;
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
 */
function parseModeFromArgs(args: string[]): AnyclaudeMode | null {
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.substring(7).toLowerCase();
      if (
        mode === "claude" ||
        mode === "lmstudio" ||
        mode === "openrouter"
      ) {
        return mode as AnyclaudeMode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${mode}. Must be 'claude', 'lmstudio', or 'openrouter'.`
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
    shell: true,
  });

  testProcess.on("close", (code) => {
    process.exit(code || 0);
  });
}

/**
 * Detect anyclaude mode from config file, CLI args, or environment variable
 * Priority: CLI args > ANYCLAUDE_MODE env var > config file > default (lmstudio)
 */
function detectMode(config: AnyclaudeConfig): AnyclaudeMode {
  // Check CLI arguments first
  const cliMode = parseModeFromArgs(process.argv);
  if (cliMode) {
    return cliMode;
  }

  // Check environment variable
  const envMode = process.env.ANYCLAUDE_MODE?.toLowerCase();
  if (
    envMode === "claude" ||
    envMode === "lmstudio" ||
    envMode === "openrouter"
  ) {
    return envMode as AnyclaudeMode;
  }

  // Check config file
  if (config.backend) {
    const backend = config.backend.toLowerCase();
    if (
      backend === "claude" ||
      backend === "lmstudio" ||
      backend === "openrouter"
    ) {
      return backend as AnyclaudeMode;
    }
  }

  // Default to lmstudio
  return "lmstudio";
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
 */
function getBackendConfig(
  backend: AnyclaudeMode,
  configBackends?: AnyclaudeConfig["backends"]
) {
  if (backend === "lmstudio") {
    const defaultConfig = {
      baseURL: "http://localhost:8082/v1",
      apiKey: "lm-studio",
      model: "current-model",
    };
    return {
      baseURL:
        process.env.LMSTUDIO_URL ||
        configBackends?.lmstudio?.baseUrl ||
        defaultConfig.baseURL,
      apiKey:
        process.env.LMSTUDIO_API_KEY ||
        configBackends?.lmstudio?.apiKey ||
        defaultConfig.apiKey,
      model:
        process.env.LMSTUDIO_MODEL ||
        configBackends?.lmstudio?.model ||
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
const lmstudioConfig = getBackendConfig("lmstudio", config.backends);
const openrouterConfig = getBackendConfig("openrouter", config.backends);

const providers: CreateAnthropicProxyOptions["providers"] = {
  lmstudio: createOpenAI({
    baseURL: lmstudioConfig?.baseURL || "http://localhost:8082/v1",
    apiKey: lmstudioConfig?.apiKey || "lm-studio",
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

                    // Log tool call related chunks from LMStudio
                    if (data.choices?.[0]?.delta?.tool_calls) {
                      debug(
                        1,
                        `[LMStudio → Raw SSE] Chunk ${chunkCount++}:`,
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
            debug(1, `[LMStudio SSE Debug] Stream read error:`, err);
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
(async () => {
  // Setup signal handlers for graceful shutdown
  const handleShutdown = async () => {
    debug(1, "[anyclaude] Received shutdown signal, cleaning up...");

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

  // LMStudio and OpenRouter don't need auto-launching - user manages them manually

  const proxyURL = createAnthropicProxy({
    providers,
    defaultProvider: mode,
    defaultModel:
      mode === "claude"
        ? "claude-3-5-sonnet-20241022"
        : mode === "openrouter"
          ? openrouterConfig?.model || "z-ai/glm-4.6"
          : lmstudioConfig?.model || "current-model",
    mode,
    backendUrl:
      mode === "lmstudio"
        ? lmstudioConfig?.baseURL
        : mode === "openrouter"
            ? openrouterConfig?.baseURL
            : undefined,
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

  if (mode === "lmstudio") {
    const endpoint = lmstudioConfig?.baseURL || "http://localhost:1234/v1";
    console.log(`[anyclaude] LMStudio endpoint: ${endpoint}`);
    console.log(
      `[anyclaude] Model: ${lmstudioConfig?.model || "current-model"} (whatever is loaded in LMStudio)`
    );
    console.log(`[anyclaude] Make sure LMStudio is running with a model loaded`);
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
  }
  console.log("");

  // Log session context to debug file
  if (isDebugEnabled()) {
    logSessionContext({
      mode,
      model:
        mode === "lmstudio"
            ? lmstudioConfig?.model || "current-model"
            : mode === "openrouter"
              ? openrouterConfig?.model || "z-ai/glm-4.6"
              : "claude-3-5-sonnet-20241022",
      backendUrl:
        mode === "lmstudio"
          ? lmstudioConfig?.baseURL
          : mode === "openrouter"
              ? openrouterConfig?.baseURL
              : undefined,
      proxyUrl: proxyURL,
      config: {
        backend: mode,
        debugLevel: process.env.ANYCLAUDE_DEBUG,
        configFile: fs.existsSync(path.join(process.cwd(), ".anyclauderc.json"))
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
