// Proxy wrapper to run Claude Code with LMStudio local models or real Anthropic API

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { spawn } from "child_process";
import {
  createAnthropicProxy,
  type CreateAnthropicProxyOptions,
} from "./anthropic-proxy";
import type { AnyclaudeMode } from "./trace-logger";
import { debug, isDebugEnabled } from "./debug";

/**
 * Parse CLI arguments for --mode flag
 */
function parseModeFromArgs(args: string[]): AnyclaudeMode | null {
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.substring(7).toLowerCase();
      if (mode === "claude" || mode === "lmstudio" || mode === "mlx-lm" || mode === "mlx-omni") {
        return mode as AnyclaudeMode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${mode}. Must be 'claude', 'lmstudio', 'mlx-lm', or 'mlx-omni'.`
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
 * Detect anyclaude mode from CLI args or environment variable
 * Priority: CLI args > ANYCLAUDE_MODE env var > default (lmstudio)
 */
function detectMode(): AnyclaudeMode {
  // Check CLI arguments first
  const cliMode = parseModeFromArgs(process.argv);
  if (cliMode) {
    return cliMode;
  }

  // Check environment variable
  const envMode = process.env.ANYCLAUDE_MODE?.toLowerCase();
  if (envMode === "claude" || envMode === "lmstudio" || envMode === "mlx-lm" || envMode === "mlx-omni") {
    return envMode as AnyclaudeMode;
  }

  // Default to lmstudio for backwards compatibility
  return "lmstudio";
}

// Check for --test-model flag before anything else
if (shouldRunModelTest(process.argv)) {
  runModelTest();
  // runModelTest() exits the process, so this line is never reached
}

// Detect mode before configuring providers
const mode: AnyclaudeMode = detectMode();

// Configure providers based on mode
const providers: CreateAnthropicProxyOptions["providers"] = {
  lmstudio: createOpenAI({
    baseURL: process.env.LMSTUDIO_URL || "http://localhost:1234/v1",
    apiKey: process.env.LMSTUDIO_API_KEY || "lm-studio",
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
    baseURL: process.env.MLX_LM_URL || "http://localhost:8081/v1",
    apiKey: process.env.MLX_LM_API_KEY || "mlx-lm",
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
  "mlx-omni": createAnthropic({
    baseURL: process.env.MLX_OMNI_URL || "http://localhost:8080/anthropic",
    apiKey: process.env.MLX_OMNI_API_KEY || "mlx-omni",
  }) as any,
  claude: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  }) as any,
};

// For mlx-omni, validate that we're using a local model path, not a HuggingFace ID
// mlx-omni-server loads models locally only - no remote HuggingFace access
function validateMlxOmniModel(modelPath: string | undefined): string {
  if (!modelPath) {
    throw new Error(
      "[anyclaude] MLX-Omni mode requires MLX_OMNI_MODEL or MLX_MODEL environment variable.\n" +
      "Must be a local file path (e.g., /path/to/model-4bit), not a HuggingFace model ID.\n" +
      "Example: MLX_OMNI_MODEL=/Users/user/models/Qwen3-Coder-30B-MLX-4bit anyclaude"
    );
  }

  // Check if it looks like a HuggingFace ID (org/model format or just model name)
  // HuggingFace IDs typically don't start with / or contain full paths
  const isHuggingFaceId =
    !modelPath.startsWith("/") &&
    !modelPath.includes("/Users/") &&
    !modelPath.includes("/home/") &&
    !modelPath.includes("\\") &&
    !modelPath.match(/^[A-Z]:/); // Not Windows absolute path

  if (isHuggingFaceId) {
    throw new Error(
      `[anyclaude] MLX-Omni mode does NOT support HuggingFace model IDs.\n` +
      `Got: "${modelPath}"\n` +
      `MLX-Omni only works with local model files (e.g., /path/to/model).\n` +
      `To use HuggingFace models, use MLX-LM or LMStudio mode instead.`
    );
  }

  return modelPath;
}

// Wrap initialization in async IIFE
(async () => {
  // Validate mlx-omni model path (must be local file, not HuggingFace ID)
  // The actual model path is only used for configuration/validation
  // We pass a recognized Anthropic model ID to the SDK for validation
  // The actual model running is determined by mlx-omni-server's loaded model, not this ID
  let mlxOmniModel = "claude-3-5-sonnet-20241022"; // Use standard Anthropic model ID for SDK compatibility
  if (mode === "mlx-omni") {
    validateMlxOmniModel(process.env.MLX_OMNI_MODEL || process.env.MLX_MODEL);
    // Just log the local model path for reference
    if (process.env.ANYCLAUDE_DEBUG) {
      console.log(`[anyclaude] MLX-Omni local model: ${process.env.MLX_OMNI_MODEL || process.env.MLX_MODEL}`);
    }
  }

  const proxyURL = createAnthropicProxy({
    providers,
    defaultProvider: mode,
    defaultModel:
      mode === "claude"
        ? "claude-3-5-sonnet-20241022"
        : mode === "mlx-lm"
          ? process.env.MLX_LM_MODEL || "current-model"
          : mode === "mlx-omni"
            ? mlxOmniModel
            : process.env.LMSTUDIO_MODEL || "current-model",
    mode,
    mlxOmniUrl: mode === "mlx-omni" ? (process.env.MLX_OMNI_URL || "http://localhost:8080/anthropic") : undefined,
  });

  console.log(`[anyclaude] Mode: ${mode.toUpperCase()}`);
  console.log(`[anyclaude] Proxy URL: ${proxyURL}`);

  if (mode === "lmstudio") {
    console.log(
      `[anyclaude] LMStudio endpoint: ${process.env.LMSTUDIO_URL || "http://localhost:1234/v1"}`
    );
    console.log(
      `[anyclaude] Model: ${process.env.LMSTUDIO_MODEL || "current-model"} (uses whatever is loaded in LMStudio)`
    );
  } else if (mode === "mlx-lm") {
    console.log(
      `[anyclaude] MLX-LM endpoint: ${process.env.MLX_LM_URL || "http://localhost:8080/v1"}`
    );
    console.log(
      `[anyclaude] Model: ${process.env.MLX_LM_MODEL || "current-model"} (with native KV cache)`
    );
  } else if (mode === "mlx-omni") {
    console.log(
      `[anyclaude] MLX-Omni-Server endpoint: ${process.env.MLX_OMNI_URL || "http://localhost:8080/anthropic"}`
    );
    console.log(
      `[anyclaude] Model: ${mlxOmniModel} (with KV cache + tool calling)`
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
      process.exit(code ?? 0);
    });
  }
})();
