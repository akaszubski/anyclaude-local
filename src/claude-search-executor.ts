/**
 * Execute web search via SearxNG (free public instances), Tavily, Brave, or Anthropic API (fallback)
 */

import { spawn } from "child_process";
import { debug } from "./debug";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

/**
 * Public SearxNG instances that support JSON format
 * These are free, no API key needed
 * Source: https://github.com/GaryKu0/ollama-web-search
 */
const SEARXNG_INSTANCES = [
  "https://search.inetol.net/search",
  "https://searx.be/search",
  "https://search.brave4u.com/search",
  "https://priv.au/search",
];

/**
 * Execute web search using SearxNG public instances (free, no API key)
 * Tries multiple instances for reliability
 */
async function searchViaSearxNG(query: string): Promise<SearchResult[]> {
  debug(1, `[SearxNG] Searching for: "${query}"`);

  const errors: string[] = [];

  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}?q=${encodeURIComponent(query)}&format=json&categories=general`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        errors.push(`${instance}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as {
        results?: Array<{ url: string; title: string; content?: string }>;
      };

      const results: SearchResult[] = [];
      for (const result of (data.results || []).slice(0, 10)) {
        results.push({
          url: result.url,
          title: result.title,
          snippet: result.content || undefined,
        });
      }

      if (results.length > 0) {
        debug(1, `[SearxNG] Got ${results.length} results from ${instance}`);
        return results;
      }

      errors.push(`${instance}: No results`);
    } catch (error: any) {
      errors.push(`${instance}: ${error.message}`);
    }
  }

  throw new Error(`SearxNG search failed: ${errors.join(", ")}`);
}

/**
 * Execute web search using Tavily API (purpose-built for AI, 1000 free/month)
 * Set TAVILY_API_KEY environment variable to use
 * Get API key at: https://tavily.com/
 */
async function searchViaTavily(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY not set - get free key at https://tavily.com/"
    );
  }

  debug(1, `[Tavily] Searching for: "${query}"`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        include_answer: false,
        max_results: 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tavily API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ url: string; title: string; content?: string }>;
    };

    const results: SearchResult[] = [];
    for (const result of data.results || []) {
      results.push({
        url: result.url,
        title: result.title,
        snippet: result.content || undefined,
      });
    }

    debug(1, `[Tavily] Got ${results.length} results`);
    return results;
  } catch (error) {
    clearTimeout(timeoutId);
    debug(1, `[Tavily] Search failed: ${error}`);
    throw error;
  }
}

/**
 * Execute web search using Brave Search API (free tier: 2000/month)
 * Set BRAVE_API_KEY environment variable to use
 * Get API key at: https://brave.com/search/api/
 */
async function searchViaBrave(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_API_KEY not set");
  }

  debug(1, `[Brave] Searching for: "${query}"`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      web?: {
        results?: Array<{ url: string; title: string; description?: string }>;
      };
    };

    const results: SearchResult[] = [];
    for (const result of data.web?.results || []) {
      results.push({
        url: result.url,
        title: result.title,
        snippet: result.description || undefined,
      });
    }

    debug(1, `[Brave] Got ${results.length} results`);
    return results;
  } catch (error) {
    clearTimeout(timeoutId);
    debug(1, `[Brave] Search failed: ${error}`);
    throw error;
  }
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

  const data = (await response.json()) as any;
  debug(1, `[Claude Search] API response received`);

  // Extract search results from response content
  const results: SearchResult[] = [];

  if (data?.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      // Look for web_search_tool_result blocks
      if (block.type === "web_search_tool_result" && block.content) {
        // Each result has url, title, encrypted_content, page_age
        for (const result of block.content) {
          if (
            result.type === "web_search_result" &&
            result.url &&
            result.title
          ) {
            results.push({
              url: result.url,
              title: result.title,
            });
          }
        }
      }
      // Also check for citations in text blocks
      else if (block.type === "text" && block.citations) {
        for (const citation of block.citations) {
          if (
            citation.type === "web_search_result_location" &&
            citation.url &&
            citation.title
          ) {
            // Avoid duplicates
            if (!results.some((r) => r.url === citation.url)) {
              results.push({
                url: citation.url,
                title: citation.title,
              });
            }
          }
        }
      }
    }
  }

  debug(1, `[Claude Search] Got ${results.length} results from API`);

  return results;
}

/**
 * Get local SearxNG URL from environment or default
 * Returns SEARXNG_URL if set, otherwise http://localhost:8080
 */
export function getLocalSearxngUrl(): string {
  const envUrl = process.env.SEARXNG_URL;
  if (envUrl && envUrl.trim() !== "") {
    // Normalize trailing slash
    return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  }
  return "http://localhost:8080";
}

