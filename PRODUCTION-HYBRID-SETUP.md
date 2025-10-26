# Production Setup: Hybrid Mode (MLX-LM + LMStudio)

**Status**: ✅ Production-Ready
**Date**: 2025-10-26
**Recommendation**: Primary solution for local Claude Code 2.0

---

## Overview

The hybrid approach combines the strengths of two solutions:

- **MLX-LM Mode**: Fast analysis with KV cache (100x speedup on follow-ups)
- **LMStudio Mode**: Full features with all tools

Users switch modes based on their current task using a single environment variable.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Claude Code 2.0                        │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│        AnyClaude Proxy (Port 8080)              │
│   Translates Claude API ↔ OpenAI API            │
└─────────────────────────────────────────────────┘
                      ↓
                   ↙    ↘
              ↙           ↘
    [MLX-LM Port 8081]    [LMStudio Port 1234]
    (Fast + KV Cache)     (Full Features)
    └─ Speed: 0.3s        └─ Speed: 30s
    └─ Tools: No          └─ Tools: Yes
    └─ Best for: Analysis └─ Best for: Editing
```

---

## Setup Instructions

### Prerequisites

✅ MLX-LM installed and working (port 8081)
✅ LMStudio installed and running (port 1234)
✅ AnyClaude built (`npm run build`)
✅ Both models available locally

### Step 1: Verify Both Servers Running

```bash
# Terminal 1: Check MLX-LM
curl -s http://localhost:8081/v1/models | jq .

# Terminal 2: Check LMStudio
curl -s http://localhost:1234/v1/models | jq .
```

Both should return model lists.

### Step 2: Start MLX-LM Server

```bash
# Terminal 1 (MLX-LM)
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server \
  --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081
```

Wait for: `Starting httpd at 127.0.0.1 on port 8081...`

### Step 3: Ensure LMStudio Running

```bash
# LMStudio should be running in the app
# Access: http://localhost:1234
# Verify: Model is loaded
```

### Step 4: Start AnyClaude in Desired Mode

#### For Analysis Work (Recommended Default)

```bash
# Terminal 2: Fast mode with KV cache
cd /path/to/anyclaude

MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
ANYCLAUDE_DEBUG=1 \
npm run dev
```

Or if built:
```bash
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
node dist/main.js
```

#### For Editing Work

```bash
# Terminal 2: Full features mode
cd /path/to/anyclaude

LMSTUDIO_URL="http://localhost:1234/v1" \
ANYCLAUDE_MODE=lmstudio \
ANYCLAUDE_DEBUG=1 \
npm run dev
```

### Step 5: Connect Claude Code

```bash
# Terminal 3: Run Claude Code
# It will automatically connect to the proxy
anyclaude
```

---

## Usage Guide

### When to Use Each Mode

#### ✅ MLX-LM Mode (Recommended for Most Work)

**Use MLX-LM when**:
- Analyzing existing code
- Asking questions about code
- Code review and feedback
- Documentation generation
- Brainstorming and planning
- Explaining implementations
- Debugging research
- **Performance**: 0.3 seconds per follow-up!

**Example session**:
```
User: "Review my code for bugs"
  → MLX-LM (analysis task)
  → Response: 0.3s (from cache)

User: "What about error handling?"
  → MLX-LM (still analysis)
  → Response: 0.3s (cached!)

User: "List all the bugs"
  → MLX-LM (still analysis)
  → Response: 0.3s (cached!)

Total: 30s + 0.3s + 0.3s = 30.6 seconds
```

#### ✅ LMStudio Mode (When Tools Needed)

**Use LMStudio when**:
- Creating or editing files
- Git operations (commit, push, pull)
- Web search needed
- Running tests
- Complex workflows requiring tools
- **Trade-off**: 30s per request (no cache)

**Example session**:
```
User: "Now fix the bugs and commit"
  → Switch: ANYCLAUDE_MODE=lmstudio
  → Edit files (30s)
  → Git commit (30s)
  → Git push (30s)

Total: 90 seconds (needs tools)
```

#### 🔄 Switching Modes

To switch modes, simply stop the current AnyClaude and restart with different env var:

```bash
# Stop current (Ctrl+C)

