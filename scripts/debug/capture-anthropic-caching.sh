#!/bin/bash
# Capture Anthropic API traffic to reverse engineer prompt caching behavior

set -e

echo "🔍 Capturing Anthropic API Prompt Caching Behavior"
echo "=================================================="
echo ""

# Setup
TRACE_DIR="$HOME/.anyclaude/traces/claude"
ANALYSIS_DIR="$HOME/.anyclaude/analysis"
mkdir -p "$TRACE_DIR" "$ANALYSIS_DIR"

echo "📁 Trace directory: $TRACE_DIR"
echo "📁 Analysis output: $ANALYSIS_DIR"
echo ""

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY not set"
    echo "   Either set it or ensure you have an active 'claude' auth session"
    echo ""
fi

echo "Instructions:"
echo "1. anyclaude will start in Claude mode"
echo "2. Make a request (e.g., 'What is 2+2?')"
echo "3. Make the SAME request again (to test caching)"
echo "4. Make a DIFFERENT request (to test cache miss)"
echo "5. Exit Claude Code with /exit"
echo ""
echo "Press Enter to start..."
read

# Clean old traces to avoid confusion
echo "🧹 Cleaning old traces..."
rm -f "$TRACE_DIR"/trace-*.json

echo ""
echo "🚀 Starting anyclaude in Claude mode..."
echo "   (Trace logging is auto-enabled at level 3)"
echo ""

# Run anyclaude in Claude mode (trace logging auto-enabled)
cd "$(dirname "$0")/../.."
ANYCLAUDE_DEBUG=3 bun run dist/main.js --mode=claude

echo ""
echo "✅ Capture complete!"
echo ""

# Analyze captured traces
echo "📊 Analyzing captured traces..."
echo ""

TRACES=($(ls -t "$TRACE_DIR"/trace-*.json 2>/dev/null))

