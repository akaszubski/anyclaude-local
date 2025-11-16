# Performance Debugging Guide

## Quick Comparison: Fast vs Slow Models

Follow these steps to identify the bottleneck between gpt-oss-20b (fast) and qwen3-42b-thinking (slow).

---

## Test 1: Measure Time to First Token (TTFT)

This tells us if the bottleneck is **prompt processing** (LMStudio) or **token streaming** (anyclaude proxy).

### Fast Model (gpt-oss-20b)

```bash
# 1. Load gpt-oss-20b in LMStudio

# 2. Run with timing
time ANYCLAUDE_DEBUG=2 anyclaude

# 3. In Claude Code, type:
#    "write hello world in python"

# 4. Watch the terminal output for these messages:
#    - [Request Start] → When anyclaude sends request to LMStudio
#    - [Keepalive] → How many times it waits for LMStudio (each = 10 seconds)
#    - [Stream Conversion] Received chunk 1 → First token arrives
#    - [Request Complete] → Total time

# 5. Note:
#    - Number of keepalives
#    - Total time from [Request Start] to first chunk
#    - Total chunks
#    - Total request time
```

### Slow Model (qwen3-42b-thinking)

```bash
# 1. Load qwen3-42b-a3b-2507-thinking... in LMStudio

# 2. Run with timing
time ANYCLAUDE_DEBUG=2 anyclaude

# 3. In Claude Code, type THE SAME THING:
#    "write hello world in python"

# 4. Watch for:
#    - Number of keepalives (more = slower prompt processing by LMStudio)
#    - Time to first chunk
#    - Total chunks (thinking models generate reasoning + answer)
#    - Total request time

# 5. Note the same metrics
```

---

## Test 2: Direct LMStudio Comparison (Bypass anyclaude)

This tells us if LMStudio itself is slow or if anyclaude adds overhead.

### Fast Model in LMStudio Chat UI

```bash
# 1. Open LMStudio
# 2. Load gpt-oss-20b
# 3. Go to Chat tab
# 4. Type: "write hello world in python"
# 5. Time how long until:
#    - First token appears
#    - Response completes
# 6. Note the tokens/sec shown in LMStudio
```

### Slow Model in LMStudio Chat UI

```bash
# 1. Open LMStudio
# 2. Load qwen3-42b-thinking model
# 3. Go to Chat tab
# 4. Type: "write hello world in python"
# 5. Time the same metrics
# 6. Note tokens/sec
```

**KEY QUESTION:** Is the slow model also slow in LMStudio's own UI?
- **If YES** → LMStudio/model is the bottleneck, not anyclaude
- **If NO** → anyclaude proxy is adding overhead

---

## Test 3: Check Prompt Size

Large prompts take longer to process on large models.

```bash
# 1. Load fast model (gpt-oss-20b)
ANYCLAUDE_DEBUG=3 anyclaude

# 2. In Claude Code, ask: "write hello world"

# 3. Check latest trace file:
ls -lht ~/.anyclaude/traces/lmstudio/

# 4. View the request body:
jq '.request.body' ~/.anyclaude/traces/lmstudio/trace-*.json | tail -1 > /tmp/fast-prompt.json

# 5. Check size:
wc -c /tmp/fast-prompt.json
# Note the size in bytes

# 6. Count system prompt length:
jq '.request.body.system | length' ~/.anyclaude/traces/lmstudio/trace-*.json | tail -1

# 7. Count tools:
jq '.request.body.tools | length' ~/.anyclaude/traces/lmstudio/trace-*.json | tail -1

# 8. Count messages:
jq '.request.body.messages | length' ~/.anyclaude/traces/lmstudio/trace-*.json | tail -1
```

Repeat for slow model and compare.

---

## Test 4: Disable Debug Logging (Eliminate Overhead)

Debug logging adds overhead. Test with it completely disabled:

```bash
# Fast model
ANYCLAUDE_DEBUG=0 time anyclaude
# Test in Claude Code

# Slow model
ANYCLAUDE_DEBUG=0 time anyclaude
# Test in Claude Code

# Compare times
```

---

## Expected Findings

### Scenario A: LMStudio is the bottleneck

**Symptoms:**
- Slow model shows many `[Keepalive]` messages (3+)
- Slow model is ALSO slow in LMStudio's own chat UI
- Same prompt size for both models

**Explanation:**
Large models (42B) need more compute to process prompts than small models (20B). This is normal. LMStudio needs ~30-60 seconds to process a large prompt with a large model.

**Solution:**
- Switch to vLLM-MLX (faster inference engine)
- Use smaller context (reduce system prompt size)
- Use smaller model
- Upgrade hardware

### Scenario B: anyclaude proxy is the bottleneck

**Symptoms:**
- Similar keepalive counts for both models
- Slow model is FAST in LMStudio's chat UI
- Slow model generates many more chunks (reasoning tokens)

**Explanation:**
Thinking models generate reasoning tokens before the answer. Each token goes through anyclaude's stream conversion, which adds overhead.

**Solutions:**
- Disable debug logging (`ANYCLAUDE_DEBUG=0`)
- Optimize stream conversion (batch chunks)
- Consider direct vLLM-MLX connection

### Scenario C: Large context window is the issue

**Symptoms:**
- Prompt size is much larger than expected (>50KB)
- Long conversation history accumulating
- Many tools defined (Claude Code sends 10+ tools)
- **Large context model (262K) processing way more tokens than small model (8K)**

**Explanation:**
Your qwen3-42b-thinking model has 262K context vs gpt-oss-20b likely has 8-32K context.

When Claude Code sends a request with:
- Large system prompt (~5-10K tokens)
- 10-15 tool definitions (~3-5K tokens)
- Conversation history (grows over time)

**The large model tries to attend to ALL of it** during generation, making each token slower.

Small models hit their context limit and effectively ignore older messages. Large models process everything.

**Solutions:**
- Start a fresh Claude Code conversation (type `/exit` then relaunch)
- Check actual prompt size being sent (Test 3 above)
- Consider if you need 262K context for simple coding tasks
- Smaller context = faster generation for most tasks

---

## Report Your Findings

After running these tests, report:

1. **Keepalive counts:**
   - Fast model: X keepalives
   - Slow model: Y keepalives

2. **Tokens/sec in LMStudio UI:**
   - Fast model: X tok/s
   - Slow model: Y tok/s

3. **Tokens/sec through anyclaude:**
   - Fast model: X tok/s
   - Slow model: Y tok/s

4. **Prompt sizes:**
   - Fast model: X bytes, Y messages, Z tools
   - Slow model: X bytes, Y messages, Z tools

5. **Chunk counts:**
   - Fast model: X chunks
   - Slow model: Y chunks

This will tell us exactly where the bottleneck is!