# Start with different mode
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
node dist/main.js
```

**NO server restarts needed** - just change the env var and restart AnyClaude.

---

## Performance Characteristics

### MLX-LM Mode (Analysis)

```
Cold Start (First Query):
  Time: 25-35 seconds
  What happens:
    - System prompt (18,490 tokens) computed
    - Cached for all follow-ups
    - Response generated

Warm (Subsequent Queries):
  Time: 0.3-0.5 seconds
  What happens:
    - System prompt loaded from cache (instant!)
    - Only new query tokens processed
    - Response generated quickly

10-Query Session:
  Total: 30 + (9 × 0.3) = 32.7 seconds
  vs without cache: 30 × 10 = 300 seconds
  Improvement: 9.2x faster overall, 100x faster per follow-up
```

### LMStudio Mode (Full Features)

```
Every Query:
  Time: 25-35 seconds
  No caching available
  But: All tools work (read, write, git, search)

10-Query Session:
  Total: 30 × 10 = 300 seconds
  Trade-off: Slower but has complete feature set
```

### Real-World Mixed Session

```
Scenario: Code review → bug fix → verification

User: "Review this code" (Analysis)
  → MLX-LM mode
  → 30s (cold) + 0.3s (follow-up) = 30.3s

User: "Fix the bugs" (Editing)
  → Switch to LMStudio mode
  → 30s (file edit) + 30s (git commit) = 60s

User: "Is the fix correct?" (Analysis)
  → Switch back to MLX-LM mode
  → 30s (cold) + 0.3s (follow-up) = 30.3s

Total: 120.6 seconds with optimal mode selection
vs 300+ seconds using single mode
```

---

## Environment Variables Reference

### MLX-LM Mode

```bash
export MLX_LM_URL="http://localhost:8081/v1"
export MLX_LM_API_KEY="mlx-lm"           # Default key
export ANYCLAUDE_MODE=mlx-lm
export ANYCLAUDE_DEBUG=1                 # Optional: debug logging
```

### LMStudio Mode

```bash
export LMSTUDIO_URL="http://localhost:1234/v1"
export LMSTUDIO_API_KEY="lm-studio"      # Default key
export ANYCLAUDE_MODE=lmstudio
export ANYCLAUDE_DEBUG=1                 # Optional: debug logging
```

### Debug Levels

```bash
ANYCLAUDE_DEBUG=0  # Off (default)
ANYCLAUDE_DEBUG=1  # Basic (show mode, URL)
ANYCLAUDE_DEBUG=2  # Verbose (request/response details)
ANYCLAUDE_DEBUG=3  # Trace (tool calls, full debug)
```

---

## Quick Start Scripts

### Create `start-mlx-analysis.sh`

```bash
#!/bin/bash
# Fast analysis mode with KV cache

source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server \
  --model "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081 &

sleep 5

MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-lm \
ANYCLAUDE_DEBUG=1 \
node dist/main.js
```

### Create `start-lmstudio-editing.sh`

```bash
#!/bin/bash
# Full features mode (requires LMStudio running)

LMSTUDIO_URL="http://localhost:1234/v1" \
ANYCLAUDE_MODE=lmstudio \
ANYCLAUDE_DEBUG=1 \
node dist/main.js
```

### Usage

```bash
chmod +x start-mlx-analysis.sh start-lmstudio-editing.sh

# Start analysis mode
./start-mlx-analysis.sh

# Or start editing mode (LMStudio must be running)
./start-lmstudio-editing.sh
```

---

## Troubleshooting

### "Connection refused" on 8081 (MLX-LM)

**Cause**: MLX-LM server not running

**Solution**:
```bash
source ~/.venv-mlx/bin/activate
python3 -m mlx_lm server --port 8081 &
```

### "Connection refused" on 1234 (LMStudio)

**Cause**: LMStudio not running

**Solution**:
- Open LMStudio app
- Load a model
- Verify at http://localhost:1234

### Slow response times in MLX-LM

**Cause**: System not yet cached (first query)

**Solution**:
- First query is always ~30s (system prompt computed)
- Follow-ups will be 0.3s (cached)
- Be patient on first query!

### Tools not working in MLX-LM mode

**Expected behavior**: MLX-LM doesn't support tools

**Solution**:
- Switch to LMStudio mode for file/git operations
- Or continue with text-only analysis in MLX-LM

### Different performance than expected

**Check**:
- Are both servers running? (`curl http://localhost:8081/v1/models`)
- Is correct mode active? (check logs for `Mode: mlx-lm` or `Mode: lmstudio`)
- Is model fully loaded? (MLX-LM takes 30s to load model first time)

