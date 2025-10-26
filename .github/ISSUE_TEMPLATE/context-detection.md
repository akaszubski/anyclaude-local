---
name: Context Window Detection and Management
about: Document automatic context detection from LMStudio and management features
title: "[FEATURE] Automatic context window detection and management"
labels: enhancement, documentation
assignees: ''
---

## Summary

anyclaude now automatically detects context window size from LMStudio and manages context to prevent overflows. This addresses the limitation that local models cannot auto-compress context like Claude Sonnet 4.5.

## Implementation

### Automatic Detection (Priority Order)

1. **Environment Variable** (Highest Priority)
   ```bash
   LMSTUDIO_CONTEXT_LENGTH=131072 anyclaude
   ```
   Use this to override if LMStudio reports incorrect value.

2. **LMStudio API Query** (Default)
   ```bash
   # Queries: http://localhost:1234/api/v0/models
   # Returns: loaded_context_length or max_context_length
   ```
   Automatically detected on first request and cached for performance.

3. **Model Table Lookup**
   ```typescript
   const MODEL_CONTEXT_LIMITS = {
     "gpt-oss-20b": 131072,
     "qwen3-coder-30b": 262144,
     "deepseek-coder-v2-lite": 16384,
     // ... more models
   }
   ```

4. **Conservative Default**
   ```
   32,768 tokens (32K) - safe for most models
   ```

### Test Results

**Model**: Qwen3-Coder-30B-A3B-Instruct-MLX-6bit

**LMStudio Configuration**: 262,144 tokens (256K max)

**Detection Output**:
```
[ANYCLAUDE DEBUG] [LMStudio] Querying model info from: http://localhost:1234/api/v0/models
[ANYCLAUDE DEBUG] [LMStudio] Loaded model: qwen3-coder-30b-a3b-instruct-mlx | Context: 262,144 tokens
[ANYCLAUDE DEBUG] [Context] Cached LMStudio context length: 262144 tokens
[ANYCLAUDE DEBUG] [Context] Using LMStudio reported context: 262144 tokens
```

✅ **Result**: Correctly detected 262,144 tokens from LMStudio configuration

## Context Management Features

### 1. Token Counting
Uses `tiktoken` (cl100k_base encoding) to estimate tokens:
- System prompts
- User/assistant messages
- Tool definitions
- Tool results

### 2. Safety Margin
Uses **80% of context window** to leave room for response:
```
262,144 tokens (model max)
× 0.80 (safety margin)
= 209,715 tokens (safe limit)
```

### 3. Warning System

**75% Usage** (Debug Log):
```
[Context] 75.3% used (157,286 / 209,715 tokens) - Consider starting new conversation soon
```

**90% Usage** (Warning):
```
⚠️  WARNING: Context usage at 92.4%
   Total: 193,776 / 209,715 tokens

   ⚠️  LOCAL MODEL LIMITATION:
   Unlike Claude Sonnet 4.5 which auto-compresses context,
   local models will truncate older messages when limit is exceeded.

   RECOMMENDED ACTION:
   1. Save your work and start a new Claude Code conversation
   2. Or: Use a model with larger context (32K+ recommended)
   3. Or: Set LMSTUDIO_CONTEXT_LENGTH higher if your model supports it
```

**100% Usage** (Auto-Truncation):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  CONTEXT LIMIT EXCEEDED - MESSAGES TRUNCATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Removed 5 older messages to fit within model's context.

  Before: 23 messages (215,432 tokens)
  After:  18 messages
  Limit:  209,715 tokens (80% of 262K)

⚠️  IMPORTANT - LOCAL MODEL LIMITATION:
  Claude Sonnet 4.5 auto-compresses context while preserving
  key information. Local models cannot do this - old messages
  are simply discarded, which may affect response quality.

RECOMMENDED: Start a new Claude Code conversation to avoid
           losing important context from earlier in the session.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. Truncation Strategy
When context limit exceeded:
1. Keep system prompt (essential)
2. Keep tool definitions (essential)
3. Keep minimum 3 most recent messages (recent context)
4. Fill remaining space with older messages (working backwards)

