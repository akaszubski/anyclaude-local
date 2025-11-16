# GitHub Issues Summary

> **Note**: These issue templates are ready to be created on GitHub. You'll need to authenticate with `gh auth login` first.

## Created Issue Templates

All templates located in `.github/ISSUE_TEMPLATE/`

### 1. Tool Calling Limitations ⚠️

**File**: `tool-calling-limitations.md`
**Priority**: High
**Type**: Documentation, Enhancement

**Summary**: Tool calling works with local models but reliability varies significantly. Qwen3-Coder-30B can call simple tools but struggles with Claude Code's complex schemas.

**Key Findings**:

- ✅ Simple tools work (60-95% success)
- ❌ Complex Claude Code schemas fail (30% success)
- Model-dependent capability

**Test Results**:

- Qwen3-Coder-30B: ⚠️ Partial support (good for simple tools)
- GPT-OSS-20B: ❌ **Poor multi-turn support** (see below)
- DeepSeek/Mistral: ❌ Poor support

**GPT-OSS-20B Specific Issue** (v2.1.1):

✅ **Single-turn tool calling works**:
- First tool call: `Read(README.md)` - SUCCESS
- JSON extracted correctly: `{"file_path":"/path/to/README.md"}`
- Harmony format parsing: ✅ WORKING

❌ **Multi-turn tool calling fails**:
- After successful first call, model receives tool results
- Model gets confused by error messages
- Starts generating invalid parameters: `{"file?":"?"}`, `{"path?":"?"}`
- Cannot recover from errors
- Degenerates into nonsense tool calls

**Root Cause**: Model not trained well enough on multi-turn Harmony format conversations with tool results

**Workaround**: Use simpler prompts that only require 1-2 tool calls, or switch to a better model

**Recommendations**:

1. Use text-based commands instead of tool inference
2. Test model with `node tests/manual/test_bash_tool.js`
3. Consider models trained for tool use (Command-R+, Qwen2.5-32B)

**Status**: Documented, tested, ready for community input

---

### 2. Context Window Detection ✅

**File**: `context-detection.md`
**Priority**: Medium
**Type**: Feature, Documentation
**Status**: ✅ Implemented

**Summary**: Automatic context detection from LMStudio API, with fallbacks and management features.

**Features**:

- ✅ Auto-detect context from LMStudio (`/api/v0/models`)
- ✅ Environment variable override (`LMSTUDIO_CONTEXT_LENGTH`)
- ✅ Model lookup table for known models
- ✅ Conservative default (32K)
- ✅ Warning system (75%, 90%, 100%)
- ✅ Auto-truncation with user notification

**Tested With**:

- Qwen3-Coder-30B: 262,144 tokens ✅
- GPT-OSS-20B: 131,072 tokens (use 32K in practice)

**Comparison**:
| Feature | Claude Sonnet 4.5 | anyclaude |
|---------|------------------|-----------|
| Context | 200K | 8K - 262K |
| Auto-Compress | ✅ Smart | ❌ Truncate |
| Warnings | 95% | 75%, 90%, 100% |

**Status**: Complete, working, documented

---

### 3. Model Capability Detection 💡

**File**: `model-capability-detection.md`
**Priority**: High
**Type**: Enhancement, Good First Issue

**Summary**: Automatically detect what features each model supports and provide warnings/fallbacks.

**Proposed Features**:

1. **Auto-detection**: Test tool calling, streaming, reasoning
2. **Community database**: Known capabilities for popular models
3. **Warning system**: Alert when unsupported features requested
4. **CLI command**: `anyclaude --test` to validate model

**Capabilities to Detect**:

- Tool calling (simple, medium, complex)
- Context length (reported vs actual)
- Streaming reliability
- Performance metrics (tokens/sec, latency)

**Database Example**:

```typescript
{
  "qwen3-coder-30b-a3b-instruct-mlx": {
    contextLength: { reported: 262144, tested: 262144 },
    toolCalling: { accuracy: { simple: 95, medium: 60, complex: 30 } },
    performance: { tokenGeneration: 45 }
  }
}
```

**CLI Usage**:

```bash
anyclaude --test            # Test current model
anyclaude --capabilities    # Show known capabilities
anyclaude --export-test     # Share results with community
```

**Status**: Designed, ready for implementation

---

### 4. Slow Model Timeout Handling ✅

**File**: `slow-model-timeout.md`
**Priority**: High
**Type**: Bug Fix
**Status**: ✅ Fixed

**Summary**: Claude Code timeout with slow models (60+ second prompt processing). Fixed with SSE keepalive.

**Problem**:

- Models like glm-4.5-air-mlx take 60+ seconds to process prompts
- Claude Code HTTP client times out at ~30-40 seconds
- Connection lost during prompt processing

**Solution**: SSE keepalive every 10 seconds

