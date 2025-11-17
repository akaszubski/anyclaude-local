#!/bin/bash
# Analyze captured Anthropic traces to understand cache_control behavior

TRACE_DIR="$HOME/.anyclaude/traces/claude"

if [ ! -d "$TRACE_DIR" ]; then
    echo "❌ No traces found. Run capture-anthropic-caching.sh first"
    exit 1
fi

TRACES=($(ls -t "$TRACE_DIR"/*.json 2>/dev/null))

if [ ${#TRACES[@]} -eq 0 ]; then
    echo "❌ No trace files found in $TRACE_DIR"
    exit 1
fi

echo "🔍 Analyzing ${#TRACES[@]} trace file(s)..."
echo ""

for i in "${!TRACES[@]}"; do
    TRACE="${TRACES[$i]}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Request #$((i+1)): $(basename "$TRACE")"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Extract request info
    echo "📤 REQUEST:"
    echo ""

    # System prompt with cache_control
    echo "System Prompt:"
    jq -r '.request.body.system[] | select(.cache_control) | "  ✓ cache_control: \(.cache_control.type)\n  First 100 chars: \(.text[0:100])..."' "$TRACE" 2>/dev/null || echo "  (No cache_control on system)"

    echo ""

    # Tools with cache_control
    echo "Tools with cache_control:"
    TOOLS_WITH_CACHE=$(jq -r '[.request.body.tools[]? | select(.cache_control)] | length' "$TRACE")
    TOTAL_TOOLS=$(jq -r '[.request.body.tools[]?] | length' "$TRACE")
    echo "  $TOOLS_WITH_CACHE out of $TOTAL_TOOLS tools marked for caching"

    if [ "$TOOLS_WITH_CACHE" -gt 0 ]; then
        jq -r '.request.body.tools[] | select(.cache_control) | "  - \(.name): cache_control = \(.cache_control.type)"' "$TRACE" | head -3
        if [ "$TOOLS_WITH_CACHE" -gt 3 ]; then
            echo "  ... and $((TOOLS_WITH_CACHE - 3)) more"
        fi
    fi

    echo ""
    echo ""

    # Extract response cache metrics
    echo "📥 RESPONSE:"
    echo ""

    # Check if response exists
    HAS_RESPONSE=$(jq -r '.response != null' "$TRACE")

    if [ "$HAS_RESPONSE" = "true" ]; then
        # Usage metrics
        INPUT_TOKENS=$(jq -r '.response.body.usage.input_tokens // 0' "$TRACE")
        CACHE_CREATION=$(jq -r '.response.body.usage.cache_creation_input_tokens // 0' "$TRACE")
        CACHE_READ=$(jq -r '.response.body.usage.cache_read_input_tokens // 0' "$TRACE")
        OUTPUT_TOKENS=$(jq -r '.response.body.usage.output_tokens // 0' "$TRACE")

        echo "Token Usage:"
        echo "  Input tokens:         $INPUT_TOKENS"
        echo "  Output tokens:        $OUTPUT_TOKENS"
        echo "  Cache creation:       $CACHE_CREATION tokens"
        echo "  Cache read:           $CACHE_READ tokens"

        # Calculate cache efficiency
        if [ "$CACHE_READ" -gt 0 ]; then
            CACHE_PERCENT=$(echo "scale=1; $CACHE_READ * 100 / ($INPUT_TOKENS + $CACHE_READ)" | bc)
            echo ""
            echo "  ✅ CACHE HIT! ${CACHE_PERCENT}% of prompt cached"
            echo "     (Saved $CACHE_READ tokens from recomputation)"
        elif [ "$CACHE_CREATION" -gt 0 ]; then
            echo ""
            echo "  📝 CACHE WRITE (First request)"
            echo "     (Created cache for $CACHE_CREATION tokens)"
        else
            echo ""
            echo "  ⚠️  No caching (cache_control not used?)"
        fi
    else
        echo "  ⚠️  No response captured (error?)"
    fi

    echo ""
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 KEY FINDINGS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summarize caching pattern
FIRST_TRACE="${TRACES[0]}"

# Where does Anthropic put cache_control?
SYSTEM_HAS_CACHE=$(jq -r '[.request.body.system[]? | select(.cache_control)] | length > 0' "$FIRST_TRACE")
TOOLS_HAVE_CACHE=$(jq -r '[.request.body.tools[]? | select(.cache_control)] | length > 0' "$FIRST_TRACE")

echo "Cache Control Placement:"
if [ "$SYSTEM_HAS_CACHE" = "true" ]; then
    # Which system block?
    SYSTEM_BLOCKS=$(jq -r '.request.body.system | length' "$FIRST_TRACE")
    LAST_BLOCK_CACHED=$(jq -r '.request.body.system[-1].cache_control != null' "$FIRST_TRACE")

    if [ "$LAST_BLOCK_CACHED" = "true" ]; then
        echo "  ✓ System: cache_control on LAST block (block #$SYSTEM_BLOCKS)"
    else
        CACHED_BLOCK=$(jq -r '[.request.body.system[] | select(.cache_control)] | .[0] | .text[0:50]' "$FIRST_TRACE")
        echo "  ✓ System: cache_control on block containing: $CACHED_BLOCK..."
    fi
fi

if [ "$TOOLS_HAVE_CACHE" = "true" ]; then
    TOTAL_TOOLS=$(jq -r '[.request.body.tools[]] | length' "$FIRST_TRACE")
    LAST_TOOL_CACHED=$(jq -r '.request.body.tools[-1].cache_control != null' "$FIRST_TRACE")

    if [ "$LAST_TOOL_CACHED" = "true" ]; then
        LAST_TOOL_NAME=$(jq -r '.request.body.tools[-1].name' "$FIRST_TRACE")
        echo "  ✓ Tools: cache_control on LAST tool (#$TOTAL_TOOLS: $LAST_TOOL_NAME)"
        echo "           (This marks ALL preceding tools for caching)"
    else
        CACHED_TOOLS=$(jq -r '[.request.body.tools[] | select(.cache_control) | .name] | join(", ")' "$FIRST_TRACE")
        echo "  ✓ Tools: cache_control on: $CACHED_TOOLS"
    fi
fi

echo ""
echo "Cache Performance:"

# Calculate overall cache hit rate
TOTAL_CACHE_READ=0
TOTAL_INPUT=0

for TRACE in "${TRACES[@]}"; do
    CACHE_READ=$(jq -r '.response.body.usage.cache_read_input_tokens // 0' "$TRACE")
    INPUT=$(jq -r '.response.body.usage.input_tokens // 0' "$TRACE")
    TOTAL_CACHE_READ=$((TOTAL_CACHE_READ + CACHE_READ))
    TOTAL_INPUT=$((TOTAL_INPUT + INPUT + CACHE_READ))
done

if [ $TOTAL_INPUT -gt 0 ]; then
    OVERALL_CACHE_PERCENT=$(echo "scale=1; $TOTAL_CACHE_READ * 100 / $TOTAL_INPUT" | bc)
    echo "  Overall cache hit rate: ${OVERALL_CACHE_PERCENT}%"
    echo "  Total cached tokens: $TOTAL_CACHE_READ"
    echo "  Total input tokens: $TOTAL_INPUT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Implementation Notes:"
echo ""
echo "1. Anthropic places cache_control on LAST system block"
echo "2. Anthropic places cache_control on LAST tool (caches all tools)"
echo "3. First request: cache_creation_input_tokens > 0"
echo "4. Follow-up: cache_read_input_tokens > 0 (cache hit!)"
echo "5. input_tokens = new tokens only (excludes cached)"
echo ""
echo "Next: Implement this behavior in vllm-mlx backend"
echo ""