if [ ${#TRACES[@]} -eq 0 ]; then
    echo "❌ No traces captured. Did you make any requests?"
    exit 1
fi

echo "Found ${#TRACES[@]} trace file(s):"
for trace in "${TRACES[@]}"; do
    echo "  - $(basename "$trace")"
done
echo ""

# Extract cache_control patterns from first trace
echo "🔬 Analyzing cache_control usage..."
echo ""

FIRST_TRACE="${TRACES[0]}"

echo "=== Request 1 (First trace) ===" > "$ANALYSIS_DIR/cache-analysis.txt"
echo "" >> "$ANALYSIS_DIR/cache-analysis.txt"

# Extract system prompt cache_control
echo "System Prompt Cache Control:" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
jq -r '.request.body.system[]? | select(.cache_control) | {text: (.text | .[0:100] + "..."), cache_control}' "$FIRST_TRACE" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

# Extract tools cache_control
echo "Tools Cache Control:" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
jq -r '.request.body.tools[]? | select(.cache_control) | {name, cache_control}' "$FIRST_TRACE" | head -3 | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

# Extract cache metrics from response
echo "Response Cache Metrics:" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
jq -r '.response.body.usage | {input_tokens, cache_creation_input_tokens, cache_read_input_tokens}' "$FIRST_TRACE" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

# If we have multiple traces, analyze caching behavior
if [ ${#TRACES[@]} -ge 2 ]; then
    echo "=== Request 2 (Second trace - should show cache hit) ===" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
    echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

    SECOND_TRACE="${TRACES[1]}"

    echo "Cache Metrics:" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
    jq -r '.response.body.usage | {input_tokens, cache_creation_input_tokens, cache_read_input_tokens}' "$SECOND_TRACE" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"

    # Calculate cache hit percentage
    CACHE_READ=$(jq -r '.response.body.usage.cache_read_input_tokens // 0' "$SECOND_TRACE")
    INPUT_TOKENS=$(jq -r '.response.body.usage.input_tokens // 0' "$SECOND_TRACE")

    if [ "$INPUT_TOKENS" -gt 0 ]; then
        CACHE_PERCENT=$(echo "scale=1; $CACHE_READ * 100 / $INPUT_TOKENS" | bc)
        echo "" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
        echo "Cache Hit Rate: ${CACHE_PERCENT}% ($CACHE_READ / $INPUT_TOKENS tokens)" | tee -a "$ANALYSIS_DIR/cache-analysis.txt"
    fi
fi

echo ""
echo "📄 Full analysis saved to: $ANALYSIS_DIR/cache-analysis.txt"
echo ""

# Create implementation template
echo "🔧 Generating implementation template..."

cat > "$ANALYSIS_DIR/vllm-mlx-cache-implementation.md" << 'TEMPLATE'
# vLLM-MLX Cache Implementation (Based on Anthropic API Analysis)

## Observed Anthropic Behavior

### Request Format

Claude Code sends `cache_control: { type: "ephemeral" }` on:
- Last system prompt block
- Last tool in tools array (marks all tools for caching)

### Response Format

Anthropic returns cache metrics in usage:
```json
{
  "usage": {
    "input_tokens": 18540,
    "output_tokens": 256,
    "cache_creation_input_tokens": 18490,  // First request
    "cache_read_input_tokens": 0
  }
}
```

On cache hit:
```json
{
  "usage": {
    "input_tokens": 50,  // Only new user input!
    "output_tokens": 256,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 18490  // Retrieved from cache
  }
}
```

## Implementation Plan

### 1. Detect Cache Markers in Proxy

File: `src/anthropic-proxy.ts`

```typescript
function extractCacheMarkers(body: AnthropicMessagesRequest) {
  const markers = {
    systemCacheable: false,
    toolsCacheable: false
  };

  // Check if last system block has cache_control
  if (Array.isArray(body.system)) {
    const lastBlock = body.system[body.system.length - 1];
    if (lastBlock?.cache_control?.type === 'ephemeral') {
      markers.systemCacheable = true;
    }
  }

  // Check if any tool has cache_control (Anthropic marks last tool)
  if (body.tools?.some(t => t.cache_control?.type === 'ephemeral')) {
    markers.toolsCacheable = true;
  }

  return markers;
}
```

### 2. Pass to Backend in Custom Header

```typescript
// Add to request sent to vllm-mlx
const headers = {
  'X-Cache-Control-System': markers.systemCacheable ? 'ephemeral' : 'none',
  'X-Cache-Control-Tools': markers.toolsCacheable ? 'ephemeral' : 'none'
};
```

### 3. Implement in vLLM-MLX Server

File: `scripts/vllm-mlx-server.py` (or new version)

```python
async def handle_chat_completion(request: Request):
    body = await request.json()

    # Read cache control from headers
    system_cache = request.headers.get('X-Cache-Control-System') == 'ephemeral'
    tools_cache = request.headers.get('X-Cache-Control-Tools') == 'ephemeral'

    # Build cache key from cacheable components
    cache_key_parts = []

    if system_cache:
        system_msg = next((m for m in body['messages'] if m['role'] == 'system'), None)
        if system_msg:
            cache_key_parts.append(('system', system_msg['content']))

    if tools_cache and body.get('tools'):
        cache_key_parts.append(('tools', json.dumps(body['tools'], sort_keys=True)))

    # Generate cache key
    if cache_key_parts:
        cache_hash = hashlib.sha256(
            json.dumps(cache_key_parts, sort_keys=True).encode()
        ).hexdigest()
        kv_cache_path = Path(KV_CACHE_DIR) / f"{cache_hash}.npz"
    else:
        kv_cache_path = None

    # Check for cache hit
    if kv_cache_path and kv_cache_path.exists():
        logger.info(f"✓ KV Cache HIT: {cache_hash[:8]}")
        kv_cache = load_kv_cache(kv_cache_path)
        cache_read_tokens = estimate_cached_tokens(cache_key_parts)
        cache_creation_tokens = 0
    else:
        kv_cache = None
        cache_read_tokens = 0
        cache_creation_tokens = estimate_cached_tokens(cache_key_parts) if cache_key_parts else 0

    # Generate response with KV cache
    response, new_kv_cache = await generate_with_mlx(
        messages=body['messages'],
        tools=body.get('tools'),
        kv_cache=kv_cache,
        ...
    )

    # Save cache if miss
    if kv_cache_path and not kv_cache:
        save_kv_cache(new_kv_cache, kv_cache_path)

    # Return with cache metrics (Anthropic-compatible format)
    return {
        "usage": {
            "input_tokens": total_input_tokens,
            "output_tokens": len(response_tokens),
            "cache_creation_input_tokens": cache_creation_tokens,
            "cache_read_input_tokens": cache_read_tokens
        },
        ...
    }
```

## Testing

1. Run test with cache markers
2. Verify first request shows cache_creation_input_tokens > 0
3. Verify second request shows cache_read_input_tokens > 0
4. Verify speed improvement (30x expected)

TEMPLATE

echo "✅ Implementation template created: $ANALYSIS_DIR/vllm-mlx-cache-implementation.md"
echo ""

echo "🎯 Next Steps:"
echo ""
echo "1. Review captured traces:"
echo "   cat $TRACE_DIR/trace-*.json | jq ."
echo ""
echo "2. Review analysis:"
echo "   cat $ANALYSIS_DIR/cache-analysis.txt"
echo ""
echo "3. Review implementation template:"
echo "   cat $ANALYSIS_DIR/vllm-mlx-cache-implementation.md"
echo ""
echo "4. Implement cache control in vllm-mlx server"
echo ""
