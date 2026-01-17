# Research: Local LLM Proxy Patterns and Best Practices

**Date**: 2026-01-03
**Purpose**: Comprehensive research on how other projects handle local AI proxying

## Overview

This document captures patterns and learnings from other Claude Code proxies and local LLM projects that could improve anyclaude.

---

## 1. Caching Patterns

### LiteLLM Caching Architecture

**Source**: [LiteLLM Caching Docs](https://docs.litellm.ai/docs/proxy/caching)

**Levels of Caching**:

1. **LLM Response Caching** - Store complete API responses
2. **Internal Metadata Caching** - Auth tokens, rate limit counters
3. **Client Connection Caching** - Reuse HTTP clients

**Cache Key Generation**:

- Deterministic hash of: model, messages, temperature, other params
- `x-litellm-cache-key` response header for debugging

**Cache Backends**:
| Backend | Use Case |
|---------|----------|
| In-Memory | Single instance, development |
| Redis | Distributed, production |
| Qdrant | Semantic caching (similarity-based) |
| S3/GCS | Long-term storage |

**Semantic Caching** (Advanced):

- Uses vector embeddings instead of exact string matching
- Similarity threshold (typically 0.8)
- Requires embedding model configuration

### Prompt Caching (Provider-Specific)

**Auto-Injection**:

```yaml
cache_control_injection_points:
  - system
  - last_user_message
```

**Cost Savings**: ~75% total savings with cached tokens (90% for cached portion)

### Improvement Opportunities for anyclaude

- [ ] Add semantic caching with Qdrant for similar prompts
- [ ] Implement cache_control auto-injection
- [ ] Add cache metrics dashboard
- [ ] Support distributed caching for multi-instance deployments

---

## 2. Context Window Management

### Techniques from Research

**Source**: [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**1. Content Prioritization**:

- "Must-have": current message, core instructions, system prompts
- "Optional": conversation history, metadata, examples
- Always include must-haves, append optional if space remains

**2. Sliding Window Technique**:

- Process in overlapping segments
- Example: 1000 token window, 500 token overlap
- Preserves context continuity

**3. Dynamic Prompting**:

- Incremental context building
- Adaptive prompts based on previous responses
- Context trimming as new info arrives

**4. Semantic Compression**:

- Compress to ~1/6 original size
- Segment → Embed → Cluster → Summarize → Reassemble

**5. Lost-in-the-Middle Effect**:

- LLMs weigh beginning/end more heavily (primacy/recency bias)
- Important context in middle may be undervalued
- Solution: Place critical info at start or end

### Current anyclaude Implementation

- Safe system filter for prompt optimization
- Context truncation when exceeding limits
- Adaptive optimizer with tier selection

### Improvement Opportunities

- [ ] Implement semantic compression for long contexts
- [ ] Add sliding window for conversation history
- [ ] Prioritize critical sections placement (start/end)
- [ ] Add context utilization metrics

---

## 3. Load Balancing and Routing

### LiteLLM Router Strategies

**Source**: [LiteLLM Router Docs](https://docs.litellm.ai/docs/routing)

**Routing Strategies**:
| Strategy | Description |
|----------|-------------|
| simple-shuffle | Random distribution (default) |
| least-busy | Route to least loaded backend |
| usage-based | Based on token consumption |
| latency-based | Route to lowest latency backend |

**Features**:

- Automatic retry with exponential backoff
- Fallback to secondary models
- Cooldown periods for failed backends
- Priority queuing for important requests

### Azure AI Gateway Pattern

**Source**: [Azure AI Gateway](https://deepwiki.com/Azure-Samples/AI-Gateway/2.2-backend-pool-load-balancing)

**Backend Pool Load Balancing**:

- Round-robin by default
- Priority and weight-based routing
- Health-aware automatic failover
- PTU-to-consumption tiered model

### Improvement Opportunities for anyclaude

- [ ] Add multiple backend support
- [ ] Implement latency-based routing
- [ ] Add backend health monitoring
- [ ] Support priority queuing

---

## 4. Error Handling and Resilience

### Retry Strategies

**Source**: [Portkey Resilience Patterns](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)

**Exponential Backoff with Jitter**:

```
Wait times: 1s → 2s → 4s → 8s (with random jitter)
```

**Key Considerations**:

- Failed requests still count toward rate limits
- Honor `Retry-After` headers
- Don't retry non-retriable errors (4xx except 429)

### Fallback Strategies

**LiteLLM Fallback Config**:

```yaml
fallbacks:
  - zephyr-beta: ["gpt-3.5-turbo"]
num_retries: 3
request_timeout: 10
```

### Circuit Breaker Pattern

**When to Use**:

- Detect persistent failures
- Stop traffic before things get worse
- Prevent retry storms

**States**:

1. Closed (normal operation)
2. Open (block requests after failures)
3. Half-Open (test recovery)

### Streaming Error Handling

**Common Issues**:

- `ERR_INCOMPLETE_CHUNKED_ENCODING`
- 429 before streaming starts
- Network interruptions mid-stream

**Best Practices**:

- Avoid plugins that buffer full response
- Implement SSE-aware error handling
- Retry only before first chunk sent

### Improvement Opportunities for anyclaude

- [ ] Add circuit breaker for backend failures
- [ ] Implement model fallback chains
- [ ] Add configurable retry policies
- [ ] Better streaming error recovery

---

## 5. Tool Calling Patterns

### Ollama Tool Calling

**Source**: [Ollama Tool Docs](https://docs.ollama.com/capabilities/tool-calling)

**Requirements**:

- Model must have "tools" capability (check with `ollama show`)
- Works well with simple examples
- Complex prompts may break with small models (8b)

**Patterns**:

- Single-shot: One tool, include result in follow-up
- Multi-tool hack: Only call first tool, remove others from response

### MCP (Model Context Protocol)

**Source**: [LiteLLM MCP Docs](https://docs.litellm.ai/docs/mcp)

**Server-Side Execution Flow**:

1. Tool Discovery - Fetch tools via JSON-RPC
2. LLM Call - Send tools with input
3. Tool Execution - Parse, route, execute
4. Response Integration - Feed results back to LLM

**Auto-Execution Config**:

```yaml
require_approval: "never" # Auto-execute tools
```

### OllamaClaude MCP Server

**GitHub**: [jadael/ollamaclade](https://lobehub.com/mcp/jadael-ollamaclade)

**Benefits**:

- Up to 98.75% API token reduction
- Claude as orchestrator, Ollama for execution
- Claude reviews/refines results

### Improvement Opportunities for anyclaude

- [ ] Add MCP server support
- [ ] Implement tool result caching
- [ ] Add tool execution metrics
- [ ] Support parallel tool execution

---

## 6. Web Search Integration

### Provider Comparison

| Provider   | API Key | Free Tier | Best For            |
| ---------- | ------- | --------- | ------------------- |
| DuckDuckGo | No      | Unlimited | Privacy, simplicity |
| Brave      | Yes     | 2000/mo   | Privacy + quality   |
| Tavily     | Yes     | 1000/mo   | AI-optimized        |
| SerpAPI    | Yes     | Paid      | Google results      |

### MCP Search Servers

- [DuckDuckGo MCP](https://www.pulsemcp.com/servers/lowlyocean-duckduckgo-search)
- [Tavily MCP](https://skywork.ai/skypage/en/tavily-search-ai-toolkit/)
- [Brave MCP](https://www.pulsemcp.com/)

### Current anyclaude Implementation

- Proactive DuckDuckGo search on intent detection
- Server-side tool filtering for web_search
- Context injection of search results

### Improvement Opportunities

- [ ] Add Tavily as alternative provider
- [ ] Implement search result caching
- [ ] Add source citations formatting
- [ ] Support domain filtering

---

## 7. System Prompt Optimization

### Best Practices

**Source**: [Context Engineering Guide](https://eval.16x.engineer/blog/llm-context-management-guide)

**Organization**:

- Use XML tags or Markdown headers for sections
- Separate: `<background>`, `<instructions>`, `<tools>`, `<output>`
- Place critical instructions at start and end

**Optimization Techniques**:

- Remove unnecessary whitespace
- Consolidate redundant sections
- Use templates with dynamic injection
- Compress verbose descriptions

**Cost Impact**:

- Each token is billable
- Reducing tokens can cut costs 30-60%
- Context caching reduces long context costs

### Current anyclaude Implementation

- Safe system filter with tier-based optimization
- Critical section preservation
- Adaptive optimizer with complexity detection

### Improvement Opportunities

- [ ] Add template-based prompt compression
- [ ] Implement section importance scoring
- [ ] Add prompt overhead metrics
- [ ] Support custom optimization rules

---

## Summary of Improvement Opportunities

### High Priority

1. **Circuit Breaker** - Prevent cascade failures
2. **Model Fallbacks** - Graceful degradation
3. **Semantic Caching** - Reduce redundant requests
4. **MCP Support** - Standard tool protocol

### Medium Priority

5. **Multiple Backends** - Load distribution
6. **Better Retry Logic** - Exponential backoff with jitter
7. **Streaming Error Recovery** - Handle mid-stream failures
8. **Search Result Caching** - Reduce DuckDuckGo calls

### Lower Priority

9. **Context Compression** - Semantic summarization
10. **Tool Execution Metrics** - Performance tracking
11. **Distributed Caching** - Multi-instance support
12. **Health Dashboard** - Monitoring UI

---

## References

### Documentation

- [LiteLLM Docs](https://docs.litellm.ai/)
- [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Ollama Capabilities](https://docs.ollama.com/capabilities/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Articles

- [LLM Context Management Guide](https://eval.16x.engineer/blog/llm-context-management-guide)
- [Retries, Fallbacks, Circuit Breakers](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)
- [API Gateway LLM Proxying](https://api7.ai/learning-center/api-gateway-guide/api-gateway-proxy-llm-requests)

### GitHub Repositories

- [LiteLLM](https://github.com/BerriAI/litellm)
- [LocalAI](https://github.com/mudler/LocalAI)
- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)
- [Azure AI Gateway](https://github.com/Azure-Samples/AI-Gateway)
