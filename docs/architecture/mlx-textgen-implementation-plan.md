# MLX-Textgen Migration - Implementation Plan

**Date:** 2025-11-16
**Estimated Time:** 2.5 - 3.5 hours
**Status:** Ready to Execute

---

## Pre-Migration Checklist

### Safety First
- [ ] Git status clean (no uncommitted changes that matter)
- [ ] Create feature branch: `git checkout -b feature/mlx-textgen-migration`
- [ ] Commit current working state
- [ ] Push to remote (backup)
- [ ] Document current performance baseline

### Environment Check
- [ ] Verify Python 3.10+ installed
- [ ] Verify pip working
- [ ] Verify MLX dependencies available
- [ ] Check disk space (>10GB for caches)
- [ ] Verify model path exists: `Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`

---

## Phase 1: Preparation (15-20 min)

### 1.1 Git Commit Current State
```bash
# Check status
git status

# Add all relevant files
git add -A

# Commit with detailed message
git commit -m "chore: prepare for MLX-Textgen migration

Current state before migrating from vllm-mlx-server.py to MLX-Textgen:
- Custom server: 1400 lines, broken KV caching
- Performance: 45-50s per request (no caching)
- Client-side cache: 84.6% token savings
- Response cache: 42.9% hit rate

Migration goal: Enable working KV caching for 10-20x speedup"

# Push to remote
git push origin main
```

### 1.2 Create Backup
```bash
# Backup current server
cp scripts/vllm-mlx-server.py scripts/vllm-mlx-server.py.backup

# Create archive directory
mkdir -p scripts/archive
```

### 1.3 Document Current Performance
```bash
# Run a test request and record time
echo "Baseline performance:" > /tmp/performance-baseline.txt
time anyclaude --mode=vllm-mlx <<< "read README.md and summarize" 2>&1 | tee -a /tmp/performance-baseline.txt
```

**Checklist:**
- [ ] Git commit created
- [ ] Pushed to remote
- [ ] Backup created
- [ ] Performance baseline recorded

---

## Phase 2: Installation & Standalone Testing (30-45 min)

### 2.1 Install MLX-Textgen
```bash
# Install main package
pip install mlx-textgen

# Verify installation
mlx_textgen --version

# Check help
mlx_textgen serve --help
```

**Expected output:**
```
Usage: mlx_textgen serve [OPTIONS]

Options:
  --model-path TEXT           Path to model
  --port INTEGER             Server port (default: 5001)
  --enable-cache BOOLEAN     Enable KV caching (default: true)
  ...
```

### 2.2 Test Standalone (First Request - Cache Creation)
```bash
# Start server in background
mlx_textgen serve \
  --model-path /Users/andrewkaszubski/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
  --port 8082 \
  --enable-cache true \
  --cache-dir ~/.anyclaude/mlx-textgen-cache \
  > ~/.anyclaude/logs/mlx-textgen-test.log 2>&1 &

# Record PID
TEXTGEN_PID=$!
echo "MLX-Textgen PID: $TEXTGEN_PID"

# Wait for startup (30-60 seconds)
sleep 60

# Test with curl (first request - should be slow, creates cache)
time curl -s http://localhost:8082/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 2+2?"}
    ],
    "max_tokens": 100
  }' | jq .

# Expected: 3-5 seconds (small request)
```

### 2.3 Test KV Cache (Second Request - Cache Hit)
```bash
# Same request again - should be much faster
time curl -s http://localhost:8082/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 3+3?"}
    ],
    "max_tokens": 100
  }' | jq .

# Expected: <1 second (system prompt cached)
```

### 2.4 Test Tool Calling
```bash
# Test with tools
curl -s http://localhost:8082/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [{"role": "user", "content": "What is the weather?"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          },
          "required": ["location"]
        }
      }
    }],
    "max_tokens": 100
  }' | jq .

# Expected: tool_calls array in response
```

### 2.5 Verify Cache Files Created
```bash
# Check cache directory
ls -lh ~/.anyclaude/mlx-textgen-cache/

# Expected: .safetensors files created
```

### 2.6 Shutdown Test Server
```bash
# Kill test server
kill $TEXTGEN_PID

# Verify shutdown
ps aux | grep mlx_textgen
```

**Checklist:**
- [ ] MLX-Textgen installed successfully
- [ ] Standalone test successful
- [ ] Cache creation verified (slower first request)
- [ ] Cache hit verified (faster second request)
- [ ] Tool calling works
- [ ] Cache files exist on disk

---

## Phase 3: Integration with anyclaude (45-60 min)