/**
 * Execute web search via local SearxNG instance (self-hosted)
 * Requires local SearxNG server running (default: http://localhost:8080)
 *
 * @param query - Search query string
 * @param baseUrl - Optional custom SearxNG URL (defaults to getLocalSearxngUrl())
 * @returns Array of SearchResult objects
 * @throws Error with descriptive message on failure
 */
export async function searchViaLocalSearxNG(
  query: string,
  baseUrl?: string
): Promise<SearchResult[]> {
  const searxngUrl = baseUrl || getLocalSearxngUrl();
  const url = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;

  debug(1, `[Local SearxNG] Searching for: "${query}" at ${searxngUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 403) {
        throw new Error(
          `SearxNG JSON format disabled. Enable in settings.yml: search.formats: [html, json] (HTTP 403)`
        );
      }

      throw new Error(
        `Local SearxNG HTTP ${response.status} ${response.statusText}: ${errorText}`
      );
    }

    const data = (await response.json()) as {
      results?: Array<{ url: string; title: string; content?: string }>;
    };

    const results: SearchResult[] = [];
    const resultList = data.results || [];

    // Limit to 10 results and filter out invalid entries
    for (const result of resultList.slice(0, 10)) {
      // Skip entries missing required fields
      if (!result.url || !result.title) {
        continue;
      }

      results.push({
        url: result.url,
        title: result.title,
        snippet: result.content || undefined,
      });
    }

    debug(1, `[Local SearxNG] Got ${results.length} results`);
    return results;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Provide helpful error messages (order matters!)
    if (error.name === "AbortError") {
      throw new Error(`Local SearxNG timeout after 5s at ${searxngUrl}`);
    }

    if (
      error.code === "ECONNREFUSED" ||
      error.message.includes("ECONNREFUSED")
    ) {
      throw new Error(
        `Local SearxNG not running at ${searxngUrl}. Start with: docker compose -f scripts/docker/docker-compose.searxng.yml up -d`
      );
    }

    // Check if error is already our custom error (from status code checks above)
    if (
      error.message &&
      (error.message.includes("403") ||
        error.message.includes("JSON format disabled"))
    ) {
      throw error; // Re-throw our custom 403 error
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      // Re-throw SyntaxError directly (don't wrap it)
      throw error;
    }

    if (error.message && error.message.includes("JSON")) {
      throw new Error(
        `Invalid JSON response from SearxNG at ${searxngUrl}. Check server configuration.`
      );
    }

    // Re-throw other errors with context
    throw error;
  }
}

/**
 * Execute web search with fallback chain:
 * 1. Try local SearxNG (if SEARXNG_URL is set) - privacy-first, self-hosted
 * 2. Try Anthropic API (uses your existing ANTHROPIC_API_KEY - most reliable!)
 * 3. Try Tavily (AI-optimized, 1000 free/month) - needs TAVILY_API_KEY
 * 4. Try Brave (2000 free/month) - needs BRAVE_API_KEY
 * 5. Try SearxNG (free public instances, but often rate-limited)
 * 6. Error if all fail
 */
export async function executeClaudeSearch(
  query: string
): Promise<SearchResult[]> {
  // Try local SearxNG first if configured (privacy-first, no rate limits)
  if (process.env.SEARXNG_URL) {
    debug(1, `[Search] Trying local SearxNG at ${process.env.SEARXNG_URL}`);
    try {
      const results = await searchViaLocalSearxNG(query);
      if (results.length > 0) {
        debug(1, `[Search] Local SearxNG returned ${results.length} results`);
        return results;
      }
      // Empty results, try fallback
      debug(1, `[Search] Local SearxNG returned no results, trying fallback`);
    } catch (localError) {
      debug(1, `[Search] Local SearxNG failed: ${localError}, trying fallback`);
    }
  } else {
    debug(2, `[Search] SEARXNG_URL not set, skipping local search`);
  }

  // Try Anthropic API first (user already has this key, most reliable)
  try {
    return await searchViaAPI(query);
  } catch (apiError) {
    debug(1, `[Search] Anthropic API failed: ${apiError}`);
  }

  // Try Tavily (AI-optimized, good free tier)
  try {
    return await searchViaTavily(query);
  } catch (tavilyError) {
    debug(1, `[Search] Tavily failed: ${tavilyError}`);
  }

  // Try Brave (good free tier)
  try {
    return await searchViaBrave(query);
  } catch (braveError) {
    debug(1, `[Search] Brave failed: ${braveError}`);
  }

  // Try SearxNG last (free but often rate-limited)
  try {
    return await searchViaSearxNG(query);
  } catch (searxError) {
    debug(1, `[Search] SearxNG failed: ${searxError}`);
  }

  // All methods failed
  throw new Error(
    `Web search failed. Set SEARXNG_URL for local search, or ANTHROPIC_API_KEY or TAVILY_API_KEY or BRAVE_API_KEY for cloud search.`
  );
}
