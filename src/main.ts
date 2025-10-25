// Proxy wrapper to run Claude Code with LMStudio local models

import { createOpenAI } from "@ai-sdk/openai";
import { spawn } from "child_process";
import { config } from "dotenv";
import {
  createAnthropicProxy,
  type CreateAnthropicProxyOptions,
} from "./anthropic-proxy";

// Load .env file if it exists (from current working directory)
config();

// Detect the first loaded LLM model from LMStudio
async function detectLoadedModel(baseURL: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const modelsURL = baseURL.replace("/v1", "/api/v0/models");
    const response = await fetch(modelsURL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const loadedModel = data.data?.find(
      (m: any) => m.state === "loaded" && m.type === "llm"
    );
    return loadedModel?.id || null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

// Get model name (from env, auto-detect, or first available)
async function getModelName(baseURL: string): Promise<string> {
  // 1. Check environment variable
  if (process.env.LMSTUDIO_MODEL) {
    return process.env.LMSTUDIO_MODEL;
  }

  // 2. Try to auto-detect loaded model
  const loadedModel = await detectLoadedModel(baseURL);
  if (loadedModel) {
    return loadedModel;
  }

  // 3. Fall back to fetching first available model
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(`${baseURL}/models`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const firstModel = data.data?.[0]?.id;
      if (firstModel) {
        return firstModel;
      }
    }
  } catch {
    clearTimeout(timeoutId);
    // Ignore and use fallback
  }

  // 4. Final fallback
  return "current-model";
}

async function main() {
  const lmstudioURL = process.env.LMSTUDIO_URL || "http://localhost:1234/v1";

  // If LMSTUDIO_MODEL is set, use it statically; otherwise detect dynamically
  const getModel = process.env.LMSTUDIO_MODEL
    ? () => Promise.resolve(process.env.LMSTUDIO_MODEL!)
    : () => getModelName(lmstudioURL);

  // Get initial model for startup message
  const initialModel = await getModel();

  // Configure LMStudio provider
  const providers: CreateAnthropicProxyOptions["providers"] = {
    lmstudio: createOpenAI({
      baseURL: lmstudioURL,
      apiKey: process.env.LMSTUDIO_API_KEY || "lm-studio",
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

        // Add timeout to all LMStudio requests (120s for inference)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        try {
          const response = await globalThis.fetch(url, {
            ...init,
            signal: init?.signal || controller.signal,
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }) as typeof fetch,
    }),
  };

  const proxyURL = createAnthropicProxy({
    providers,
    defaultProvider: "lmstudio",
    defaultModel: initialModel,
  });

  console.log(`[anyclaude] LMStudio proxy: ${proxyURL}`);
  console.log(`[anyclaude] LMStudio endpoint: ${lmstudioURL}`);
  console.log(
    `[anyclaude] Model: ${initialModel}${process.env.LMSTUDIO_MODEL ? "" : " (dynamic - will update if you switch models)"}`
  );

  if (process.env.PROXY_ONLY === "true") {
    console.log("Proxy only mode - not spawning Claude Code");
  } else {
    const claudeArgs = process.argv.slice(2);
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
}

main().catch((err) => {
  console.error("[anyclaude] Fatal error:", err);
  process.exit(1);
});
