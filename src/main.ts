// Proxy wrapper to run Claude Code with LMStudio local models

import { createOpenAI } from "@ai-sdk/openai";
import { spawn } from "child_process";
import {
  createAnthropicProxy,
  type CreateAnthropicProxyOptions,
} from "./anthropic-proxy";

// Configure LMStudio provider
const providers: CreateAnthropicProxyOptions["providers"] = {
  lmstudio: createOpenAI({
    baseURL: process.env.LMSTUDIO_URL || "http://localhost:1234/v1",
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
      return globalThis.fetch(url, init);
    }) as typeof fetch,
  }),
};

const proxyURL = createAnthropicProxy({
  providers,
  defaultProvider: "lmstudio",
  defaultModel: process.env.LMSTUDIO_MODEL || "current-model",
});

console.log(`[anyclaude] LMStudio proxy: ${proxyURL}`);
console.log(
  `[anyclaude] LMStudio endpoint: ${process.env.LMSTUDIO_URL || "http://localhost:1234/v1"}`
);
console.log(
  `[anyclaude] Model: ${process.env.LMSTUDIO_MODEL || "current-model"} (uses whatever is loaded in LMStudio)`
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
