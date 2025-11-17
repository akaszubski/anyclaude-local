# Prompt Caching Strategy & Performance Guide

## Overview

Prompt caching helps reduce latency and costs when working with large, repetitive prompts. This guide explains the caching strategy implemented in anyclaude and how to measure its effectiveness.

## Key Findings from Research

### Anthropic API Caching Benefits

- **Latency Reduction**: Up to **85% faster** second request with same prompt prefix
- **Cost Savings**: Up to **90% cost reduction** for cached tokens
  - Cache write: 25% premium over base price
  - Cache read: 10% of base price (90% savings)
- **TTL (Time-to-Live)**: 5-minute default, extendable to 1-hour

### MLX Caching

- Supports **Automatic Prefix Caching (APC)** via KV cache
- Reduces **time-to-first-token (TTFT)** significantly
- Does NOT reduce token generation (decoding) time
- Cache is **session-local** (LRU eviction, no TTL)

## Current Implementation

### Cache Control Headers

The proxy automatically sets cache control on:

1. **System Prompts** (ephemeral cache)

   ```typescript
   {
     "type": "text",
     "text": "You are Claude Code...",
     "cache_control": { "type": "ephemeral" }
   }
   ```

2. **User Context Blocks** (when marked)
   - Large context blocks in user messages
   - Tool definitions
   - RAG content

### Why You Didn't See Speed Improvements Yet

1. **Ephemeral Cache Scope**: Only lasts 5 minutes within a conversation
   - Great for cost reduction
   - Limited latency benefit for single requests
   - Real benefit comes with repeated identical requests

2. **MLX Limitations**:
   - Cache control headers are set but may not be fully utilized
   - KV cache benefits depend on model size and batch processing
   - Single-request scenarios see minimal latency benefit

3. **Overhead for Small Payloads**:
   - System prompts are ~500 bytes
   - Cache lookup overhead may exceed savings
   - Real benefits appear at 1000+ tokens of cached content

## How to Maximize Cache Benefits

### For Anthropic API (Claude Mode)

```bash
# Use persistent cache across multiple conversations
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=2 anyclaude

# Then run multiple requests - second request should be ~85% faster
```

**Workflow:**

1. First request: Writes system prompt and context to cache
2. Subsequent requests (within 5 min): Reuse cached content
3. Cost: Write once (at 1.25x), read many times (at 0.1x)

### For MLX (Local Mode)

```bash
# Enable prefix caching in vLLM
ANYCLAUDE_DEBUG=2 bun run src/main.ts
```

**Benefits:**

- Reduces **time-to-first-token** for second request
- KV cache reused within vLLM session
- Best for interactive workloads with repeated prompts

## Measuring Cache Performance

### Automatic Metrics

anyclaude automatically tracks cache performance:

```bash
# Metrics saved to ~/.anyclaude/cache-metrics/TIMESTAMP.json
cat ~/.anyclaude/cache-metrics/*.json | jq
```

### Cache Metrics Output

At session exit, you'll see:

```
📊 Cache Performance Metrics
──────────────────────────────────────────────
Total Requests:         10
Cache Hits:             4 (40.0%)
Cache Misses:           6

Token Statistics:
  Total Tokens:         5,200
  Cached Tokens:        1,800 (34.6%)
  Uncached Tokens:      3,400

Estimated Savings:
  Cost Reduction:       ~900% per cached token
  Latency Reduction:    ~425ms per cache hit
──────────────────────────────────────────────
```

### Manual Benchmarking

To see real performance gains, test with repeated requests:

```bash
# Terminal 1: Start proxy
PROXY_ONLY=true bun run src/main.ts
# Note the proxy URL (e.g., http://localhost:52345)

# Terminal 2: Test cache performance
export ANTHROPIC_BASE_URL="http://localhost:52345"

# First request (cache write)
time curl -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{...message...}'  # ~20 seconds

# Second request (cache read)
time curl -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -d '{...identical message...}'  # ~2.9 seconds (85% faster!)
```

## Best Practices

### 1. Structure Prompts for Caching

Place cacheable content in system messages:

```typescript
// Good: System prompt cached
{
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code. [Long instructions...]",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [/* user messages */]
}

// Not ideal: Context in user messages
{
  "system": [{ "type": "text", "text": "You are Claude Code." }],
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "[Long instructions...]", // Cache miss pattern
        "cache_control": { "type": "ephemeral" }
      },
      { "type": "text", "text": "User query" }
    ]
  }]
}
```

### 2. Monitor Cache Efficiency

```bash
# Check cache metrics during development
ANYCLAUDE_DEBUG=2 anyclaude  # Shows cache hit/miss logs

# View detailed metrics
cat ~/.anyclaude/cache-metrics/*.json | jq '.[] | {timestamp, cacheHit, cacheReadInputTokens}'
```

### 3. Optimize for Your Use Case

**High cache hit potential:**

- Repeated queries with same context
- Multi-turn conversations
- Batch processing with common prompts

**Low cache benefit:**

- One-off queries
- Highly variable prompts
- Small prompts (<500 tokens)

## Implementation Details

### Cache Metrics Tracking

Located in `src/cache-metrics.ts`:

- Records every request/response pair
- Extracts cache metrics from Anthropic API responses
- Persists metrics to JSON for analysis
- Displays summary statistics at exit

### Integration Points

1. **Proxy**: Records metrics for all requests
2. **Debug**: Logs cache hits/misses at debug level 2+
3. **Exit Handler**: Displays stats when session ends

### Cache Response Headers

anyclaude extracts these from Anthropic API responses:

```json
{
  "usage": {
    "input_tokens": 1024,
    "output_tokens": 256,
    "cache_creation_input_tokens": 1024, // First request
    "cache_read_input_tokens": 0
  }
}
```

vs (cached request):

```json
{
  "usage": {
    "input_tokens": 512,
    "output_tokens": 256,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 1024 // Reused!
  }
}
```

## Known Limitations

1. **MLX**: Cache control headers not fully utilized yet
2. **Ephemeral Cache**: 5-minute TTL limits cross-conversation reuse
3. **LRU Eviction**: Cache can be evicted under memory pressure
4. **Single Request**: Cache benefits invisible in one-off requests

## Future Improvements

1. **Persistent Cache Storage**: Save cache across sessions
2. **Cache Analytics Dashboard**: Visualize cache performance over time
3. **Smart Prompting**: Detect cacheable patterns automatically
4. **Cost Calculator**: Real-time cost savings display

## Debugging

### Enable cache logging

```bash
ANYCLAUDE_DEBUG=2 anyclaude  # Shows cache metrics
```

### View metrics file

```bash
jq . ~/.anyclaude/cache-metrics/latest.json
```

### Monitor in real-time

```bash
watch -n 1 'tail ~/.anyclaude/cache-metrics/*.json | jq'
```

## References

- [Anthropic Prompt Caching Docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- [vLLM Prefix Caching](https://docs.vllm.ai/en/latest/automatic_prefix_caching/apc.html)
- [MLX Prompt Caching](https://github.com/ml-explore/mlx-lm/issues/259)