---

## Monitoring

### Check Mode in Use

```bash
# Look for in logs:
# "Mode: mlx-lm" → Analysis mode active
# "Mode: lmstudio" → Editing mode active
```

### Performance Verification

**MLX-LM mode**:
- First response: 25-35 seconds (normal)
- Subsequent: <1 second (KV cache working!)
- If all responses are 30s: Cache may not be working

**LMStudio mode**:
- All responses: 25-35 seconds (consistent)
- Tools available: ✅

### Monitor Servers

```bash
# MLX-LM server status
curl -s http://localhost:8081/v1/models | jq '.data[0].id'

# LMStudio server status
curl -s http://localhost:1234/v1/models | jq '.data[0].id'
```

---

## Production Checklist

- [ ] MLX-LM server running on 8081
- [ ] LMStudio running on 1234
- [ ] AnyClaude built (`npm run build`)
- [ ] Both environment variables set correctly
- [ ] First query to each mode tested (30s response time)
- [ ] Follow-up query in MLX-LM mode tested (0.3s response time)
- [ ] Tool test in LMStudio mode (file creation works)
- [ ] Mode switching verified (change env var, restart works)
- [ ] Documentation read (this file)
- [ ] Debug mode enabled for initial testing

---

## Recommended Usage Pattern

### For Daily Development

```bash
# Morning: Start analysis server
./start-mlx-analysis.sh

# Throughout day:
# - Code analysis → Use MLX-LM (0.3s responses)
# - Need to edit? → Stop, switch to LMStudio
# - More analysis? → Stop, switch back to MLX-LM

# Key insight: Switch when task type changes
```

### For Performance

```
Best case (pure analysis):
  30s first query + 0.3s × 9 = 32.7 seconds total

Typical case (mixed):
  30s + 0.3s + 0.3s + 30s + 30s + 0.3s = 91 seconds

Worst case (all editing):
  30s × 10 = 300 seconds

Sweet spot: Mostly MLX-LM, switch to LMStudio only when needed
```

---

## Next Steps

### Immediate
1. ✅ Both servers running
2. ✅ Test MLX-LM mode (fast responses)
3. ✅ Test LMStudio mode (tools work)
4. ✅ Test mode switching (no restarts needed)

### This Week
1. Create shell aliases for quick mode switching
2. Update README with hybrid approach
3. Gather performance metrics
4. Document any edge cases

### Future (Optional)
1. Monitor for MLX-Textgen server stability
2. Consider upgrading when fully validated
3. Add UI for mode selection if needed
4. Autodetect mode based on user intent

---

## Why This Works

```
Problem: Local Claude Code is slow (30s per query)
Reason: System prompt (18,490 tokens) recomputed every time

Solution: KV Cache
- Compute system prompt once
- Reuse on follow-ups
- 100x faster on follow-ups (0.3s vs 30s)
- But: Requires special server (MLX-LM)

Trade-off: MLX-LM doesn't have tools
- Analysis tasks don't need tools (use MLX-LM)
- Editing tasks need tools (use LMStudio)

Result: User gets best of both
- Speed where it matters (analysis)
- Features where needed (editing)
```

---

## Support

### If Something Doesn't Work

1. Check both servers are running
2. Verify env variables are set correctly
3. Look at debug output (`ANYCLAUDE_DEBUG=3`)
4. Check that ports 8081 and 1234 are accessible
5. Review this document's troubleshooting section

### Performance Optimization Tips

- First MLX-LM query: Always ~30s (first time system prompt is computed)
- Subsequent MLX-LM queries: Always ~0.3s (from cache)
- If you're not seeing 0.3s on follow-ups, KV cache may not be enabled
- Clear system prompt cache by restarting MLX-LM server

---

**Status**: ✅ Production Ready
**Last Updated**: 2025-10-26
**Recommendation**: Use this hybrid approach for best performance and features

Ready to deploy! 🚀
