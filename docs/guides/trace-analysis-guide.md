# Trace Analysis & Model Benchmarking Guide

**Complete guide to analyzing Claude Code traces and benchmarking different models.**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Complete Workflow](#complete-workflow)
- [Understanding Results](#understanding-results)
- [Troubleshooting](#troubleshooting)

---

## Overview

anyclaude includes three tools for understanding and optimizing model performance:

1. **`anyclaude`** - Proxy that captures traces of Claude Code requests
2. **`trace-analyzer`** - Analyzes what Claude Code is sending to models
3. **`trace-replayer`** - Benchmarks the same request across different models

### Why Use These Tools?

- **Understand overhead**: See how much context Claude Code uses (system prompts, tools)
- **Find bottlenecks**: Identify if slowness is prompt processing or generation
- **Choose optimal model**: Compare models scientifically with real workloads
- **Debug issues**: See exactly what's being sent when things break

---

## Quick Start

### 1. Capture a Trace

```bash
# Start anyclaude with debug mode
ANYCLAUDE_DEBUG=1 anyclaude

# Do a simple task
You: Read README.md and summarize it

# Exit (Ctrl+C or type "exit")
# Trace saved to: ~/.anyclaude/traces/lmstudio/YYYY-MM-DDTHH-MM-SS.json
```

### 2. Analyze the Trace

```bash
# List available traces
trace-analyzer list

# Analyze a specific trace
trace-analyzer analyze ~/.anyclaude/traces/lmstudio/2025-10-26T14-23-45.json

# Analyze with full details (shows system prompt, tool definitions)
trace-analyzer analyze ~/.anyclaude/traces/lmstudio/2025-10-26T14-23-45.json -v
```

### 3. Benchmark Different Models

```bash
# Load model #1 in LMStudio (e.g., qwen3-coder-30b@4bit)
trace-replayer replay ~/.anyclaude/traces/lmstudio/2025-10-26T14-23-45.json

# Switch to model #2 in LMStudio (e.g., llama-3.1-8b)
trace-replayer replay ~/.anyclaude/traces/lmstudio/2025-10-26T14-23-45.json

# Compare all results
trace-replayer compare ./trace-replays/
```

---

## Complete Workflow

### Phase 1: Capture Representative Traces

Capture traces for different types of operations:

#### **Simple Tool Call** (Most Common)
```bash
ANYCLAUDE_DEBUG=1 anyclaude
You: Read README.md
# Exit after completion
```
**Why**: Tests file operations (Read/Write/Edit) - the most common Claude Code usage

#### **Text-Only Question**
```bash
ANYCLAUDE_DEBUG=1 anyclaude
You: Explain what async/await means in JavaScript in 2 sentences
# Exit after completion
```
**Why**: Tests pure text generation without tool overhead

#### **Complex Multi-Tool**
```bash
ANYCLAUDE_DEBUG=1 anyclaude
You: Find all TypeScript files in src/ and show me the imports in main.ts
# Exit after completion
```
**Why**: Tests multiple tool calls in sequence (Glob + Read)

---

### Phase 2: Analyze What's Being Sent

```bash
# List all captured traces
trace-analyzer list lmstudio

# Analyze each trace to understand overhead
trace-analyzer analyze ~/.anyclaude/traces/lmstudio/simple-tool-call.json -v
```

**Example Output:**
```
================================================================================
TRACE ANALYSIS
================================================================================

Timestamp: 2025-10-26T14:23:45.123Z
Mode: lmstudio
Model: qwen3-coder-30b
Request Type: TOOL_CALL
Tools Used: Read

--------------------------------------------------------------------------------
TOKEN BREAKDOWN
--------------------------------------------------------------------------------
System Prompt:     15,432 tokens  (54%)  ← Claude Code's instructions
Tool Definitions:  12,821 tokens  (45%)  ← 16 tools with JSON schemas
Messages:           1,200 tokens   (4%)  ← Your actual conversation
--------------------------------------------------------------------------------
Total Input:      28,453 tokens

--------------------------------------------------------------------------------
TOOL DEFINITIONS (16 tools)
--------------------------------------------------------------------------------
 1. Read                   1,234 tokens
 2. Write                  1,156 tokens
 3. Edit                   1,892 tokens
 4. Bash                   2,345 tokens
 ... (12 more tools)
```

**Key Insights:**
- Tool calls send **~28,000 tokens** (system + 16 tool schemas + message)
- Text-only sends **~15,000 tokens** (system + message, no tools)
- Your actual message is only **4%** of total tokens!

---

### Phase 3: Benchmark Models

Now use the **same trace** to test different models:

```bash
# Test Model 1: qwen3-coder-30b@4bit
# (Load in LMStudio first)
trace-replayer replay ~/.anyclaude/traces/lmstudio/simple-tool-call.json
```

**Output:**
```
Replaying trace to model: qwen3-coder-30b-a3b-instruct-mlx@4bit
Request: 3 messages, 16 tools

────────────────────────────────────────────────────────────
PERFORMANCE METRICS
────────────────────────────────────────────────────────────
Prompt Processing:  60.23s  (time to first token)
Token Generation:   25.18s  (427 tokens)
Total Time:         85.41s
Generation Speed:   5.00 tokens/sec
────────────────────────────────────────────────────────────

✓ Result saved to: ./trace-replays/simple-tool-call_replay_qwen3-30b-4bit.json
```

**Switch models and repeat:**

```bash
# Switch to llama-3.1-8b in LMStudio
trace-replayer replay ~/.anyclaude/traces/lmstudio/simple-tool-call.json
```

**Output:**
```
Replaying trace to model: llama-3.1-8b

────────────────────────────────────────────────────────────
PERFORMANCE METRICS
────────────────────────────────────────────────────────────
Prompt Processing:  2.41s   (time to first token)  ← 25x faster!
Token Generation:   6.71s   (439 tokens)
Total Time:         8.12s
Generation Speed:   54.06 tokens/sec  ← 10x faster!
────────────────────────────────────────────────────────────
```

---

### Phase 4: Compare All Results

```bash
trace-replayer compare ./trace-replays/
```

**Output:**
```
========================================================================================================
REPLAY COMPARISON
========================================================================================================

Model                               Status   Prompt Proc   Generation   Total Time   Tokens  Tok/sec
--------------------------------------------------------------------------------------------------------
qwen3-coder-30b@4bit                  ✓         60.23s        25.18s        85.41s      427     5.00
qwen3-coder-30b@6bit                  ✓         35.12s        13.11s        48.23s      431     8.94
llama-3.1-8b                          ✓          2.41s         6.71s         8.12s      439    54.06
codestral-22b                         ✓          3.82s         7.42s        11.24s      445    39.59

--------------------------------------------------------------------------------------------------------
Average (4 successful)                          25.40s        13.11s        38.25s              26.90

========================================================================================================
```

**Decision Making:**

| Model | Best For | Reason |
|-------|----------|--------|
| **llama-3.1-8b** | Quick responses, simple tasks | 2.4s startup, 54 tok/sec |
| **codestral-22b** | Balanced coding work | 3.8s startup, 40 tok/sec, coding-specialized |
| **qwen3-30b@6bit** | Complex tasks | 35s startup but very capable |
| **qwen3-30b@4bit** | Maximum capability (slow) | 60s startup, slowest but most accurate |

---

## Understanding Results

### Timing Metrics Explained

**Prompt Processing Time** (Time to First Token)
- How long before you see ANY response
- Includes: model loading prompt into memory, routing (MoE), KV cache building
- **Why it matters**: This is the "wait time" you feel
- **Lower is better**: < 5s feels instant, > 30s feels slow

**Token Generation Time**
- How long to generate all tokens AFTER first token
- Pure generation speed
- **Why it matters**: Affects how fast you see the complete response
- **Higher tokens/sec is better**: 50+ feels like instant typing

**Total Time**
- Complete end-to-end time
- **Why it matters**: Overall productivity impact
- Tradeoff: Fast prompt + slow generation vs slow prompt + fast generation

### Token Count Analysis

**System Prompt** (~1,200-15,000 tokens)
- Claude Code's instructions to the model
- Explains how to use tools, format responses, etc.
- **Cannot be reduced** - required for Claude Code to work

**Tool Definitions** (0-13,000 tokens)
- JSON schemas for all 16 tools (Read, Write, Edit, Bash, etc.)
- Only sent when Claude Code expects to use tools
- **Cannot be reduced** - model needs schemas to call tools correctly

**Messages** (varies)
- Your actual conversation with Claude
- Tool results (file contents, bash output)
- **This is the only part you control**

**Total Input**
- Text-only questions: ~15,000 tokens
- Tool-using requests: ~28,000 tokens
- Complex multi-tool: ~35,000+ tokens

### Model Characteristics

**Small Models (7-8B params)**
- ✅ Fast (2-5s startup, 40-60 tok/sec)
- ⚠️  May struggle with complex tool calling
- ⚠️  Lower coding quality
- **Example**: llama-3.1-8b

**Medium Models (14-22B params)**
- ✅ Balanced (3-8s startup, 30-40 tok/sec)
- ✅ Reliable tool calling
- ✅ Good coding quality
- **Example**: codestral-22b

**Large Models (30B+ params)**
- ⚠️  Slow (30-60s startup, 5-15 tok/sec)
- ✅ Excellent tool calling
- ✅ Best coding quality
- ✅ Handles complex multi-step tasks
- **Example**: qwen3-coder-30b

**MoE vs Dense**
- **MoE** (Mixture of Experts): Slower startup (routing overhead) but good quality
- **Dense**: Faster startup, more predictable performance

---

## Troubleshooting

### Trace Capture Issues

**Problem: Trace file is empty or has `{"index": 0}`**

```bash
# Check trace
cat ~/.anyclaude/traces/lmstudio/latest.json

# If you see: {"request":{"body":{"index":0}}}
# Solution: Update to latest anyclaude and recapture
bun run build
ANYCLAUDE_DEBUG=1 anyclaude
```

**Problem: No traces being created**

```bash
# Verify debug mode is enabled
echo $ANYCLAUDE_DEBUG  # Should show: 1

# Check trace directory exists
ls -la ~/.anyclaude/traces/lmstudio/

# If missing, it will be created on first trace
```

### Analysis Issues

**Problem: "Incomplete trace (old format)"**

```
❌ Incomplete trace (old format). Recapture with latest anyclaude version.
```

**Solution**: This is an old trace before the fix. Recapture with current version.

**Problem: "Invalid JSON"**

```
❌ Invalid JSON: Unexpected token...
```

**Solution**: Trace file is corrupted. Delete it and recapture.

### Replay Issues

**Problem: "No models loaded"**

```
API Error: 400 {"error":"No models loaded. Please load a model..."}
```

**Solution**: Load a model in LMStudio first, then replay.

**Problem: Request hangs / times out**

- Large models (30B+) can take 60+ seconds for prompt processing
- The 10-minute timeout should handle this
- If it times out, the model may be too large for your hardware

**Problem: Different token counts between models**

- **Normal**: Models use different tokenizers
- **Expected**: ±5% variance in token counts
- **Concerning**: >20% difference may indicate model didn't follow instructions correctly

---

## Best Practices

### Capture Strategy

**DO:**
- ✅ Capture traces for your actual use cases
- ✅ Test both tool calls and text generation separately
- ✅ Keep traces organized by task type
- ✅ Recapture after updating anyclaude

**DON'T:**
- ❌ Use synthetic/artificial prompts
- ❌ Mix different task types in comparisons
- ❌ Compare traces with different context sizes

### Benchmarking Strategy

**DO:**
- ✅ Run each model 2-3 times, use median
- ✅ Let model warm up (first run may be slower)
- ✅ Close other apps to reduce interference
- ✅ Test on representative workloads

**DON'T:**
- ❌ Benchmark with other heavy processes running
- ❌ Compare single runs (too noisy)
- ❌ Benchmark immediately after loading model (needs warmup)

### Interpreting Results

**When choosing a model, prioritize:**

1. **For interactive coding**: Time to first token (responsiveness)
2. **For long generations**: Tokens/sec (throughput)
3. **For accuracy**: Test with your actual tasks, not benchmarks

**Remember:**
- 2x slower might be acceptable if 3x more accurate
- Faster model that gives wrong answers is not better
- Your time is valuable - optimize for YOUR workflow

---

## Advanced Usage

### Comparing Text vs Tool Performance

```bash
# Capture both types
ANYCLAUDE_DEBUG=1 anyclaude
You: Read README.md                    # Tool call
# Exit

ANYCLAUDE_DEBUG=1 anyclaude
You: Explain JavaScript promises       # Text only
# Exit

# Compare overhead
trace-analyzer compare ~/.anyclaude/traces/lmstudio/
```

### Testing Context Window Usage

```bash
# Use a large file
ANYCLAUDE_DEBUG=1 anyclaude
You: Read all TypeScript files in src/ and explain the architecture
# Exit

# Analyze context usage
trace-analyzer analyze ~/.anyclaude/traces/lmstudio/latest.json -v
```

### Automating Benchmarks

```bash
# Create a benchmark script
#!/bin/bash
TRACE="~/.anyclaude/traces/lmstudio/reference.json"

echo "Load qwen3-30b in LMStudio, then press Enter"
read
trace-replayer replay $TRACE

echo "Load llama-3.1-8b in LMStudio, then press Enter"
read
trace-replayer replay $TRACE

echo "Load codestral-22b in LMStudio, then press Enter"
read
trace-replayer replay $TRACE

# Compare all
trace-replayer compare ./trace-replays/
```

---

## Next Steps

1. **Capture your first trace** with a realistic task
2. **Analyze the overhead** to understand what's being sent
3. **Benchmark 2-3 models** to find the best fit
4. **Choose your default model** based on data, not guesses

**Remember**: The "best" model is the one that works best for YOUR use case on YOUR hardware!
