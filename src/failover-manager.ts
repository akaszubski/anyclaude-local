/**
 * Failover Manager for Emergency LMStudio Fallback
 *
 * This module manages automatic failover from Anthropic servers to LMStudio
 * when Claude's servers are unavailable. It implements:
 *
 * - Circuit breaker pattern for fast failure detection
 * - Health checks for service monitoring
 * - Transparent request routing
 * - Logging and monitoring
 *
 * Architecture:
 * 1. Normal operation → All requests to Anthropic (CLOSED state)
 * 2. Anthropic down → Circuit opens, requests to LMStudio (OPEN state)
 * 3. Recovery testing → Periodic attempts to Anthropic (HALF_OPEN state)
 */

import { CircuitBreaker, CircuitState } from "./circuit-breaker";
import { HealthCheckService } from "./health-check";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderV2 } from "@ai-sdk/provider";

export interface FailoverConfig {
  enabled: boolean;
  forceLMStudio: boolean;
  lmstudioUrl: string;
  lmstudioModel: string;
  lmstudioApiKey: string;
  healthCheckInterval: number;
  circuitFailureThreshold: number;
  requestTimeout: number;
  anthropicUrl: string;
}

export class FailoverManager {
  private circuitBreaker: CircuitBreaker;
  private healthCheckService: HealthCheckService;
  private config: FailoverConfig;
  private lmstudioProvider: ProviderV2 | null = null;

