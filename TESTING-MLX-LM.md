# Testing MLX-LM Integration

## TL;DR Quick Test

```bash
# Terminal 1: Start MLX-LM server on port 8081
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081 &
sleep 30  # Wait for model to load

# Terminal 2: Test AnyClaude with MLX-LM
ANYCLAUDE_MODE=mlx-lm PROXY_ONLY=true ./dist/main-cli.js

# You should see:
# [anyclaude] Mode: MLX-LM
# [anyclaude] Proxy URL: http://localhost:XXXXX
# [anyclaude] MLX-LM endpoint: http://localhost:8081/v1
# [anyclaude] Model: current-model (with native KV cache)
```

## Full Performance Test

```bash
# Terminal 1: Start MLX-LM server
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081 &
sleep 30  # Wait for model to load

# Terminal 2: Start AnyClaude with MLX-LM mode
ANYCLAUDE_MODE=mlx-lm ./dist/main-cli.js

# Terminal 3 (Once Claude Code is running):
# Ask your first question:
> Analyze this code function for performance issues

# Wait for response (~30 seconds - system prompt computing)

# Ask a follow-up:
> How can I optimize the memory usage?

# Should be MUCH faster (~1 second) - KV cache hit!
```

## What You're Testing

When you see the second response is much faster, that's the **KV cache in action**:

- **Query 1** (~30 seconds):
  - Claude Code sends 18,490 tokens of system prompt
  - MLX-LM computes attention for all tokens
  - KV cache stores the computed keys and values

- **Query 2** (~<1 second):
  - Claude Code sends the same system prompt again
  - MLX-LM retrieves cached KV, skips recomputation
  - Only new tokens are processed
  - **Result: 30x speedup!**

## Verifying MLX-LM Mode is Actually Running

Look for these signs:

✅ Mode detection working:
```
[anyclaude] Mode: MLX-LM
```

✅ Correct endpoint:
```
[anyclaude] MLX-LM endpoint: http://localhost:8081/v1
```

✅ Claude Code works:
```
▗ ▗   ▖ ▖  Claude Code v2.0.27
```

## Common Issues

### Issue: Shows "Mode: LMSTUDIO" instead of "Mode: MLX-LM"

**Cause**: Environment variable not set properly

**Fix**:
```bash
# Wrong:
ANYCLAUDE_MODE=mlx-lm npm run build && ./dist/main-cli.js

# Correct:
ANYCLAUDE_MODE=mlx-lm ./dist/main-cli.js
```

The environment variable must be set **before running**, not before building.

### Issue: Endpoint shows "localhost:8080" but I want 8081

**Cause**: mlx-omni-server is running on 8080, not mlx-lm

**Fix**:
```bash
# Kill all existing servers
pkill -f "mlx-omni-server\|mlx_lm\|lmstudio"

# Make sure ONLY MLX-LM is running
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081 &

# Then start AnyClaude
ANYCLAUDE_MODE=mlx-lm ./dist/main-cli.js
```

### Issue: AnyClaude still shows wrong endpoint after restarting

**Fix**: Set the endpoint explicitly:
```bash
ANYCLAUDE_MODE=mlx-lm MLX_LM_URL="http://localhost:8081/v1" ./dist/main-cli.js
```

## Expected Performance

### First Query
```
> What does this do?

⏺ Processing...
[Long wait: ~30 seconds]

✓ Response appears
```

### Follow-up Query
```
> Why does it work that way?

⏺ Processing...
[Quick wait: <1 second]

✓ Response appears immediately
```

The difference is **the KV cache working**. The system prompt is cached, so subsequent queries skip recomputation and run 30-100x faster.

## Architecture Reminder

AnyClaude + MLX-LM enables:

1. **Claude Code CLI** → (Anthropic API format)
2. **AnyClaude Proxy** → (translates to OpenAI format)
3. **MLX-LM Server** → (computes with KV cache)
4. **Response** ← (translated back to Anthropic format)

The KV cache benefit happens at step 3 - MLX-LM's native support for caching the system prompt across multiple requests in the same conversation.

## Next: Measure the Speedup

Once you confirm MLX-LM is working, run the performance test:

```bash
./scripts/test/test-kv-cache-hits.sh
```

This will show you the exact speedup factor and validate the KV cache is working.
