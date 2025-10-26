# Testing Hybrid Mode Performance

## Quick Start (5 minutes)

### 1. Run the KV Cache Performance Test
```bash
# This is the MOST IMPORTANT test - proves cache hit performance
./scripts/test/test-kv-cache-hits.sh
```

**What to look for:**
- Query 1: ~30 seconds (cold, system prompt computed)
- Query 2-5: <1 second each (KV cache hit!)
- Speedup ratio: 30x-100x

**Success = Query 2 is WAY faster than Query 1**

### 2. Run the Hybrid Mode Status Check
```bash
# Verify both servers are operational
./scripts/test/test-hybrid-mode-performance.sh
```

**What to look for:**
- ✅ MLX-LM server responding
- ✅ LMStudio server responding
- ✅ Mode detection working
- ✅ Both API endpoints functional

## Real-World Performance Test (15 minutes)

### Setup 3 Terminals

**Terminal 1: MLX-LM Server**
```bash
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081
```

Wait for: `Starting httpd at 127.0.0.1 on port 8081...`

**Terminal 2: AnyClaude in MLX-LM Mode**
```bash
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
ANYCLAUDE_DEBUG=1 \
npm run dev 2>&1 | tee /tmp/test-mlx.log
```

**Terminal 3: Claude Code**
```bash
anyclaude
```

### Test Sequence in Claude Code

**Query 1: Initial Request** (will be slow)
```
"Explain what KV cache is in AI models"
```
⏱️ **Expected: ~30 seconds**
- System prompt (18,490 tokens) is being computed
- This is the expensive part that only happens once!

**Query 2: First Follow-up** (should be lightning fast!)
```
"What are 3 benefits of KV cache?"
```
⏱️ **Expected: <1 second** ✨
- System prompt loaded from cache
- Only new query tokens processed
- This proves KV cache is working!

**Query 3: Another Follow-up** (should also be fast)
```
"How does this apply to Claude Code?"
```
⏱️ **Expected: <1 second** ✨
- Still cached!

**Query 4: Switch to LMStudio for Tools** (needs file editing)
```bash
# Stop anyclaude in Terminal 2, restart with:
LMSTUDIO_URL="http://localhost:1234/v1" \
ANYCLAUDE_MODE=lmstudio \
npm run dev
```

Then ask Claude Code:
```
"Create a new file called test.txt with 'Hello World'"
```
⏱️ **Expected: ~30 seconds**
- No tools in MLX-LM, so we switched modes
- File creation should work now

**Query 5: Switch Back to MLX-LM** (return to analysis)
```bash
# Stop anyclaude, restart with mlx-lm mode again
ANYCLAUDE_MODE=mlx-lm npm run dev
```

Then ask:
```
"Was that successful?"
```
⏱️ **Expected: <1 second** ✨
- New context, but system prompt gets cached again
- Follow-ups would be instant

## Success Criteria Checklist

### ✅ Basic Functionality
- [ ] MLX-LM server responds to API requests
- [ ] LMStudio server responds to API requests
- [ ] AnyClaude builds without errors
- [ ] Mode detection works (env vars recognized)

### ✅ Performance (The Key Test)
- [ ] **First MLX-LM query: ~30 seconds**
- [ ] **Second MLX-LM query: <1 second (100x faster!)**
- [ ] **Third MLX-LM query: <1 second**
- [ ] **Ratio: At least 30x speedup on follow-ups**

### ✅ Features
- [ ] MLX-LM mode: No tool errors (analysis-only expected)
- [ ] LMStudio mode: Tools working (file creation, git, etc)
- [ ] Mode switching: Works without restart (just env var change)

### ✅ User Experience
- [ ] Analysis feels responsive (multiple queries fast)
- [ ] Editing mode has full functionality
- [ ] Users understand when to use each mode

## Interpretation Guide

### If seeing 30s, 30s, 30s (not cached)
```
Problem: KV cache not working
Possible causes:
- MLX-LM version doesn't support native KV cache
- System prompt contains characters causing JSON errors
- Cache timeout (1 hour session limit)

Fix:
- Check MLX-LM logs for "Invalid control character"
- Verify system prompt escaping in src/convert-anthropic-messages.ts
```

