/**
 * LLMClassifier - GenAI-based binary YES/NO search intent classification
 *
 * Makes classification calls to local backend LLMs to determine if a user message
 * indicates search intent (wanting current/real-time web information).
 *
 * Features:
 * - Binary YES/NO classification via backend LLM
 * - Fuzzy response parsing (handles "Yes, because...", "No.", etc.)
 * - JSON response parsing ({"answer": "YES"}, {"is_search": true})
 * - Timeout handling
 * - Skip classification for cloud modes (claude, openrouter)
 * - Graceful error handling
 */

import { debug } from "./debug";

const DEFAULT_BACKEND_URL = "http://localhost:1234";
const DEFAULT_TIMEOUT_MS = 3000;

export class LLMClassifier {
  private mode: string;
  private backendUrl: string;
  private timeout: number;

  /**
   * Create a new LLMClassifier
   * @param mode Backend mode (local, mlx-cluster, claude, openrouter)
   * @param backendUrl Backend URL for local/mlx-cluster modes (default: http://localhost:1234)
   * @param timeout Timeout in milliseconds (default: 3000)
   */
  constructor(mode: string, backendUrl?: string, timeout?: number) {
    this.mode = mode;
    this.backendUrl = backendUrl || DEFAULT_BACKEND_URL;
    this.timeout = timeout || DEFAULT_TIMEOUT_MS;

    debug(2, "[LLMClassifier] Created classifier", {
      mode,
      backendUrl: this.backendUrl,
      timeout: this.timeout,
    });
  }

  /**
   * Classify a user message for search intent
   * @param message User message to classify
   * @returns true if search intent, false otherwise
   */
  async classify(message: string): Promise<boolean> {
    // Skip classification for cloud modes (they handle their own routing)
    if (this.mode === "claude" || this.mode === "openrouter") {
      debug(3, "[LLMClassifier] Skipping classification for cloud mode", {
        mode: this.mode,
      });
      return false;
    }

    const prompt = this.buildClassificationPrompt(message);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.backendUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a binary classifier for search intent. Answer only YES or NO.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.0, // Deterministic classification
          max_tokens: 10, // Only need YES or NO
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response format: missing choices or message");
      }

      const content = data.choices[0].message.content ?? "";
      const result = this.parseResponse(content);

      debug(3, "[LLMClassifier] Classification result", {
        message,
        content,
        result,
      });

      return result;
    } catch (error: any) {
      debug(1, "[LLMClassifier] Classification failed", {
        message,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Build classification prompt for LLM
   * @param message User message to classify
   * @returns Formatted prompt string
   */
  buildClassificationPrompt(message: string): string {
    return `You are a binary classifier. Your job is to determine if a user message indicates they want to search the web for information.

INSTRUCTIONS:
- Answer ONLY with "YES" or "NO"
- Do NOT provide explanations
- YES = user wants current/real-time web information
- NO = user wants local/coding assistance

USER MESSAGE:
${message}

CLASSIFICATION:`;
  }

  /**
   * Parse LLM response to extract YES/NO decision
   * Handles:
   * - Plain "YES" or "NO" (case-insensitive)
   * - Fuzzy responses like "Yes, this is..." or "No, because..."
   * - JSON responses like {"answer": "YES"} or {"is_search": true}
   *
   * @param response Raw LLM response
   * @returns true if YES, false if NO
   * @throws Error if response is ambiguous or empty
   */
  parseResponse(response: string): boolean {
    if (!response || response.trim().length === 0) {
      throw new Error("Empty response from classifier");
    }

    const normalized = response.trim().toUpperCase();

    // Try parsing entire response as JSON
    try {
      const json = JSON.parse(response);

      // Check for {"is_search": true/false}
      if (typeof json.is_search === "boolean") {
        return json.is_search;
      }

      // Check for {"answer": "YES"/"NO"}
      if (typeof json.answer === "string") {
        const answer = json.answer.trim().toUpperCase();
        if (answer === "YES") return true;
        if (answer === "NO") return false;
      }
    } catch {
      // Not valid JSON, try extracting JSON from text
      const jsonMatch = response.match(/\{[^}]*\}/);
      if (jsonMatch) {
        try {
          const json = JSON.parse(jsonMatch[0]);

          // Check for {"is_search": true/false}
          if (typeof json.is_search === "boolean") {
            return json.is_search;
          }

          // Check for {"answer": "YES"/"NO"}
          if (typeof json.answer === "string") {
            const answer = json.answer.trim().toUpperCase();
            if (answer === "YES") return true;
            if (answer === "NO") return false;
          }
        } catch {
          // Embedded JSON was invalid, continue with text parsing
        }
      }
    }

    // Exact match (case-insensitive)
    if (normalized === "YES") return true;
    if (normalized === "NO") return false;

    // Fuzzy matching: starts with YES or NO
    if (normalized.startsWith("YES")) return true;
    if (normalized.startsWith("NO")) return false;

    // Multi-line: extract YES/NO from anywhere in text
    if (/\bYES\b/.test(normalized)) return true;
    if (/\bNO\b/.test(normalized)) return false;

    // Ambiguous response - default to false (safer to not trigger web search)
    debug(2, "[LLMClassifier] Ambiguous response, defaulting to NO", {
      response,
    });
    return false;
  }
}