```typescript
setInterval(() => {
  res.write(`: keepalive ${count}\n\n`);
}, 10000);
```

**Timeline**:

```
t=0s:   message_start event
t=10s:  keepalive 1
t=20s:  keepalive 2
...
t=60s:  Stream starts → keepalive cleared
```

**Affected Models**:

- glm-4.5-air-mlx (60+ seconds)
- Qwen3-Coder-30B with large context (30-60 seconds)
- Large MoE models (Mixtral 8x22B, etc.)

**Status**: Implemented, built, pending user validation

---

### 5. Context Preservation 💡

**File**: `context-preservation.md`
**Priority**: High
**Type**: Enhancement
**Status**: Proposed

**Summary**: Save context to file before truncation, enable session continuation.

**Problem**:

- At 100% context, old messages are truncated and **lost forever**
- No way to review or recover discarded messages
- Long sessions become impossible

**Proposed Solution**:

**Phase 1: Auto-Save** (Quick Win, 1-2 days)

```
⚠️  Context usage at 90.2%
📝 Context auto-saved to: ~/.anyclaude/sessions/feature-impl.json
```

**Phase 2: Session Management** (Week 2)

```bash
/save-context "design decisions"
/list-contexts
/restore-context 1
```

**Phase 3: Intelligent Truncation** (Week 3)

- Archive truncated messages
- Link to archived files in warnings

**Phase 4: AI Summarization** (Future)

- Summarize 5-10 old messages into 1 summary
- Preserve recent messages full detail
- Like Claude Sonnet 4.5 but explicit

**Use Cases**:

1. **Long sessions**: 2+ hour feature implementations
2. **Crash recovery**: Restore session after disconnect
3. **Manual management**: Save important context, clear rest
4. **Export**: Share session as Markdown/JSON

**Comparison**:
| Feature | Claude Sonnet 4.5 | Proposed |
|---------|------------------|----------|
| Auto-Save | ❌ | ✅ |
| Restore | ❌ | ✅ |
| Export | ❌ | ✅ MD/HTML/JSON |
| Compress | ✅ AI | ✅ AI (Phase 4) |

**Status**: Designed, high priority, good first issue for Phase 1

---

## Priority Roadmap

### Immediate (This Week)

1. ✅ **SSE Keepalive** - Already implemented, needs user testing
2. ✅ **Context Detection** - Working, documented
3. 📝 **Create GitHub Issues** - Use `gh issue create` with these templates

### Short Term (Next 2 Weeks)

4. 💡 **Context Preservation Phase 1** - Auto-save at 90% (high value, low effort)
5. 💡 **Model Capability Detection** - Basic testing framework
6. 📚 **Tool Calling Documentation** - Add to README with workarounds

### Medium Term (Next Month)

7. 💡 **Session Management** - Full save/restore/export
8. 💡 **Capability Database** - Community contributions
9. 💡 **Intelligent Summarization** - AI-powered context compression

### Future

10. 💡 **Advanced Exports** - Markdown, HTML, analytics
11. 💡 **Multi-Model Support** - Auto-switch based on task
12. 💡 **Cloud Sync** - Optional session cloud backup

---

## Quick Actions

### Create All Issues on GitHub

```bash
# Authenticate first
gh auth login

# Create issues from templates
gh issue create --template tool-calling-limitations.md --label "documentation,enhancement"
gh issue create --template context-detection.md --label "enhancement,documentation" --label "completed"
gh issue create --template model-capability-detection.md --label "enhancement,good-first-issue"
gh issue create --template slow-model-timeout.md --label "bug,fixed"
gh issue create --template context-preservation.md --label "enhancement"
```

### Test Current Implementation

```bash
# Test SSE keepalive with slow model
ANYCLAUDE_DEBUG=2 anyclaude
# > Send complex prompt, watch for keepalive in logs

# Test context detection
node tests/manual/test_lmstudio_context_query.js

# Test tool calling
node tests/manual/test_bash_tool.js
```

---

## Labels to Use

- `bug` - Something is broken
- `fixed` - Bug has been fixed
- `enhancement` - New feature request
- `documentation` - Docs need updating
- `good-first-issue` - Easy for newcomers
- `help-wanted` - Community input needed
- `high-priority` - Important for users
- `completed` - Feature is done

---

## Next Steps

1. **Review these templates** - Make sure they accurately represent the issues
2. **Create issues on GitHub** - Use `gh issue create` or web UI
3. **Prioritize** - Decide what to work on next
4. **Get community feedback** - Especially for:
   - Model capability database (need community testing)
   - Tool calling workarounds (what works for users?)
   - Context preservation priorities (what's most valuable?)

---

**Generated**: 2025-10-26
**anyclaude Version**: Current development
**Status**: Ready for GitHub publication
