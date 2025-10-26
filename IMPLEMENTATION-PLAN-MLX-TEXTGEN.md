# Implementation Plan: MLX-Textgen Integration for AnyClaude

**Date**: 2025-10-26
**Goal**: Integrate MLX-Textgen to get both KV cache + tool calling
**Timeline**: 2-4 hours (end-to-end setup and testing)
**Complexity**: Low
**Risk**: Low

---

## What We're Solving

### Current Problem
- MLX-LM: ✅ Fast (KV cache) but ❌ No tools
- LMStudio: ✅ Has tools but ❌ No KV cache
- **Need**: Both KV cache AND tools in one server

### The Solution
**MLX-Textgen**: Production-ready server with both features

```
MLX-Textgen = MLX-LM (speed) + Tool Calling Support
```

---

## 3-Phase Implementation Plan

### Phase 1: Installation & Validation (30 minutes)

**Goal**: Verify MLX-Textgen works with your Qwen3-Coder model

#### Step 1.1: Install MLX-Textgen

```bash
# Option A: Install in existing ~/.venv-mlx (recommended)
source ~/.venv-mlx/bin/activate
pip install mlx-textgen

# Verify installation
python -c "import mlx_textgen; print(mlx_textgen.__version__)"
```

#### Step 1.2: Start MLX-Textgen Server

```bash
# Terminal 1: Start server with KV cache enabled
source ~/.venv-mlx/bin/activate
mlx_textgen serve \
  --model-path "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081 \
  --enable-kv-cache
```

**Expected output**:
```
Loading model: Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
KV Cache: Enabled (multiple slots)
Server: http://127.0.0.1:8081
Ready to accept requests
```

#### Step 1.3: Test Basic Functionality

```bash
# Terminal 2: Test without tools
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "hi"}],
    "max_tokens": 20
  }'

# Expected: JSON response with text content
```

#### Step 1.4: Test Tool Calling

```bash
# Test with tools
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "What is 5+5?"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "calculator",
          "description": "Performs basic math",
          "parameters": {
            "type": "object",
            "properties": {
              "expression": {"type": "string"}
            }
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'

# Expected: Response with tool_calls in structured format
```

#### Step 1.5: Test KV Cache Performance

```bash
# Test 1: First request (cold - will compute system prompt)
time curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant with extensive knowledge about coding."},
      {"role": "user", "content": "Explain KV cache"}
    ],
    "max_tokens": 50
  }' > /dev/null

# Expected: ~25-35 seconds (system prompt computed, cached)

# Test 2: Follow-up request (warm - will use cache)
time curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant with extensive knowledge about coding."},
      {"role": "user", "content": "Explain KV cache"},
      {"role": "assistant", "content": "KV cache is..."},
      {"role": "user", "content": "How much faster is it?"}
    ],
    "max_tokens": 50
  }' > /dev/null

# Expected: ~0.3-0.5 seconds (system prompt cached - 100x faster!)
```

**Success Criteria for Phase 1**:
- ✅ MLX-Textgen installs without errors
- ✅ Server starts successfully
- ✅ Basic requests return valid responses
- ✅ Tool calling works (returns tool_calls in response)
- ✅ KV cache shows 100x speedup on second request

---

### Phase 2: AnyClaude Integration (1-2 hours)

**Goal**: Make AnyClaude work with MLX-Textgen

#### Step 2.1: Add MLX-Textgen Configuration to AnyClaude

Edit `src/main.ts`:

```typescript
// Around line 50, after other mode checks:

if (mode === 'mlx-textgen') {
  // MLX-Textgen is OpenAI-compatible like mlx-lm
  // Use same configuration
  const mlxLmUrl = process.env.MLX_LM_URL || 'http://localhost:8081/v1';
  const mlxLmApiKey = process.env.MLX_LM_API_KEY || 'mlx-textgen';

  const client = new OpenAI({
    baseURL: mlxLmUrl,
    apiKey: mlxLmApiKey,
  });

  // Use client with AnyClaude proxy
  // ... (same as mlx-lm mode)
}
```

#### Step 2.2: Update Environment Variable Handling

