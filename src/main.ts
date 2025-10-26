// Proxy wrapper to run Claude Code with LMStudio local models or real Anthropic API

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { spawn } from "child_process";
import {
  createAnthropicProxy,
  type CreateAnthropicProxyOptions,
} from "./anthropic-proxy";
import type { AnyclaudeMode } from "./trace-logger";

/**
 * Parse CLI arguments for --mode flag
 */
function parseModeFromArgs(args: string[]): AnyclaudeMode | null {
  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.substring(7).toLowerCase();
      if (mode === "claude" || mode === "lmstudio") {
        return mode;
      }
      console.error(
        `[anyclaude] Invalid mode: ${mode}. Must be 'claude' or 'lmstudio'.`
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
  if (envMode === "claude" || envMode === "lmstudio") {
    return envMode;
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
      return globalThis.fetch(url, init);
    }) as typeof fetch,
  }),
  claude: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  }) as any,
};

const proxyURL = createAnthropicProxy({
  providers,
  defaultProvider: mode,
  defaultModel:
    mode === "claude"
      ? "claude-3-5-sonnet-20241022"
      : process.env.LMSTUDIO_MODEL || "current-model",
  mode,
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
