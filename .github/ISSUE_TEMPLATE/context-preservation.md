---
name: Intelligent Context Preservation
about: Save context to file before truncation, enable session continuation
title: "[FEATURE] Intelligent context preservation and session continuation"
labels: enhancement, good-first-issue
assignees: ""
---

## Problem

When local models approach their context limit, anyclaude currently:

1. Warns at 75%, 90%
2. **Truncates old messages at 100%**
3. Loses important conversation history
4. No way to recover or review what was discarded

This is worse than Claude Sonnet 4.5 which intelligently compresses context while preserving key information.

## Current Behavior

**Example**: Qwen3-Coder-30B with 262K context

```
⚠️  WARNING: Context usage at 92.4%
   Total: 193,776 / 209,715 tokens

   RECOMMENDED ACTION:
   1. Save your work and start a new Claude Code conversation
   2. Or: Use a model with larger context (32K+ recommended)
   3. Or: Set LMSTUDIO_CONTEXT_LENGTH higher if your model supports it
```

**At 100%**:

```
⚠️  CONTEXT LIMIT EXCEEDED - MESSAGES TRUNCATED

Removed 5 older messages to fit within model's context.

  Before: 23 messages (215,432 tokens)
  After:  18 messages
  Limit:  209,715 tokens (80% of 262K)
```

**Problem**: Those 5 messages are **permanently lost**. User has no way to review them or preserve important information.

## Proposed Solution

### Phase 1: Automatic Context Preservation

**Save context to file before truncation**:

```typescript
// When context exceeds 90%
async function preserveContext(
  messages: AnthropicMessage[],
  metadata: {
    model: string;
    contextLimit: number;
    currentUsage: number;
    timestamp: Date;
  }
): Promise<string> {
  const contextFile = `~/.anyclaude/sessions/${Date.now()}-context.json`;

  const preservation = {
    metadata,
    messages,
    summary: await generateSummary(messages), // Optional AI summary
    created: new Date(),
    anyclaudeVersion: packageVersion,
  };

  await writeFile(contextFile, JSON.stringify(preservation, null, 2));

  return contextFile;
}
```

**User notification**:

```
⚠️  WARNING: Context usage at 92.4%
   Total: 193,776 / 209,715 tokens

   📝 Context has been automatically saved to:
      ~/.anyclaude/sessions/1234567890-context.json

   RECOMMENDED ACTIONS:
   1. Continue working - context will be truncated when full
   2. Review saved context: anyclaude --show-context 1234567890
   3. Start new session: /clear (saves current context first)
   4. Manually compress: /compact (requires AI model)

   Your conversation history is safe and can be restored later.
```

### Phase 2: Session Management

**Save full session state**:

```typescript
interface Session {
  id: string;
  created: Date;
  lastActive: Date;
  model: string;
  contextLimit: number;

  // Full conversation
  messages: AnthropicMessage[];
  system?: string;
  tools?: ToolDefinition[];

  // Metadata
  totalTokens: number;
  messageCount: number;
  truncationEvents: {
    timestamp: Date;
    removedMessages: number;
    preservedFile: string;
  }[];

  // Optional summaries
  summaries?: {
    timestamp: Date;
    messageRange: [number, number];
    summary: string;
  }[];
}
```

**Auto-save every N messages**:

```typescript
// Save session every 10 messages or 10 minutes
const SESSION_SAVE_INTERVAL = 10; // messages
const SESSION_SAVE_TIME = 600000; // 10 minutes

// Triggered automatically
await saveSession(session);
```

### Phase 3: Claude Code Integration

**New commands**:

```bash
# Save current context to file
/save-context [description]
> Context saved to: ~/.anyclaude/sessions/my-feature-work.json

# List saved contexts
/list-contexts
> 1. 2025-10-26-14:30 - Feature implementation (23 messages, 45K tokens)
> 2. 2025-10-26-12:00 - Bug fix session (15 messages, 28K tokens)
> 3. 2025-10-25-16:45 - Documentation update (8 messages, 12K tokens)

# Restore previous context
/restore-context 1
> Restored context from: Feature implementation
> Loaded 23 messages (45K tokens)
> Context: 21.4% used (45,120 / 209,715 tokens)

# Show context summary
/context-summary
> Current session: 18 messages, 87,432 tokens (41.7%)
> Saved sessions: 3
> Truncation events: 2 (saved to disk)
```