```bash
# Create setup script: scripts/start-mlx-textgen.sh

#!/bin/bash

# Start MLX-Textgen server
source ~/.venv-mlx/bin/activate
mlx_textgen serve \
  --model-path "/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit" \
  --port 8081 \
  --enable-kv-cache &

echo "MLX-Textgen server started (PID: $!)"
sleep 5

# Start AnyClaude with MLX-Textgen mode
export MLX_LM_URL="http://localhost:8081/v1"
export ANYCLAUDE_MODE=mlx-textgen
export ANYCLAUDE_DEBUG=1

# Build and run
npm run build
node dist/main.js
```

#### Step 2.3: Test AnyClaude with MLX-Textgen

```bash
# Build the project
npm run build

# Run in proxy-only mode first
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-textgen \
PROXY_ONLY=true \
ANYCLAUDE_DEBUG=1 \
node dist/main.js

# Should show:
# ✓ MLX-Textgen server detected
# ✓ KV cache enabled
# ✓ Tool calling supported
# ✓ Proxy listening on port 8080
```

#### Step 2.4: Test with Claude Code

```bash
# If proxy works, test with Claude Code
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-textgen \
node dist/main.js

# Then use Claude Code and test:
# 1. Ask it to review code (should be fast on follow-ups)
# 2. Ask it to write a file (should use tools)
# 3. Ask for git commit (should use git tools)
```

**Success Criteria for Phase 2**:
- ✅ AnyClaude builds without errors
- ✅ Proxy detects MLX-Textgen server
- ✅ Claude Code connects successfully
- ✅ Both text responses and tool calls work
- ✅ KV cache provides 100x speedup on follow-ups

---

### Phase 3: Documentation & Deployment (30 minutes - 1 hour)

**Goal**: Document MLX-Textgen setup and make it the default

#### Step 3.1: Update README.md

Add new section:

```markdown
## ⚡ Fast Mode with Tools: MLX-Textgen (Recommended)

Best of both worlds: KV cache speed + full tool calling support

### Quick Start

```bash
# 1. Install MLX-Textgen
source ~/.venv-mlx/bin/activate
pip install mlx-textgen

# 2. Start server (in one terminal)
mlx_textgen serve \
  --model-path /path/to/qwen3-coder \
  --port 8081 \
  --enable-kv-cache

# 3. Run AnyClaude (in another terminal)
MLX_LM_URL="http://localhost:8081/v1" \
ANYCLAUDE_MODE=mlx-textgen \
anyclaude
```

### Performance

- **First request**: ~30 seconds (system prompt computed)
- **Follow-ups**: ~0.3 seconds (KV cache hit - 100x faster!)
- **Tools**: ✅ All tools work (read, write, git, search)
- **Result**: Interactive local Claude Code with full features

### Why MLX-Textgen?

- ✅ Combines KV cache (speed) + tools (features)
- ✅ Production-ready and actively maintained
- ✅ Drop-in replacement for mlx-lm mode
- ✅ No feature trade-offs
```

#### Step 3.2: Create MLX-Textgen Setup Guide

File: `docs/guides/mlx-textgen-setup.md`

```markdown
# MLX-Textgen Setup Guide

MLX-Textgen combines the speed of MLX-LM with full tool calling support.

## Installation

## Configuration

## Performance Testing

## Troubleshooting
```

#### Step 3.3: Update PHASE-2-SUMMARY.md

Add new section: "MLX-Textgen: The Final Solution"

```markdown
## Discovery: MLX-Textgen (Production-Ready!)

After researching GitHub, we found **MLX-Textgen** - a production-ready server that
combines both KV cache AND tool calling. No custom development needed!

### What Changed
- ❌ Don't build tool calling support (someone already did)
- ✅ Use MLX-Textgen instead (proven, maintained, tested)

### Result
- 100x faster follow-ups (KV cache)
- All tools work (full Claude Code features)
- Single server (no mode switching)
- Production-ready today
```

#### Step 3.4: Update Documentation Index

File: `docs/README.md`

```markdown
## Performance Optimization

1. [KV Cache Strategy](guides/kv-cache-strategy.md) - Understand the problem
2. [MLX-LM Setup](guides/mlx-lm-setup.md) - Basic KV cache (no tools)
3. **[MLX-Textgen Setup](guides/mlx-textgen-setup.md) - Both KV cache AND tools! ⭐**
4. [LMStudio Setup](guides/lmstudio-setup.md) - Full features (no cache)
5. [Hybrid Mode Guide](guides/mode-switching.md) - When to use each
```

