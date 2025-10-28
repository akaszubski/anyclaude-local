// Proxy wrapper to run Claude Code with LMStudio local models or real Anthropic API

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
import { debug, isDebugEnabled } from "./debug";
import {
  launchBackendServer,
  waitForServerReady,
  cleanupServerProcess,
} from "./server-launcher";
import {
  displaySetupStatus,
  shouldFailStartup,
} from "./setup-checker";

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
    "mlx-lm"?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      description?: string;
    };
    "vllm-mlx"?: {
      enabled?: boolean;
      port?: number;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      serverScript?: string;
      description?: string;
    };
    claude?: {
      enabled?: boolean;
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
      if (mode === "claude" || mode === "lmstudio" || mode === "mlx-lm" || mode === "vllm-mlx") {
        return mode as AnyclaudeMode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${mode}. Must be 'claude', 'lmstudio', 'mlx-lm', or 'vllm-mlx'.`
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
  if (envMode === "claude" || envMode === "lmstudio" || envMode === "mlx-lm" || envMode === "vllm-mlx") {
    return envMode as AnyclaudeMode;
  }

  // Check config file
  if (config.backend) {
    const backend = config.backend.toLowerCase();
    if (backend === "claude" || backend === "lmstudio" || backend === "mlx-lm" || backend === "vllm-mlx") {
      return backend as AnyclaudeMode;
    }
  }

  // Default to lmstudio for backwards compatibility
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
function getBackendConfig(backend: AnyclaudeMode, configBackends?: AnyclaudeConfig["backends"]) {
  if (backend === "lmstudio") {
    const defaultConfig = {
      baseURL: "http://localhost:1234/v1",
      apiKey: "lm-studio",
      model: "current-model",
    };
    return {
      baseURL: process.env.LMSTUDIO_URL || configBackends?.lmstudio?.baseUrl || defaultConfig.baseURL,
      apiKey: process.env.LMSTUDIO_API_KEY || configBackends?.lmstudio?.apiKey || defaultConfig.apiKey,
      model: process.env.LMSTUDIO_MODEL || configBackends?.lmstudio?.model || defaultConfig.model,
    };
  } else if (backend === "mlx-lm") {
    const defaultConfig = {
      baseURL: "http://localhost:8081/v1",
      apiKey: "mlx-lm",
      model: "current-model",
    };
    return {
      baseURL: process.env.MLX_LM_URL || configBackends?.["mlx-lm"]?.baseUrl || defaultConfig.baseURL,
      apiKey: process.env.MLX_LM_API_KEY || configBackends?.["mlx-lm"]?.apiKey || defaultConfig.apiKey,
      model: process.env.MLX_LM_MODEL || configBackends?.["mlx-lm"]?.model || defaultConfig.model,
    };
  } else if (backend === "vllm-mlx") {
    const defaultConfig = {
      baseURL: "http://localhost:8081/v1",
      apiKey: "vllm-mlx",
      model: "current-model",
    };
    return {
      baseURL: process.env.VLLM_MLX_URL || configBackends?.["vllm-mlx"]?.baseUrl || defaultConfig.baseURL,
      apiKey: process.env.VLLM_MLX_API_KEY || configBackends?.["vllm-mlx"]?.apiKey || defaultConfig.apiKey,
      model: process.env.VLLM_MLX_MODEL || configBackends?.["vllm-mlx"]?.model || defaultConfig.model,
    };
  }
  return null;
}

// Configure providers based on mode
const lmstudioConfig = getBackendConfig("lmstudio", config.backends);
const mlxLmConfig = getBackendConfig("mlx-lm", config.backends);
const vllmMlxConfig = getBackendConfig("vllm-mlx", config.backends);

// Launch backend server if needed (non-blocking)
launchBackendServer(mode, config);

const providers: CreateAnthropicProxyOptions["providers"] = {
  lmstudio: createOpenAI({
    baseURL: lmstudioConfig?.baseURL || "http://localhost:1234/v1",
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
  "mlx-lm": createOpenAI({
    baseURL: mlxLmConfig?.baseURL || "http://localhost:8081/v1",
    apiKey: mlxLmConfig?.apiKey || "mlx-lm",
    fetch: (async (url, init) => {
      if (init?.body && typeof init.body === "string") {
        const body = JSON.parse(init.body);

        // Remove model field for MLX-LM (always uses the loaded model)
        // MLX-LM server validates model names against HuggingFace, which fails for "current-model"
        delete body.model;

        // Map max_tokens for compatibility
        const maxTokens = body.max_tokens;
        delete body.max_tokens;
        if (typeof maxTokens !== "undefined") {
          body.max_completion_tokens = maxTokens;
        }

        // Remove parameters that MLX-LM doesn't support
        delete body.reasoning;
        delete body.service_tier;

        // Keep streaming enabled (don't set body.stream = false)
        // MLX-LM handles streaming responses properly

        // Clean system prompt: MLX-LM's server has strict JSON validation
        // Normalize newlines in system prompt to avoid JSON parsing errors
        // This handles both "system" role messages and message content
        if (body.messages && Array.isArray(body.messages)) {
          for (const msg of body.messages) {
            // Clean system role messages
            if (msg.role === "system" && msg.content && typeof msg.content === "string") {
              msg.content = msg.content.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
            }
            // Also clean user messages that might contain newlines
            if (msg.role === "user" && msg.content && typeof msg.content === "string") {
              // User messages can have newlines, but let's ensure proper formatting
              msg.content = msg.content.replace(/\r\n/g, "\n");
            }
          }
        }

        init.body = JSON.stringify(body);
      }

      const response = await globalThis.fetch(url, init);

      // Log MLX-LM responses when debugging
      if (isDebugEnabled() && response.body && response.ok) {
        debug(1, `[MLX-LM → Response] Status: ${response.status}, Content-Type: ${response.headers.get("content-type")}`);
      }

      return response;
    }) as typeof fetch,
  }),
  "vllm-mlx": createOpenAI({
    baseURL: vllmMlxConfig?.baseURL || "http://localhost:8081/v1",
    apiKey: vllmMlxConfig?.apiKey || "vllm-mlx",
    fetch: (async (url, init) => {
      if (init?.body && typeof init.body === "string") {
        const body = JSON.parse(init.body);

        // Map max_tokens for vLLM-MLX compatibility
        const maxTokens = body.max_tokens;
        delete body.max_tokens;
        if (typeof maxTokens !== "undefined") {
          body.max_completion_tokens = maxTokens;
        }

        // Remove parameters that vLLM-MLX doesn't support
        delete body.reasoning;
        delete body.service_tier;

        // Keep tool calling enabled for vLLM-MLX
        // vLLM-MLX supports tools parameter

        init.body = JSON.stringify(body);
      }

      const response = await globalThis.fetch(url, init);

      // Log vLLM-MLX responses when debugging
      if (isDebugEnabled() && response.body && response.ok) {
        debug(1, `[vLLM-MLX → Response] Status: ${response.status}, Content-Type: ${response.headers.get("content-type")}`);
      }

      return response;
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
    cleanupServerProcess();
    // Give processes time to exit
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  // Wait for backend server to be ready if launching locally
  if (mode !== "claude") {
    const backendConfig = config.backends?.[mode];
    if (backendConfig?.baseUrl) {
      console.log(`[anyclaude] Waiting for ${mode} server to be ready at ${backendConfig.baseUrl}...`);
      const isReady = await waitForServerReady(backendConfig.baseUrl);
      if (isReady) {
        console.log(`[anyclaude] ${mode} server is ready!`);
      } else {
        console.warn(
          `[anyclaude] Backend server did not start in time. Attempting to continue...`
        );
      }
    } else {
      console.log(`[anyclaude] No baseUrl configured for ${mode}, skipping wait`);
    }
  }

  const proxyURL = createAnthropicProxy({
    providers,
    defaultProvider: mode,
    defaultModel:
      mode === "claude"
        ? "claude-3-5-sonnet-20241022"
        : mode === "mlx-lm"
          ? mlxLmConfig?.model || "current-model"
          : mode === "vllm-mlx"
            ? vllmMlxConfig?.model || "current-model"
            : lmstudioConfig?.model || "current-model",
    mode,
  });

  console.log(`[anyclaude] Mode: ${mode.toUpperCase()}`);
  console.log(`[anyclaude] Proxy URL: ${proxyURL}`);
  if (fs.existsSync(path.join(process.cwd(), ".anyclauderc.json"))) {
    console.log(`[anyclaude] Config: .anyclauderc.json`);
  }

  if (mode === "lmstudio") {
    console.log(
      `[anyclaude] LMStudio endpoint: ${lmstudioConfig?.baseURL || "http://localhost:1234/v1"}`
    );
    console.log(
      `[anyclaude] Model: ${lmstudioConfig?.model || "current-model"} (uses whatever is loaded in LMStudio)`
    );
  } else if (mode === "mlx-lm") {
    console.log(
      `[anyclaude] MLX-LM endpoint: ${mlxLmConfig?.baseURL || "http://localhost:8081/v1"}`
    );
    console.log(
      `[anyclaude] Model: ${mlxLmConfig?.model || "current-model"} (with native KV cache)`
    );
  } else if (mode === "vllm-mlx") {
    console.log(
      `[anyclaude] vLLM-MLX endpoint: ${vllmMlxConfig?.baseURL || "http://localhost:8081/v1"}`
    );
    console.log(
      `[anyclaude] Model: ${vllmMlxConfig?.model || "current-model"} (with prompt caching + tool calling)`
    );
  } else if (mode === "claude") {
    console.log(`[anyclaude] Using real Anthropic API`);
    console.log(
      `[anyclaude] Model: claude-3-5-sonnet-20241022 (or as specified by Claude Code)`
    );
    if (process.env.ANYCLAUDE_DEBUG) {
      const traceDir = require("os").homedir() + "/.anyclaude/traces/claude";
      console.log(`[anyclaude] Trace directory: ${traceDir}`);
    }
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
      stdio: "inherit",
    });

    proc.on("exit", (code) => {
      cleanupServerProcess();
      process.exit(code ?? 0);
    });
  }
})();
