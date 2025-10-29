# vLLM-MLX Cheat Sheet

## Quick Commands

```bash
# Start using vLLM-MLX
anyclaude --mode=vllm-mlx

# With debug logging
ANYCLAUDE_DEBUG=1 anyclaude --mode=vllm-mlx

# With telemetry (capture real usage)
ANYCLAUDE_TELEMETRY=1 anyclaude --mode=vllm-mlx

# Proxy only (for testing)
PROXY_ONLY=true anyclaude --mode=vllm-mlx
```

## Check Server Health

```bash
# Is it running?
curl http://localhost:8081/health | jq '.'

# Watch cache stats
watch -n 1 'curl -s http://localhost:8081/health | jq .cache'

# List models
curl http://localhost:8081/v1/models | jq '.'
```

## Testing

```bash
# Real integration test (11 scenarios, measures latency)
./scripts/test/test-vllm-mlx-real.sh

# Check cache is working
./scripts/test/test-vllm-mlx-cache.sh

# Check tool calling works
./scripts/test/test-vllm-mlx-tools.sh
```

## View Telemetry Data

```bash
# Find session files
ls ~/.anyclaude/telemetry/

# View raw metrics (JSONL format)
cat ~/.anyclaude/telemetry/session-*.jsonl | jq '.'

# View summary
cat ~/.anyclaude/telemetry/session-*-summary.json | jq '.'

# Extract slow requests
grep '"latency_ms":[2-9][0-9][0-9][0-9]' ~/.anyclaude/telemetry/*.jsonl

# Cache hit rate
grep '"cache_hit":true' ~/.anyclaude/telemetry/*.jsonl | wc -l
```

## Configuration

### `.anyclauderc.json` (Minimal)

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "model": "/path/to/mlx/model"
    }
  }
}
```

### Full Config

```json
{
  "backend": "vllm-mlx",
  "debug": {"level": 1},
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/Users/akaszubski/ai-tools/.../Qwen3-Coder-30B"
    },
    "lmstudio": {
      "enabled": true,
      "baseUrl": "http://localhost:1234/v1"
    }
  }
}
```

## Documentation Map

| Need | Document |
|------|----------|
| **Overview** | `IMPLEMENTATION_SUMMARY.md` |
| **Quick start** | `VLLM_MLX_QUICK_START.md` |
| **Testing** | `TESTING_VLLM_MLX.md` |
| **Telemetry** | `TELEMETRY_GUIDE.md` |
| **Technical details** | `VLLM_MLX_FIXES.md` |
| **Full guide** | `VLLM_MLX_IMPROVEMENTS.md` |
| **This sheet** | `VLLM_MLX_CHEAT_SHEET.md` |

## Performance

```
Uncached request:  2500-3500ms
Cached request:    20-100ms
Speedup:           50-1425x
Typical hit rate:  30-50%
```

## What's Fixed

| Issue | Status | Impact |
|-------|--------|--------|
| Timeouts | ✅ Fixed | Zero timeouts |
| No cache | ✅ Fixed | 1425x speedup on hits |
| Tool calling | ✅ Fixed | Works properly |

## Environment Variables

```bash
# Telemetry (default: 1)
ANYCLAUDE_TELEMETRY=1

# Debug level (0=none, 1=basic, 2=verbose, 3=trace)
ANYCLAUDE_DEBUG=1

# Mode selection
ANYCLAUDE_MODE=vllm-mlx

# Server URLs (if not in config)
VLLM_MLX_URL=http://localhost:8081/v1
VLLM_MLX_MODEL=current-model

# Proxy only (no Claude Code)
PROXY_ONLY=true
```

## Troubleshooting

### Timeout Error
```bash
# Check server
curl http://localhost:8081/health

# Restart
pkill -f vllm-mlx
sleep 2
PROXY_ONLY=true anyclaude --mode=vllm-mlx
```

### Cache Not Working (hit rate = 0%)
```bash
# Run test
./scripts/test/test-vllm-mlx-real.sh

# Should show 2nd+ identical requests much faster
```

### Tool Calling Failing
```bash
# Run test
./scripts/test/test-vllm-mlx-tools.sh

# Check model supports tools (Qwen3-Coder does)
# Others may need prompt engineering
```

### Model Not Found
```bash
# Check path exists
ls -la /path/to/mlx/model/

# Update .anyclauderc.json with correct path
cat .anyclauderc.json | jq '.backends."vllm-mlx".model'
```

## Monitoring

### One-time health check
```bash
curl http://localhost:8081/health | jq '.cache'
```

### Live monitoring
```bash
watch -n 1 'curl -s http://localhost:8081/health | jq .cache'
```

### Expected healthy state
```json
{
  "hits": 10,
  "misses": 20,
  "total_requests": 30,
  "hit_rate": "33.3%",
  "cached_items": 10
}
```

## Analytics

### Average latency
```bash
jq '.latency_ms' ~/.anyclaude/telemetry/*.jsonl | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count "ms"}'
```

### Cache hit rate
```bash
python3 << 'EOF'
import json, glob
metrics = [json.loads(line) for f in glob.glob("~/.anyclaude/telemetry/*.jsonl")
           for line in open(f)]
hits = sum(1 for m in metrics if m.get('cache_hit'))
rate = (hits / len(metrics) * 100) if metrics else 0
print(f"Cache hit rate: {rate:.1f}%")
EOF
```

### Slowest requests
```bash
jq 'select(.latency_ms > 2500)' ~/.anyclaude/telemetry/*.jsonl | \
  jq -s 'sort_by(.latency_ms) | reverse | .[0:5]'
```

## Success Criteria ✅

- [ ] No timeouts in 1+ hours of use
- [ ] Repeated requests complete in < 100ms
- [ ] Tool calls parse correctly
- [ ] Cache hit rate > 20%
- [ ] Health endpoint shows > 0 hits

## Next Steps

1. **Use it** - Run `anyclaude --mode=vllm-mlx` for your work
2. **Collect data** - Use for 1-2 weeks
3. **Analyze** - Run analytics commands above
4. **Identify** - What's slow? What patterns exist?
5. **Optimize** - Make improvements based on data

---

**Need help?** Check the documentation map above.

**Found a bug?** Open an issue with telemetry data if possible.

**Want to contribute?** Check `IMPLEMENTATION_SUMMARY.md` for future improvements.