### 3.1 Create MLX-Textgen Launcher Script
```bash
# Create launcher script
cat > scripts/mlx-textgen-server.sh << 'EOF'
#!/bin/bash
# MLX-Textgen Server Launcher for anyclaude
# Replaces vllm-mlx-server.py

MODEL_PATH="${1:-}"
PORT="${2:-8081}"
CACHE_DIR="${3:-$HOME/.anyclaude/mlx-textgen-cache}"
LOG_FILE="${4:-$HOME/.anyclaude/logs/mlx-textgen-server.log}"

# Validate model path
if [ -z "$MODEL_PATH" ]; then
  echo "Error: MODEL_PATH required" >&2
  exit 1
fi

if [ ! -d "$MODEL_PATH" ]; then
  echo "Error: Model not found at $MODEL_PATH" >&2
  exit 1
fi

# Create directories
mkdir -p "$CACHE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Launch MLX-Textgen
echo "[$(date)] Starting MLX-Textgen server..."
echo "[$(date)] Model: $MODEL_PATH"
echo "[$(date)] Port: $PORT"
echo "[$(date)] Cache: $CACHE_DIR"

mlx_textgen serve \
  --model-path "$MODEL_PATH" \
  --port "$PORT" \
  --enable-cache true \
  --cache-dir "$CACHE_DIR" \
  --host 0.0.0.0 \
  >> "$LOG_FILE" 2>&1
EOF

# Make executable
chmod +x scripts/mlx-textgen-server.sh
```

### 3.2 Update `.anyclauderc.json`
```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx-textgen",
      "model": "/Users/andrewkaszubski/Models/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "serverScript": "scripts/mlx-textgen-server.sh",
      "description": "MLX-Textgen - production-grade server with working KV caching"
    }
  }
}
```

### 3.3 Test Auto-Launch
```bash
# Kill any running servers
pkill -f mlx_textgen
pkill -f vllm-mlx-server

# Start anyclaude (should auto-launch MLX-Textgen)
anyclaude --mode=vllm-mlx &

# Wait for startup
sleep 60

# Check server running
curl -s http://localhost:8081/v1/models | jq .

# Expected: Server responds with model info
```

**Checklist:**
- [ ] Launcher script created
- [ ] Configuration updated
- [ ] Auto-launch works
- [ ] Server responds to health check

---

## Phase 4: Comprehensive Testing (30-45 min)

### 4.1 Test Tool Calling with Claude Code
```bash
# Run anyclaude
anyclaude --mode=vllm-mlx

# In Claude Code, test:
# > read README.md and summarize
# (Should use Read tool)
```

**Verify:**
- [ ] Read tool called
- [ ] File content returned
- [ ] Summary generated
- [ ] No errors

### 4.2 Test Multi-Turn Conversation (KV Cache Reuse)
```bash
# First turn
# > read README.md and summarize
# (Record time: should be ~45-50s)

# Second turn (uses same system prompt + tools)
# > what are the main features?
# (Record time: should be ~2-5s - MUCH faster)
```

**Verify:**
- [ ] First turn: normal speed (~45-50s)
- [ ] Second turn: **10-20x faster** (~2-5s)
- [ ] Cache hit logged in `~/.anyclaude/logs/mlx-textgen-server.log`

### 4.3 Test Backend Switching
```bash
# Switch to LMStudio
anyclaude --mode=lmstudio
# > hello
# (Should connect to LMStudio)

# Switch back to MLX-Textgen
anyclaude --mode=vllm-mlx
# > hello
# (Should use cached prefix if available)

# Switch to OpenRouter (if configured)
anyclaude --mode=openrouter
# > hello
```

**Verify:**
- [ ] All backends still work
- [ ] Switching is seamless
- [ ] No errors

### 4.4 Verify Three-Layer Caching
```bash
# Check client-side cache metrics
cat .anyclaude-cache-metrics.json | jq .

# Check response cache (in server logs)
grep "Cache Hit" ~/.anyclaude/logs/mlx-textgen-server.log

# Check MLX KV cache files
ls -lh ~/.anyclaude/mlx-textgen-cache/
```

**Verify:**
- [ ] Layer 1 (client): Token savings reported
- [ ] Layer 2 (response): Hit rate reported
- [ ] Layer 3 (KV): Cache files created

### 4.5 Performance Benchmark
```bash
# Record performance
echo "After MLX-Textgen migration:" > /tmp/performance-after.txt

# First request (cache creation)
time anyclaude --mode=vllm-mlx <<< "read README.md and summarize" 2>&1 | tee -a /tmp/performance-after.txt

# Second request (cache hit)
time anyclaude --mode=vllm-mlx <<< "what are the main features?" 2>&1 | tee -a /tmp/performance-after.txt

# Compare
echo "BEFORE (baseline):"
cat /tmp/performance-baseline.txt | grep real

echo "AFTER (with KV cache):"
cat /tmp/performance-after.txt | grep real
```

**Success Criteria:**
- [ ] First request: ≤60s (acceptable)
- [ ] Second request: ≤5s (**10-20x improvement**)

**Checklist:**
- [ ] Tool calling works
- [ ] Multi-turn conversation works
- [ ] KV cache provides speedup
- [ ] Backend switching works
- [ ] All three cache layers working
- [ ] Performance goals met

---

## Phase 5: Cleanup & Documentation (20-30 min)