### If seeing 30s, 1s, 1s (EXCELLENT!)
```
✅ This is SUCCESS - KV cache working perfectly!
- First query: System prompt computed and cached
- Follow-ups: Instant cache reuse
- This is the performance improvement you were after
```

### If seeing Connection Refused
```
Problem: Servers not running
Fix:
- Check MLX-LM: curl http://localhost:8081/v1/models
- Check LMStudio: curl http://localhost:1234/v1/models
- Restart servers if needed
```

## Performance Metrics to Track

### Track These Numbers Across Runs

```bash
# Create a benchmark file
cat > /tmp/performance-benchmark.csv << 'EOF'
Date,Mode,Query#,ResponseTime_ms,CachedYesNo,Notes
2025-10-26,mlx-lm,1,29500,No,Initial system prompt compute
2025-10-26,mlx-lm,2,300,Yes,KV cache hit!
2025-10-26,mlx-lm,3,280,Yes,Still cached
2025-10-26,lmstudio,1,31000,No,Full features test
EOF
```

Monitor:
- Average response time (should decrease after query 1)
- Cache hit rate (should be 100% after initial query)
- Mode switching latency (should be instant)

## What Success Looks Like

### Performance Victory 🎯
```
Analysis Session (MLX-LM):
- Review code: 30s (first request, cache building)
- What about errors?: 0.3s (CACHED!)
- List bugs: 0.3s (CACHED!)
Total: ~31 seconds for 3 intelligent queries

Without KV cache (normal LMStudio):
- Review code: 30s
- What about errors?: 30s
- List bugs: 30s
Total: ~90 seconds

Improvement: 3x faster session, 100x faster per query after first
```

### Hybrid Advantage ✨
```
Code Review → Bug Fix → Verification Workflow:

Step 1 - Analyze (MLX-LM, fast):
  "Review my code" → 30s
  "What are the issues?" → 0.3s (CACHED!)
  "Prioritize them" → 0.3s (CACHED!)
  Subtotal: ~31 seconds

Step 2 - Edit (LMStudio, tools available):
  Switch mode: instant
  "Fix the first bug" → 30s (has file write tool)
  "Commit it" → 30s (has git tool)
  Subtotal: ~60 seconds

Step 3 - Verify (MLX-LM, fast again):
  Switch mode: instant
  "Is the fix correct?" → 30s (new context, fresh cache)
  "Any edge cases?" → 0.3s (CACHED!)
  Subtotal: ~31 seconds

Total time: ~122 seconds
Without hybrid: ~180+ seconds (all requests take 30s)
Benefit: 1.5x faster session + full tool support!
```

## Troubleshooting

### Q: "First query is taking 60+ seconds"
**A:** Model is still loading. Wait for prompt processing to complete.

### Q: "Follow-ups are still taking 30 seconds"
**A:** KV cache not enabled. Check:
1. MLX-LM version supports native KV cache
2. System prompt not causing JSON errors
3. Restart MLX-LM server

### Q: "Getting JSON decode errors in logs"
**A:** System prompt has special characters. This is the issue you discovered earlier. The anyclaude message converter needs to properly escape system prompts with special characters.

### Q: "Mode switching doesn't work"
**A:** Make sure to:
1. Stop the current anyclaude process
2. Change ANYCLAUDE_MODE env var
3. Restart anyclaude
4. Don't restart servers

## Next Steps

1. **Run the cache hit test**: `./scripts/test/test-kv-cache-hits.sh`
2. **Verify performance**: Check that follow-ups are <1 second
3. **Test real workflow**: Use Claude Code with both modes
4. **Measure impact**: Time your typical work sessions before/after
5. **Document results**: Share performance metrics

## Support

If performance isn't matching expectations:
1. Check `/tmp/test-mlx.log` for timing data
2. Look for "Prompt processing progress" in MLX-LM logs
3. Run diagnostic: `curl -s http://localhost:8081/v1/models | jq`
4. Review PRODUCTION-HYBRID-SETUP.md troubleshooting section
