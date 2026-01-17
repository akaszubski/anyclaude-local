# Research: Claude Code Proxies and Web Search Integration

**Date**: 2026-01-03
**Issue**: #47 - WebSearch for Local Models

## Overview

This document captures research on how other projects handle Claude Code proxying and web search integration for local models.

## Claude Code Proxy Projects

### 1. claude-code-proxy (1rgs)

**GitHub**: https://github.com/1rgs/claude-code-proxy

**Architecture**:

- LiteLLM-based translation layer
- Five-step pipeline: Receive → Translate → Send → Convert → Return
- Supports OpenAI, Gemini, Anthropic backends

**Capabilities**:

- Model mapping (haiku → small, sonnet → large)
- Streaming and non-streaming responses
- Provider switching via environment variables

**Limitations**:

- Does NOT handle WebSearch or tool calling
- Basic chat completion proxying only

### 2. LocalAI

**GitHub**: https://github.com/mudler/LocalAI

**Architecture**:

- Self-hosted, local-first AI platform
- Modular backend architecture
- Drop-in OpenAI replacement

**Tool Calling**:

- OpenAI-alike tools API
- MCP (Model Context Protocol) support (added October 2025)
- Specialized function-call models (e.g., LocalAI-functioncall-phi-4)
- Constrained grammars for structured output

**Links**:

- MCPs Repository: Part of LocalAI ecosystem
- LocalAGI: Advanced agentic features

### 3. LiteLLM Proxy

**Documentation**: https://docs.litellm.ai/docs/mcp
**GitHub**: https://github.com/BerriAI/litellm

**MCP Integration** (Most sophisticated):

- Server-side tool execution with `require_approval: "never"`
- Tool discovery via JSON-RPC (`tools/list`)
- Multi-transport: HTTP, SSE, stdio
- Automatic response integration

**Execution Flow**:

1. Tool Identification - Map tool name to MCP server
2. Parameter Conversion - Transform to MCP JSON-RPC format
3. Server Invocation - Forward call with auth
4. Response Integration - Feed results back to model

**Key Config**:

```yaml
mcp_servers:
  - name: "search"
    server_url: "http://localhost:3000"
    require_approval: "never" # Auto-execute
```

**OAuth 2.0 Support**: Added in v1.77.6 for MCP servers

## Open Source Claude Code Alternatives

### Cline

**Website**: https://cline.bot
**License**: AGPL-3.0

**Features**:

- VS Code native agent
- Plan → Review → Run loops
- MCP tool integrations
- Works with any model (cloud or local via Ollama)

**Best For**: All-around VS Code development with agentic capabilities

### OpenCode

**Article**: https://apidog.com/blog/opencode/

**Features**:

- Integrates with Claude Pro/Max subscription
- 75+ LLM providers including local models
- LSP (Language Server Protocol) for code context
- Zero configuration

### Aider

**Best For**: Terminal-first developers

**Features**:

- CLI-driven edits
- Git-aware diffs
- 100+ programming languages
- Direct codebase integration

### Continue.dev

**Features**:

- VS Code extensions
- Multi-model LLM support
- Inline editing
- Local model support via Ollama

## Web Search Integration Patterns

### Pattern 1: MCP Protocol (Industry Standard)

**Used By**: LiteLLM, LocalAI, Cline

**How It Works**:

1. Define MCP server with search tool
2. Model generates tool call
3. Proxy routes to MCP server
4. Server executes search, returns results
5. Proxy feeds results back to model

**Pros**: Standardized, extensible, supports many tools
**Cons**: Complex setup, requires MCP server

### Pattern 2: Proactive Search (Our Approach)

**Used By**: anyclaude

**How It Works**:

1. Detect server-side tools (e.g., `web_search_20250305`) in request
2. Filter them out (local model can't use them)
3. Detect search intent in user message
4. Execute DuckDuckGo search proactively
5. Inject results into system prompt

**Pros**: Simple, no MCP required, works immediately
**Cons**: Less flexible than MCP, intent detection may miss some queries

### Pattern 3: DuckDuckGo MCP Server

**PulseMCP**: https://www.pulsemcp.com/servers/lowlyocean-duckduckgo-search

**How It Works**:

- Standalone MCP server for DuckDuckGo
- Model calls `search_duckduckgo` tool
- Server executes and returns results

## Search Providers Comparison

| Provider     | API Key Required      | Rate Limits     | Best For                       |
| ------------ | --------------------- | --------------- | ------------------------------ |
| DuckDuckGo   | No                    | Moderate        | Free, privacy-focused          |
| Brave Search | Yes (free tier)       | 2000/month free | Privacy + good results         |
| Tavily       | Yes (1000/month free) | Generous        | AI-optimized, news/code search |
| SerpAPI      | Yes (paid)            | Per-request     | Google results                 |

### Tavily

**Website**: https://www.tavily.com/
**Free Tier**: 1,000 credits/month
**Features**: Specialized search for news, code, images

### Brave Search

**Features**: Privacy-focused, good for general queries

## Implementation in anyclaude

### Files Created/Modified

1. **`src/server-side-tool-handler.ts`** (NEW)
   - `isServerSideTool()` - Detect server-side tools
   - `filterServerSideTools()` - Separate from regular tools
   - `detectSearchIntent()` - Keyword-based intent detection
   - `executeProactiveSearch()` - DuckDuckGo search execution
   - `formatSearchResultsForContext()` - Format for system prompt

2. **`src/claude-search-executor.ts`** (MODIFIED)
   - `searchViaDuckDuckGo()` - Free search without API key
   - Fallback chain: DuckDuckGo → Claude CLI → Anthropic API

3. **`src/anthropic-proxy.ts`** (MODIFIED)
   - Filter server-side tools for local models
   - Execute proactive search when web_search tool enabled
   - Inject results into system prompt

### Search Intent Detection Keywords

```typescript
const SEARCH_INTENT_PATTERNS = [
  /\b(current|latest|recent|today|now|2024|2025|2026)\b/i,
  /\b(news|update|announce|release|launched?)\b/i,
  /\b(search|look up|find out|google|what is|who is)\b/i,
  /\b(weather|temperature|price|stock|rate|cost)\b/i,
  /\b(happening|event|schedule|when (is|was|will))\b/i,
];
```

## Future Improvements

1. **MCP Integration**: Add optional MCP support for more flexible tool handling
2. **Tavily Integration**: Add as alternative search provider with better AI-optimized results
3. **Caching**: Cache search results to reduce API calls
4. **User Preferences**: Allow users to choose search provider

## References

### Documentation

- [Anthropic Web Search Tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool)
- [LiteLLM MCP Overview](https://docs.litellm.ai/docs/mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Articles

- [Claude Code Alternatives](https://www.qodo.ai/blog/claude-code-alternatives/)
- [Open Source Claude Alternatives](https://openalternative.co/alternatives/claude-code)
- [Beyond Tavily - AI Search APIs 2025](https://websearchapi.ai/blog/tavily-alternatives)

### GitHub Repositories

- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)
- [LocalAI](https://github.com/mudler/LocalAI)
- [LiteLLM](https://github.com/BerriAI/litellm)
- [Aider](https://github.com/paul-gauthier/aider)
- [Continue.dev](https://github.com/continuedev/continue)