## Comparison with Claude Sonnet 4.5

| Feature | Claude Sonnet 4.5 | Local Models (anyclaude) |
|---------|------------------|-------------------------|
| Context Window | 200K tokens | Varies (8K - 262K) |
| Auto-Compression | ✅ Yes (smart) | ❌ No (truncation only) |
| Context Preservation | ✅ Preserves key info | ⚠️ Loses old messages |
| Warning System | ✅ At 95% | ✅ At 75%, 90%, 100% |
| Manual Control | `/compact`, `/clear` | Same + env variable |

**Key Difference**: Claude Sonnet 4.5 uses AI to intelligently summarize and compress context while preserving important information. Local models cannot do this - they simply discard old messages when limit is reached.

## Manual Context Management

### Claude Code Commands
```bash
# View current context usage
/context

# Manually compact (summarize) context
/compact

# Clear all context, start fresh
/clear
```

### Environment Variable Override
```bash
# Force specific context length
LMSTUDIO_CONTEXT_LENGTH=65536 anyclaude

# Useful when:
# - LMStudio reports incorrect value
# - You want to limit context for faster responses
# - Model supports larger context than configured in LMStudio
```

## Known Issues

### Issue 1: GPT-OSS Context Overflow
**Model**: GPT-OSS-20B-MLX-8bit

**Reported Limit**: 131,072 tokens (128K)

**Actual Limit**: ~32,768 tokens (32K) before errors

**Workaround**:
```bash
LMSTUDIO_CONTEXT_LENGTH=32768 anyclaude
```

**Details**: GPT-OSS models report 128K support via RoPE + YaRN scaling, but in practice overflow around 32K. This is a model limitation, not anyclaude issue.

### Issue 2: Token Counting Accuracy
**Estimator**: tiktoken (cl100k_base for GPT-4)

**Accuracy**: ~90-95% for most models

**Limitation**: Different models use different tokenizers. anyclaude uses GPT-4's tokenizer as approximation.

**Impact**: Context limit may be slightly off (±5-10%) for non-GPT models.

**Mitigation**: 80% safety margin accounts for estimation errors.

## Test Scripts

### Test Context Detection
```bash
node tests/manual/test_lmstudio_context_query.js
```

**Output**:
```
1️⃣  Querying LMStudio API directly...
   ✅ LMStudio loaded model: qwen3-coder-30b-a3b-instruct-mlx
   ✅ Context length: 262,144 tokens

2️⃣  Starting anyclaude with debug mode...
   [Context] Cached LMStudio context length: 262144 tokens

✅ PERFECT MATCH! Context length correctly queried from LMStudio
```

## Configuration Examples

### High-Context Model (256K)
```bash
# Qwen3-Coder-30B, DeepSeek-V2
# Let anyclaude auto-detect
anyclaude
```

### Medium-Context Model (32K)
```bash
# Mistral-7B, Llama-3-70B
# Auto-detected from LMStudio
anyclaude
```

### Low-Context Model (8K)
```bash
# Older models with limited context
LMSTUDIO_CONTEXT_LENGTH=8192 anyclaude
```

### Conservative Mode (Force Lower)
```bash
# Use less context for faster responses
LMSTUDIO_CONTEXT_LENGTH=16384 anyclaude
```

## Files Changed

- **src/lmstudio-info.ts**: New file for LMStudio API queries
- **src/context-manager.ts**: New file for context management logic
- **src/anthropic-proxy.ts**: Integration with context detection and truncation
- **tests/manual/test_lmstudio_context_query.js**: Test script for verification

## Future Improvements

- [ ] Add support for custom tokenizers per model
- [ ] Implement smart context compression (AI-based summarization)
- [ ] Add context usage to `/status` or similar command
- [ ] Cache tokenization results for performance
- [ ] Support for streaming context updates to Claude Code

## Related Issues

- Tool calling limitations (#X)
- Timeout handling for slow models (#X)
- Performance optimization (#X)

---

**Status**: ✅ Implemented and working

**Testing**: ✅ Verified with Qwen3-Coder-30B (262K context)

**Documentation**: ✅ Added to README.md