### Phase 4: Intelligent Summarization

**Use AI to summarize before truncation**:

```typescript
async function compressContext(
  messages: AnthropicMessage[],
  targetTokens: number
): Promise<AnthropicMessage[]> {
  // Find messages that can be summarized (old, low-value)
  const candidates = identifySummarizableBatches(messages);

  for (const batch of candidates) {
    // Generate summary of 5-10 messages
    const summary = await generateSummary(batch);

    // Replace batch with single summary message
    messages = replaceBatchWithSummary(messages, batch, summary);

    if (countTokens(messages) <= targetTokens) {
      break;
    }
  }

  return messages;
}
```

**Strategy**:

1. **Keep recent messages** (last 5-10 messages, full detail)
2. **Summarize middle messages** (5-message batches → 1 summary)
3. **Preserve critical messages** (user saves, tool results, errors)
4. **Archive old messages** (save to disk, remove from active context)

## Use Cases

### Use Case 1: Long Feature Implementation

**Scenario**: User spends 2 hours implementing a feature with Claude Code

**Context Growth**:

- Start: 0 messages, 0 tokens
- After 30 min: 50 messages, 80K tokens (38%)
- After 60 min: 95 messages, 145K tokens (69%)
- After 90 min: 130 messages, 189K tokens (**90%** - warning!)
- After 120 min: 165 messages, 225K tokens (**exceeds limit**)

**Without This Feature**:

- At 90%: Warning to start new session
- At 100%: Truncate 30+ messages (lose context)
- User loses earlier design decisions and context

**With This Feature**:

```
[90 min] ⚠️  Context usage at 90.2%
         📝 Context auto-saved to: ~/.anyclaude/sessions/feature-impl.json

[120 min] ⚠️  CONTEXT LIMIT EXCEEDED
          📝 Archived 40 messages to: ~/.anyclaude/sessions/feature-impl-archive-1.json
          ✅ Removed 40 older messages (kept recent 90)
          💡 Run `/restore-context` later to review full history
```

### Use Case 2: Context Recovery

**Scenario**: User accidentally loses session (crash, network issue)

**Without This Feature**:

- All context lost
- No way to recover
- Must start from scratch

**With This Feature**:

```bash
# Restart anyclaude
anyclaude

# List recent sessions
> /list-contexts
1. 2025-10-26-14:30 - Feature implementation (ACTIVE, 165 messages)
2. 2025-10-26-12:00 - Bug fix session (completed, 45 messages)

# Restore session
> /restore-context 1
✅ Restored 165 messages from auto-save
✅ Context: 89.7% used
💡 Continue where you left off!
```

### Use Case 3: Manual Context Management

**Scenario**: User wants to clean up context mid-session

```bash
# Save important context first
> /save-context "design decisions and architecture"
📝 Saved context to: design-decisions.json (45 messages, 67K tokens)

# Clear current context
> /clear
✅ Context cleared (previous context saved automatically)
✅ Ready for new conversation

# Later: Review what was discussed
> anyclaude --show-context design-decisions
<< Shows formatted conversation history >>
```

## File Format

### Context Save File

```json
{
  "version": "1.0.0",
  "created": "2025-10-26T14:30:00Z",
  "model": "qwen3-coder-30b-a3b-instruct-mlx",
  "contextLimit": 262144,
  "description": "Feature implementation session",

  "metadata": {
    "totalMessages": 165,
    "totalTokens": 189432,
    "percentUsed": 90.2,
    "truncationEvents": [
      {
        "timestamp": "2025-10-26T16:00:00Z",
        "removedMessages": 40,
        "archivedTo": "feature-impl-archive-1.json"
      }
    ]
  },

  "messages": [
    {
      "role": "user",
      "content": "Help me implement user authentication",
      "timestamp": "2025-10-26T14:30:00Z",
      "tokens": 7
    },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "I'll help you implement authentication..." }
      ],
      "timestamp": "2025-10-26T14:30:15Z",
      "tokens": 234
    }
    // ... all messages
  ],

  "summaries": [
    {
      "messageRange": [0, 9],
      "summary": "Initial setup and project structure discussion. User decided on JWT authentication with refresh tokens.",
      "tokens": 23
    }
  ]
}
```