  constructor(config: Partial<FailoverConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? process.env.FAILOVER_ENABLED !== "false",
      forceLMStudio:
        config.forceLMStudio ?? process.env.FORCE_LMSTUDIO === "true",
      lmstudioUrl:
        config.lmstudioUrl ??
        process.env.LMSTUDIO_URL ??
        "http://localhost:1234/v1",
      lmstudioModel:
        config.lmstudioModel ?? process.env.LMSTUDIO_MODEL ?? "local-model",
      lmstudioApiKey:
        config.lmstudioApiKey ?? process.env.LMSTUDIO_API_KEY ?? "lm-studio",
      healthCheckInterval:
        config.healthCheckInterval ??
        parseInt(process.env.HEALTH_CHECK_INTERVAL ?? "30000"),
      circuitFailureThreshold:
        config.circuitFailureThreshold ??
        parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD ?? "3"),
      requestTimeout:
        config.requestTimeout ??
        parseInt(process.env.REQUEST_TIMEOUT ?? "5000"),
      anthropicUrl:
        config.anthropicUrl ??
        process.env.ANTHROPIC_API_URL ??
        "https://api.anthropic.com",
    };

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: this.config.circuitFailureThreshold,
      successThreshold: 2,
      retryTimeout: 30000,
      requestTimeout: this.config.requestTimeout,
    });

    // Set up state change logging
    this.circuitBreaker.onStateChangeListener((state) => {
      this.logStateChange(state);
    });

    // Initialize health check service
    this.healthCheckService = new HealthCheckService(
      {
        enabled: this.config.enabled,
        interval: this.config.healthCheckInterval,
        endpoint: `${this.config.anthropicUrl}/v1/messages`,
        timeout: this.config.requestTimeout,
      },
      this.circuitBreaker
    );

    // Initialize LMStudio provider if enabled
    if (this.config.enabled || this.config.forceLMStudio) {
      this.lmstudioProvider = createOpenAI({
        baseURL: this.config.lmstudioUrl,
        apiKey: this.config.lmstudioApiKey,
        // CRITICAL: Use legacy chat completions format for LMStudio compatibility
        // LMStudio expects the standard OpenAI Chat Completions API, not the new Responses API
        // @ts-ignore - compatibility is valid but not in TypeScript types
        compatibility: "legacy",
        fetch: (async (url, init) => {
          if (init?.body && typeof init.body === "string") {
            const body = JSON.parse(init.body);
            const originalBody = { ...body };

            // Remove parameters that LMStudio doesn't support
            // Most local models don't support reasoning, service_tier, or complex tool configs
            delete body.reasoning;
            delete body.service_tier;

            // Map max_tokens to max_completion_tokens for OpenAI compatibility
            const maxTokens = body.max_tokens;
            delete body.max_tokens;
            if (typeof maxTokens !== "undefined") {
              body.max_completion_tokens = maxTokens;
            }

            // Disable parallel tool calls for LMStudio (may not be supported)
            body.parallel_tool_calls = false;

            // Remove tools if empty to avoid confusing local models
            if (body.tools && body.tools.length === 0) {
              delete body.tools;
            }

            // Log what we're sending to LMStudio in debug mode
            if (process.env.ANYCLAUDE_DEBUG) {
              console.log("[LMStudio Fetch] Request transformation:");
              console.log(
                "  - Removed:",
                Object.keys(originalBody)
                  .filter((k) => !(k in body))
                  .join(", ")
              );
              console.log("  - Model:", body.model);
              console.log("  - Messages:", body.messages?.length || 0);
              console.log("  - Tools:", body.tools?.length || 0);
              console.log("  - Max tokens:", body.max_completion_tokens);
              console.log("  - Stream:", body.stream);
              if (parseInt(process.env.ANYCLAUDE_DEBUG!) >= 2) {
                console.log(
                  "[LMStudio Fetch] Full body:",
                  JSON.stringify(body, null, 2)
                );
              }
            }

            init.body = JSON.stringify(body);
          }
          return globalThis.fetch(url, init);
        }) as typeof fetch,
      });
    }

    // Force open circuit if FORCE_LMSTUDIO is set
    if (this.config.forceLMStudio) {
      this.circuitBreaker.trip();
      console.log(
        "[Failover] FORCE_LMSTUDIO enabled - all requests will use LMStudio"
      );
    }
  }

  /**
   * Start failover monitoring
   */
  public start(): void {
    if (!this.config.enabled) {
      return;
    }

    this.healthCheckService.start();
    console.log("[Failover] Emergency failover system enabled");
    console.log(`[Failover] LMStudio endpoint: ${this.config.lmstudioUrl}`);
    console.log(`[Failover] Default model: ${this.config.lmstudioModel}`);
  }

  /**
   * Stop failover monitoring
   */
  public stop(): void {
    this.healthCheckService.stop();
  }

  /**
   * Check if request should use failover
   */
  public shouldUseFallback(): boolean {
    if (!this.config.enabled && !this.config.forceLMStudio) {
      return false;
    }

    // Manual override
    if (this.config.forceLMStudio) {
      return true;
    }

    // Check circuit breaker state
    return !this.circuitBreaker.shouldAllowRequest();
  }

  /**
   * Get LMStudio provider (for failover)
   */
  public getLMStudioProvider(): ProviderV2 | null {
    return this.lmstudioProvider;
  }

  /**
   * Get default LMStudio model name
   */
  public getLMStudioModel(): string {
    return this.config.lmstudioModel;
  }

  /**
   * Record successful request to Anthropic
   */
  public recordSuccess(): void {
    if (this.config.enabled && !this.config.forceLMStudio) {
      this.circuitBreaker.recordSuccess();
    }
  }

  /**
   * Record failed request to Anthropic
   */
  public recordFailure(): void {
    if (this.config.enabled && !this.config.forceLMStudio) {
      this.circuitBreaker.recordFailure();
    }
  }

  /**
   * Get current failover status
   */
  public getStatus() {
    return {
      enabled: this.config.enabled,
      forceLMStudio: this.config.forceLMStudio,
      circuit: this.circuitBreaker.getStats(),
      healthCheck: this.healthCheckService.getStatus(),
      lmstudioUrl: this.config.lmstudioUrl,
    };
  }

  /**
   * Log state changes
   */
  private logStateChange(state: CircuitState): void {
    switch (state) {
      case CircuitState.OPEN:
        console.error(
          "[Failover] ⚠️  Circuit OPEN - Anthropic servers appear to be down"
        );
        console.error(
          "[Failover] 🔄 Failing over to LMStudio at",
          this.config.lmstudioUrl
        );
        break;
      case CircuitState.HALF_OPEN:
        console.log(
          "[Failover] 🔍 Circuit HALF_OPEN - Testing Anthropic recovery..."
        );
        break;
      case CircuitState.CLOSED:
        console.log(
          "[Failover] ✅ Circuit CLOSED - Anthropic servers recovered, back to normal"
        );
        break;
    }
  }

  /**
   * Manually trip circuit (for testing)
   */
  public tripCircuit(): void {
    this.circuitBreaker.trip();
  }

  /**
   * Manually reset circuit (for testing)
   */
  public resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
