# Proxy-Side Session Caching Design

## Problem

Currently, **every request** sends the full system prompt + tools to the MLX server:

- System prompt: ~3,500 tokens
- Tools: ~15,700 tokens
- **Total overhead: ~19,000 tokens** sent every single request

Even with MLX's automatic KV caching, this is inefficient because:

1. Network overhead sending 19K tokens each time
2. MLX still has to tokenize and match the prefix
3. The proxy is stateless, so it doesn't track what the server already knows

## Solution: Stateful Proxy with Session Caching

### How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Claude Code │────────▶│ Proxy Layer  │────────▶│ MLX Server  │
└─────────────┘         └──────────────┘         └─────────────┘
                             │
                             │ Tracks session state
                             ▼
                        ┌─────────────┐
                        │  Session    │
                        │  Cache:     │
                        │  - system   │
                        │  - tools    │
                        │  - last N   │
                        │    messages │
                        └─────────────┘
```

### Implementation Strategy

#### 1. **Proxy Session Manager** (New Module)

```typescript
// src/session-manager.ts

interface SessionState {
  sessionId: string;
  systemPrompt: string;
  tools: any[];
  systemHash: string; // Hash of system+tools for change detection
  lastActivity: Date;
}

class SessionManager {
  private sessions = new Map<string, SessionState>();

  // Extract or generate session ID from request headers
  getSessionId(headers: Headers): string {
    return headers.get("x-session-id") || generateSessionId();
  }

  // Check if system prompt has changed
  needsSystemUpdate(sessionId: string, system: string, tools: any[]): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return true;

    const newHash = hash(system + JSON.stringify(tools));
    return session.systemHash !== newHash;
  }

  // Store session state
  updateSession(sessionId: string, system: string, tools: any[]) {
    this.sessions.set(sessionId, {
      sessionId,
      systemPrompt: system,
      tools,
      systemHash: hash(system + JSON.stringify(tools)),
      lastActivity: new Date(),
    });
  }
}
```

#### 2. **Proxy Request Optimization**

```typescript
// In anthropic-proxy.ts

const sessionManager = new SessionManager();

// When handling /v1/messages request:
async function handleAnthropicRequest(req: Request) {
  const body = await req.json();
  const sessionId = sessionManager.getSessionId(req.headers);

  // Check if we need to send system prompt
  const needsSystem = sessionManager.needsSystemUpdate(
    sessionId,
    body.system,
    body.tools
  );

  let requestToMLX;
  if (needsSystem) {
    // First request or system changed: send full prompt
    console.log(
      `[Proxy Cache] Cache MISS - sending full system (${sessionId})`
    );
    requestToMLX = {
      messages: convertAnthropicToOpenAI(body),
      tools: body.tools,
      // ... other params
    };

    // Update session cache
    sessionManager.updateSession(sessionId, body.system, body.tools);
  } else {
    // Subsequent request: omit system prompt
    console.log(
      `[Proxy Cache] Cache HIT - reusing cached system (${sessionId})`
    );
    requestToMLX = {
      messages: convertAnthropicToOpenAI(body, { omitSystem: true }),
      // tools omitted - server uses cached version
      sessionId, // Tell server to use cached system
      // ... other params
    };
  }

  return fetch(MLX_SERVER_URL, { body: JSON.stringify(requestToMLX) });
}
```

#### 3. **MLX Server Session Awareness**

```python
# In mlx-server.py

class SessionCache:
    def __init__(self):
        self.sessions = {}  # session_id -> (system_prompt, tools)

    def get_session_context(self, session_id: str):
        """Retrieve cached system prompt and tools for session"""
        return self.sessions.get(session_id)

    def update_session(self, session_id: str, system: str, tools: list):
        """Cache system prompt and tools for future requests"""
        self.sessions[session_id] = (system, tools)

session_cache = SessionCache()

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    session_id = body.get("sessionId")

    # If session ID provided, try to use cached system+tools
    if session_id and not body.get("messages")[0].get("role") == "system":
        cached = session_cache.get_session_context(session_id)
        if cached:
            system, tools = cached
            logger.info(f"[Session Cache] Using cached system for {session_id}")
            # Prepend cached system to messages
            messages = [{"role": "system", "content": system}] + body["messages"]
            tools = tools  # Use cached tools
        else:
            logger.warning(f"[Session Cache] Session {session_id} not found!")
            # Fallback to current request

    # ... rest of request handling
```

## Benefits

### Performance Gains

**Before** (current):

```
Request 1: 19K system+tools + 1K message = 20K tokens
Request 2: 19K system+tools + 2K messages = 21K tokens
Request 3: 19K system+tools + 3K messages = 22K tokens
```

**After** (with proxy caching):

```
Request 1: 19K system+tools + 1K message = 20K tokens  (cache MISS)
Request 2: 0K system+tools + 2K messages = 2K tokens   (cache HIT - 90% reduction!)
Request 3: 0K system+tools + 3K messages = 3K tokens   (cache HIT - 86% reduction!)
```

### Speed Improvement

- **Network transfer**: 90% reduction in request size
- **Tokenization**: MLX doesn't re-tokenize system prompt
- **Processing**: Only processes new conversation turns
- **Expected speedup**: 3-5x for multi-turn conversations

### Combined with MLX KV Cache

This stacks with MLX's automatic prefix caching:

1. Proxy doesn't send system+tools (saved network/parsing)
2. MLX reuses cached system prompt KV states (saved computation)
3. Only processes new user messages

## Implementation Checklist

- [ ] Create `src/session-manager.ts` module
- [ ] Add session ID header handling in proxy
- [ ] Modify `anthropic-proxy.ts` to check session cache
- [ ] Add `sessionId` field to OpenAI request format
- [ ] Update `mlx-server.py` to handle session-aware requests
- [ ] Add session cache to MLX server startup
- [ ] Test multi-turn conversations
- [ ] Measure speed improvement (should be 3-5x)

## Alternative: Use Anthropic's Prompt Caching Format

Instead of custom session management, we could:

1. **Implement Anthropic's prompt caching directives**:

   ```json
   {
     "system": [
       {
         "type": "text",
         "text": "You are Claude Code...",
         "cache_control": {"type": "ephemeral"}
       }
     ],
     "messages": [...]
   }
   ```

2. **Proxy translates to OpenAI extended format**:

   ```json
   {
     "messages": [...],
     "cache_system": true  // Custom flag
   }
   ```

3. **MLX server uses this hint** to cache system prompt

This approach is more standards-compliant and future-proof.

## Recommendation

**Start with simple session-based approach** because:

- Easier to implement and test
- Full control over caching behavior
- Can migrate to Anthropic format later if needed

**Estimated implementation time**: 2-4 hours
**Expected performance gain**: 3-5x speedup for multi-turn conversations