### 5.1 Archive Old Server
```bash
# Move to archive
mv scripts/vllm-mlx-server.py scripts/archive/
mv scripts/vllm-mlx-server.py.backup scripts/archive/

# Add README
cat > scripts/archive/README.md << 'EOF'
# Archived: vllm-mlx-server.py

**Date Archived:** 2025-11-16
**Reason:** Replaced with MLX-Textgen (production-grade solution)

## Why Archived

The custom `vllm-mlx-server.py` was replaced with MLX-Textgen because:
- MLX KV caching Python API doesn't exist (our implementation was broken)
- MLX-Textgen provides production-ready alternative
- 10-20x performance improvement with working KV caching
- Less maintenance burden (1400 lines → pip package)

## Rollback

If needed, copy back to `scripts/`:
```bash
cp scripts/archive/vllm-mlx-server.py scripts/
```

Then update `.anyclauderc.json` to use old server.
EOF
```

### 5.2 Update Documentation

**README.md:**
```markdown
# Update the backend section to mention MLX-Textgen

**Primary Backend**: MLX-Textgen (production-grade, working KV caching)

**Features:**
- 10-20x speedup on follow-up requests (KV caching)
- Multi-slot disk cache (doesn't overwrite)
- Native tool calling support
- Optimized for Apple Silicon
```

**CLAUDE.md:**
```markdown
# Update architecture section

## Architecture

The proxy works by:

1. Spawning MLX-Textgen server (production-grade MLX inference)
2. Intercepting `/v1/messages` requests
3. Converting Anthropic format to OpenAI format
4. Routing to MLX-Textgen (or other backends)
5. Converting responses back to Anthropic format
6. Setting `ANTHROPIC_BASE_URL` to point at the proxy

**Performance:** MLX-Textgen provides 10-20x speedup on follow-up
requests via disk-based KV caching.
```

### 5.3 Update Architecture Docs
```bash
# Add migration doc to index
# (Already created in docs/architecture/)
```

### 5.4 Git Commit
```bash
# Add all changes
git add -A

# Commit with detailed message
git commit -m "feat: migrate to MLX-Textgen for production-grade KV caching

BREAKING CHANGE: Replaced custom vllm-mlx-server.py with MLX-Textgen

Performance improvements:
- Follow-up requests: 2-5s (was 45-50s)
- 10-20x speedup with working KV caching
- Multi-slot disk cache (automatic management)

Changes:
- NEW: scripts/mlx-textgen-server.sh (auto-launcher)
- NEW: docs/architecture/mlx-textgen-migration.md (design doc)
- NEW: docs/architecture/mlx-textgen-implementation-plan.md
- UPDATED: .anyclauderc.json (uses MLX-Textgen)
- UPDATED: README.md (mentions MLX-Textgen)
- UPDATED: CLAUDE.md (architecture docs)
- ARCHIVED: scripts/vllm-mlx-server.py (kept for rollback)

Testing:
- ✅ Tool calling works
- ✅ Multi-turn conversations work
- ✅ KV cache provides 10-20x speedup
- ✅ Backend switching works
- ✅ All three cache layers working

Dependencies:
- Added: mlx-textgen (pip package)

Migration guide: docs/architecture/mlx-textgen-migration.md"

# Push to remote
git push origin main
```

**Checklist:**
- [ ] Old server archived
- [ ] Documentation updated (README, CLAUDE.md)
- [ ] Architecture docs updated
- [ ] Git commit created
- [ ] Pushed to remote

---

## Rollback Procedure (If Needed)

If something goes wrong:

```bash
# 1. Stop MLX-Textgen
pkill -f mlx_textgen

# 2. Restore old server
cp scripts/archive/vllm-mlx-server.py scripts/

# 3. Restore old config
git checkout HEAD~1 .anyclauderc.json

# 4. Restart
anyclaude --mode=vllm-mlx
```

---

## Success Metrics

After migration is complete, verify:

### Performance
- [ ] First request: ≤60s (cache creation)
- [ ] Follow-up requests: ≤5s (**target: 2-5s**)
- [ ] Speedup: ≥10x on follow-up requests

### Functionality
- [ ] Tool calling works (Read, Write, Edit, Bash, Grep, Glob)
- [ ] Multi-turn conversations work
- [ ] All backends work (vllm-mlx, lmstudio, openrouter, claude)
- [ ] Auto-launch/shutdown works
- [ ] No errors in logs

### Quality
- [ ] Three cache layers all working
- [ ] Cache files created on disk
- [ ] Documentation updated
- [ ] Git history clean
- [ ] Can rollback if needed

---

## Timeline

- ✅ **Phase 1:** 15-20 min (Preparation)
- ⏱️ **Phase 2:** 30-45 min (Installation & Testing)
- ⏱️ **Phase 3:** 45-60 min (Integration)
- ⏱️ **Phase 4:** 30-45 min (Testing)
- ⏱️ **Phase 5:** 20-30 min (Cleanup)

**Total:** 2.5 - 3.5 hours

---

## Ready to Execute?

Review the design and plan, then:
1. Confirm you want to proceed
2. Execute Phase 1 (git commit current state)
3. Proceed phase by phase
4. Test thoroughly at each phase
5. Rollback if issues found

**Next step:** Phase 1 - Git commit current working state
