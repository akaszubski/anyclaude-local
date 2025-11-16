# Debug Workflow - Quick Reference

## 🚀 How to Capture Debug Logs

When you encounter issues (tool calling, streaming, errors, etc.):

```bash
# Set debug level and run anyclaude
ANYCLAUDE_DEBUG=2 anyclaude

# Or configure in .anyclauderc.json:
{
  "debug": {
    "level": 2,
    "enableTraces": true
  }
}
```

### Debug Levels

- **0**: No debug (default)
- **1**: Basic - server startup, errors
- **2**: Verbose - requests, responses, stream chunks (recommended)
- **3**: Trace - full tool schemas, all details

### Where Logs Are Saved

```bash
# Debug session logs (runtime events)
~/.anyclaude/logs/debug-session-2025-11-16T02-30-45.log

# Trace files (full request/response, only when enableTraces: true)
~/.anyclaude/traces/vllm-mlx/2025-11-16T02-30-45.json
~/.anyclaude/traces/claude/2025-11-16T02-30-45.json
~/.anyclaude/traces/openrouter/2025-11-16T02-30-45.json
```

## 📋 What Gets Logged

### Session Configuration (always logged at level 1+)

```
────────────────────────────────────────────────────────────
SESSION CONFIGURATION
────────────────────────────────────────────────────────────
Backend Mode: vllm-mlx
Model: /Users/.../gpt-oss-20b-5bit
Backend URL: http://localhost:8081/v1
Proxy URL: http://localhost:63596

Configuration:
{
  "backend": "vllm-mlx",
  "debugLevel": "2",
  "configFile": ".anyclauderc.json"
}
────────────────────────────────────────────────────────────
```

### Runtime Events (level 1+)

- Server startup/shutdown
- Connection status
- Errors and warnings
- Tool call attempts

### Request/Response Details (level 2+)

- HTTP requests sent to backend
- Stream chunks received
- Message conversions (Anthropic ↔ OpenAI)

### Full Tool Schemas (level 3)

- Complete tool definitions sent to model
- Parameter schemas
- All stream events

## 🔍 Sending Logs to Claude for Analysis

When reporting an issue:

1. **Run with debug logging**:
   ```bash
   ANYCLAUDE_DEBUG=2 anyclaude
   # Reproduce the issue
   # Exit with /exit
   ```

2. **Find the log file**:
   ```bash
   ls -lt ~/.anyclaude/logs/debug-session-*.log | head -1
   ```

3. **Share the path** or **paste the contents**:
   ```bash
   cat ~/.anyclaude/logs/debug-session-2025-11-16T02-30-45.log
   ```

Claude will analyze:
- ✅ Model and backend configuration
- ✅ Tool schemas sent to the model
- ✅ Model's actual response format
- ✅ Stream conversion issues
- ✅ Error patterns

## 🎯 Common Issues & Logs to Check

### Tool Calling Not Working

**What to look for:**
```bash
# Check if tools are being sent
grep "tools.*function" debug-session-*.log

# Check model response format
grep "tool_calls\|commentary" debug-session-*.log

# Check for conversion errors
grep "ERROR\|error" debug-session-*.log
```

**Debugging guide**: `docs/debugging/gpt-oss-20b-tool-calling-issue.md`

### Streaming Truncated

**What to look for:**
```bash
# Check for backpressure messages
grep "Backpressure\|buffer" debug-session-*.log

# Check for timeout
grep "timeout\|finish" debug-session-*.log
```

**Fix documentation**: `docs/debugging/stream-truncation-fix.md`

### Server Startup Failures

**What to look for:**
```bash
# Check server launch logs
grep "server-launcher\|vllm-mlx" debug-session-*.log

# Also check server logs
tail ~/.anyclaude/logs/vllm-mlx-server.log
```

### Connection Timeouts

**What to look for:**
```bash
# Check timeout configuration
grep "timeout\|Request timeout" debug-session-*.log

# Check connection attempts
grep "Server not ready\|fetch failed" debug-session-*.log
```

## 🛠️ Advanced Debugging

### Enable Trace Logging

For deep investigation (saves full request/response):

```json
{
  "debug": {
    "level": 3,
    "enableTraces": true
  }
}
```

Traces saved to: `~/.anyclaude/traces/{backend}/`

### Analyze Traces

```bash
# View latest trace (pretty JSON)
jq . ~/.anyclaude/traces/vllm-mlx/*.json | tail -1000

# Extract tool schemas
jq '.request.body.tools' ~/.anyclaude/traces/vllm-mlx/*.json

# Extract model response
jq '.response.body' ~/.anyclaude/traces/vllm-mlx/*.json
```

### Compare Backends

```bash
# Run with vllm-mlx
ANYCLAUDE_DEBUG=2 anyclaude --mode=vllm-mlx
# (do something)

# Run with claude (for comparison)
ANYCLAUDE_DEBUG=2 anyclaude --mode=claude
# (do same thing)

# Compare the logs
diff ~/.anyclaude/logs/debug-session-*.log
```

## 📝 Clean Up Old Logs

Logs are kept indefinitely. Clean up periodically:

```bash
# Remove debug logs older than 7 days
find ~/.anyclaude/logs -name "debug-session-*.log" -mtime +7 -delete

# Remove traces older than 7 days
find ~/.anyclaude/traces -name "*.json" -mtime +7 -delete

# Or remove all
rm ~/.anyclaude/logs/debug-session-*.log
rm ~/.anyclaude/traces/*/*.json
```

## 🎓 For Claude Code (the AI)

When analyzing debug logs, follow this workflow:

1. **Read the debugging guide first**:
   - `docs/debugging/gpt-oss-20b-tool-calling-issue.md` (tool calling)
   - `docs/debugging/stream-truncation-fix.md` (streaming)
   - `docs/debugging/tool-calling-fix.md` (previous fixes)

2. **Extract session config**:
   - Model name/path
   - Backend mode
   - URLs and ports

3. **Look for the actual problem**:
   - Error messages
   - Unexpected formats
   - Missing expected events

4. **Classify the root cause**:
   - Model limitation (not trained for tool calling)
   - Format mismatch (model uses different format)
   - Configuration issue (wrong parameters)
   - Schema issue (union types, etc.)
   - Server issue (vllm-mlx config)

5. **Propose solution**:
   - Code fix with file paths
   - Configuration change
   - Model recommendation
   - Documentation update

**Remember**: The debug log has ALL the information needed to diagnose most issues!