## CLI Commands

```bash
# Show saved contexts
anyclaude --list-contexts

# Show specific context
anyclaude --show-context <id>

# Export context to markdown
anyclaude --export-context <id> --format markdown > session.md

# Restore context to new session
anyclaude --restore <id>

# Clean old contexts (> 30 days)
anyclaude --clean-contexts --older-than 30d
```

## Implementation Plan

### Phase 1: Basic Auto-Save (Week 1)

- [ ] Create context save/load functions
- [ ] Auto-save at 90% context usage
- [ ] Save to `~/.anyclaude/sessions/`
- [ ] Add user notification

### Phase 2: Session Management (Week 2)

- [ ] Implement full session state
- [ ] Add `/save-context` command
- [ ] Add `/list-contexts` command
- [ ] Add `/restore-context` command
- [ ] Auto-save every 10 messages

### Phase 3: Intelligent Truncation (Week 3)

- [ ] Save truncated messages before removal
- [ ] Add links to archived messages in warnings
- [ ] Implement batch archiving

### Phase 4: AI Summarization (Future)

- [ ] Integrate with LMStudio for summarization
- [ ] Implement smart batch detection
- [ ] Add `/compress-context` command
- [ ] Preserve critical messages

### Phase 5: Export & Analysis (Future)

- [ ] Export to Markdown, HTML, JSON
- [ ] Search across saved contexts
- [ ] Generate conversation analytics
- [ ] Integration with note-taking tools

## Configuration

```bash
# ~/.anyclaude/config.json
{
  "contextPreservation": {
    "enabled": true,
    "autoSaveAt": 90, // Save at 90% usage
    "autoSaveInterval": 10, // Save every 10 messages
    "archiveDirectory": "~/.anyclaude/sessions",
    "summarization": {
      "enabled": false, // Requires AI model
      "batchSize": 5, // Summarize 5 messages at a time
      "preserveRecent": 10 // Always keep last 10 full messages
    },
    "cleanup": {
      "autoClean": true,
      "olderThan": "30d" // Delete sessions > 30 days
    }
  }
}
```

## Benefits

### For Users

- ✅ Never lose conversation history
- ✅ Continue long sessions without fear
- ✅ Review past decisions and context
- ✅ Recover from crashes/disconnects
- ✅ Share sessions with team (export JSON/MD)

### For Developers

- ✅ Debug conversation issues (full history saved)
- ✅ Analyze context usage patterns
- ✅ Understand model behavior over time
- ✅ Reproduce user issues from saved contexts

## Comparison with Claude Sonnet 4.5

| Feature              | Claude Sonnet 4.5    | anyclaude (Proposed)                               |
| -------------------- | -------------------- | -------------------------------------------------- |
| Context Window       | 200K tokens          | Varies (8K - 262K)                                 |
| Auto-Compression     | ✅ AI-powered        | ⚠️ Truncation (Phase 1)<br>✅ AI-powered (Phase 4) |
| Context Preservation | ❌ No save           | ✅ Auto-save to disk                               |
| Session Restore      | ❌ No                | ✅ Full restore                                    |
| Manual Control       | `/compact`, `/clear` | Same + `/save-context`, `/restore-context`         |
| Export               | ❌ No                | ✅ Markdown, HTML, JSON                            |

## Related Issues

- Context detection and management (#X)
- Model capability detection (#X)
- Tool calling limitations (#X)

## Success Criteria

1. ✅ Context automatically saved at 90% usage
2. ✅ User can restore previous sessions
3. ✅ No conversation history lost during truncation
4. ✅ Export to human-readable formats (Markdown)
5. ✅ Integration with Claude Code commands

---

**Priority**: High (solves major limitation vs Claude Sonnet 4.5)

**Effort**: Medium (3-4 weeks for full implementation)

**Impact**: High (enables long-running sessions with local models)

**Dependencies**:

- Context detection (completed)
- File system access (available)
- Optional: AI summarization (Phase 4)

**Quick Win**: Phase 1 (auto-save) can be done in 1-2 days