**Success Criteria for Phase 3**:
- ✅ README updated with MLX-Textgen section
- ✅ Setup guide created and comprehensive
- ✅ All docs are consistent
- ✅ Clear recommendation to use MLX-Textgen

---

## Implementation Timeline

```
Phase 1: Installation & Validation   (0.5 hours)
  ├─ Install MLX-Textgen             (5 min)
  ├─ Start server                    (5 min)
  ├─ Test basic functionality        (10 min)
  └─ Test KV cache performance       (5 min)

Phase 2: AnyClaude Integration       (1-2 hours)
  ├─ Add MLX-Textgen mode            (30 min)
  ├─ Test with proxy                 (30 min)
  └─ Test with Claude Code           (30 min)

Phase 3: Documentation               (0.5-1 hour)
  ├─ Update README                   (15 min)
  ├─ Create setup guide              (20 min)
  ├─ Update doc index                (10 min)
  └─ Review and polish               (5-10 min)

TOTAL: 2-4 hours (end-to-end)
```

---

## Rollback Plan

If MLX-Textgen doesn't work as expected:

```bash
# Quick rollback to MLX-LM (no tools)
ANYCLAUDE_MODE=mlx-lm anyclaude

# Or rollback to LMStudio (full features, no cache)
ANYCLAUDE_MODE=lmstudio anyclaude
```

No permanent changes - just environment variables.

---

## Success Criteria (Overall)

| Criterion | Status | Verification |
|-----------|--------|--------------|
| MLX-Textgen installs | ⏳ | `python -c "import mlx_textgen"` |
| Server starts | ⏳ | `curl http://localhost:8081/v1/models` |
| Text requests work | ⏳ | Simple chat completion |
| Tool calling works | ⏳ | Request with tools parameter |
| KV cache verified | ⏳ | 100x speedup on follow-up |
| AnyClaude integrates | ⏳ | `ANYCLAUDE_MODE=mlx-textgen` |
| Claude Code works | ⏳ | End-to-end test with real queries |
| All tools function | ⏳ | Read, write, git, search tests |
| Documentation done | ⏳ | README updated + guides created |

---

## Why This Works

```
MLX-Textgen = Best Solution
  ├─ Doesn't exist yet? Build it ourselves (1-3 days)
  └─ Already exists? Use it! (2-4 hours to integrate) ✅ You are here

You found the solution. Now integrate it and ship it.
```

---

## Next Steps

1. **Start Phase 1 immediately**
   ```bash
   source ~/.venv-mlx/bin/activate
   pip install mlx-textgen
   mlx_textgen serve --model-path [your-model] --enable-kv-cache
   ```

2. **Document results**
   - Time taken to install
   - Performance improvement (measure KV cache speedup)
   - Any issues encountered

3. **Move to Phase 2**
   - Integrate with AnyClaude
   - Test end-to-end
   - Verify all tools work

4. **Deploy**
   - Update documentation
   - Make MLX-Textgen the recommended option
   - Celebrate! 🎉

---

## Questions & Troubleshooting

### Q: Will MLX-Textgen work with my Qwen3-Coder model?
**A**: Yes. MLX-Textgen supports any local model path (same as MLX-LM).

### Q: Does MLX-Textgen preserve KV cache with tool calls?
**A**: Yes. KV cache is a core feature, orthogonal to tool calling.

### Q: What if MLX-Textgen conflicts with MLX-LM?
**A**: Both can be installed in same venv (no conflict).

### Q: Can I switch between MLX-Textgen and LMStudio?
**A**: Yes, just change `ANYCLAUDE_MODE` environment variable.

### Q: What's the community size like?
**A**: MLX-Textgen has 97 GitHub stars (smaller but active). Backed by nath1295 who actively maintains it.

---

## Expected Outcome

After completing all 3 phases, you'll have:

```
✅ MLX-Textgen running on port 8081
✅ AnyClaude integrated and tested
✅ KV cache giving 100x speedup on follow-ups
✅ All tools working (read, write, git, search)
✅ Claude Code interactive and responsive
✅ Full documentation complete
```

**This solves the problem.** No more choosing between speed and features. You get both.

---

*Implementation Plan Created: 2025-10-26*
*Status: Ready to execute*
*Expected Completion: Today (2-4 hours)*
