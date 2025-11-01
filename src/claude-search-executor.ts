/**
 * Execute web search via Claude Code CLI (uses subscription) or Anthropic API (fallback)
 */

import { spawn } from "child_process";
import { debug } from "./debug";

export interface SearchResult {
  title: string;
  url: string;
}

/**
 * Execute web search using Claude Code CLI
 * This uses the user's Claude Code subscription
 */
async function searchViaClaudeCLI(query: string): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    debug(
      1,
      `[Claude Search] Executing via Claude Code CLI for query: "${query}"`
    );

    const prompt = `Please perform a web search for: "${query}"\n\nReturn ONLY a JSON array of search results in this exact format:\n[{"title": "...", "url": "..."}]\n\nDo not include any other text.`;

    const child = spawn("claude", ["--prompt", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        debug(1, `[Claude Search] CLI failed with code ${code}: ${stderr}`);
        reject(new Error(`Claude CLI failed: ${stderr}`));
        return;
      }

      try {
        // Try to extract JSON array from response
        const jsonMatch = stdout.match(/\[[\s\S]*?\]/);
        if (!jsonMatch) {
          debug(1, `[Claude Search] Could not find JSON array in response`);
          reject(new Error("Could not parse search results from Claude CLI"));
          return;
        }

        const results = JSON.parse(jsonMatch[0]);
        debug(
          1,
          `[Claude Search] Got ${results.length} results from Claude CLI`
        );
        resolve(results);
      } catch (error) {
        debug(1, `[Claude Search] Failed to parse results: ${error}`);
        reject(error);
      }
    });

    child.on("error", (error) => {
      debug(1, `[Claude Search] Failed to spawn Claude CLI: ${error}`);
      reject(error);
    });
  });
}

/**
 * Execute web search using Anthropic API (fallback)
 */
async function searchViaAPI(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  debug(1, `[Claude Search] Executing via Anthropic API for query: "${query}"`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],
      messages: [
        {
          role: "user",
          content: `Please search for: ${query}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    debug(1, `[Claude Search] API error: ${error}`);
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  debug(1, `[Claude Search] API response received`);

  // Extract search results from tool_use content
  // This is simplified - actual parsing depends on response format
  const results: SearchResult[] = [];

  // TODO: Parse actual Anthropic API response format for web search results
  // For now, return empty array
  debug(1, `[Claude Search] Got ${results.length} results from API`);

  return results;
}

/**
 * Execute web search with fallback chain:
 * 1. Try Claude Code CLI (uses subscription)
 * 2. Fallback to Anthropic API (requires ANTHROPIC_API_KEY)
 * 3. Error if both fail
 */
export async function executeClaudeSearch(
  query: string
): Promise<SearchResult[]> {
  try {
    // Try Claude CLI first (uses subscription)
    return await searchViaClaudeCLI(query);
  } catch (cliError) {
    debug(1, `[Claude Search] CLI failed, trying API fallback: ${cliError}`);

    try {
      // Fallback to API
      return await searchViaAPI(query);
    } catch (apiError) {
      debug(1, `[Claude Search] API fallback also failed: ${apiError}`);
      throw new Error(
        `Web search failed. Claude CLI error: ${cliError}. API error: ${apiError}. ` +
          `Please ensure Claude Code is authenticated or set ANTHROPIC_API_KEY.`
      );
    }
  }
}
