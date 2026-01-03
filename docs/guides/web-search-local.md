# Local-Only Web Search with SearxNG

Privacy-first web search using self-hosted SearxNG for AnyClaude. No cloud dependencies, no rate limits, full control.

## Overview

AnyClaude supports local web search via [SearxNG](https://github.com/searxng/searxng), a privacy-respecting metasearch engine. When enabled, web searches happen on your local machine instead of calling cloud APIs.

## The Claude Code Challenge

**Why can't we just intercept WebSearch at the proxy?**

Claude Code's native `WebSearch` tool is executed **server-side by Anthropic** before requests reach any proxy. This means:

1. Your proxy never sees WebSearch requests
2. You can't redirect them to local SearXNG
3. All searches go through Anthropic's servers

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE PROBLEM                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User: "search for latest news"                                 │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐    WebSearch    ┌──────────────────────┐  │
│  │  Claude Code    │ ──────────────► │  Anthropic Servers   │  │
│  │  (your machine) │                 │  (executes search)   │  │
│  └─────────────────┘                 └──────────────────────┘  │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  AnyClaude      │  ◄── Never sees WebSearch!                │
│  │  Proxy          │                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## The Solution: Disable Native + Use MCP

The solution has three parts:

1. **Disable native WebSearch** - Prevents Anthropic server-side execution
2. **Add MCP SearXNG server** - Provides local search as a tool Claude can call
3. **Configure auto-approval** - Enables seamless usage without permission prompts

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE SOLUTION                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User: "search for latest news"                                 │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐  mcp__searxng  ┌──────────────────────┐   │
│  │  Claude Code    │ ─────────────► │  MCP SearXNG Server  │   │
│  │  (your machine) │                │  (local process)     │   │
│  └─────────────────┘                └──────────────────────┘   │
│                                              │                  │
│                                              ▼                  │
│                                     ┌──────────────────────┐   │
│                                     │  Local SearXNG       │   │
│                                     │  (Docker container)  │   │
│                                     └──────────────────────┘   │
│                                              │                  │
│                                              ▼                  │
│                                     ┌──────────────────────┐   │
│                                     │  Search Engines      │   │
│                                     │  (Google, DDG, etc)  │   │
│                                     └──────────────────────┘   │
│                                                                 │
│  ✓ All orchestration happens locally                           │
│  ✓ No Anthropic server-side execution                          │
│  ✓ You control which search engines are used                   │
│  ✓ No API keys or rate limits                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP-Based Approach (Recommended for Claude Code)

This is the **recommended approach** for Claude Code users. It uses the Model Context Protocol (MCP) to provide a local search tool that Claude Code can call directly.

### TL;DR - Complete Setup

```bash
# 1. Start SearXNG (Docker)
cd scripts/docker && ./start-searxng.sh

# 2. Install MCP server
npm install -g @kevinwatt/mcp-server-searxng

# 3. Configure Claude Code MCP
claude mcp add searxng -- npx -y @kevinwatt/mcp-server-searxng

# 4. Disable native WebSearch (forces Claude to use MCP)
# Add to ~/.claude/settings.json or .claude/settings.json in your project:
#   { "permissions": { "deny": ["WebSearch"] } }

# 5. Create auto-approval policy (critical for seamless usage)
mkdir -p ~/.claude/config
cat > ~/.claude/config/auto_approve_policy.json << 'EOF'
{
  "version": "1.0",
  "web_tools": {
    "whitelist": ["WebFetch", "WebSearch", "mcp__searxng__web_search"],
    "allow_all_domains": true,
    "blocked_domains": ["localhost", "127.0.0.1", "169.254.*", "10.*", "192.168.*"]
  }
}
EOF

# 6. Restart Claude Code
```

Now searches work seamlessly with no permission prompts!

**What each step does:**

| Step | Component | Purpose |
|------|-----------|---------|
| 1 | SearXNG Docker | Local metasearch engine aggregating Google, DuckDuckGo, etc. |
| 2 | MCP Server | Bridge between Claude Code and SearXNG |
| 3 | MCP Config | Tells Claude Code about the MCP server |
| 4 | Deny WebSearch | **Critical**: Prevents server-side search execution |
| 5 | Auto-approval | Removes permission prompts for MCP tool |
| 6 | Restart | Loads new configuration |

### Why MCP?

- **Works with Claude Code**: Bypasses server-side WebSearch execution
- **Native integration**: Claude Code has built-in MCP support
- **Clean architecture**: No proxy interception needed
- **Works with any backend**: Local models, OpenRouter, or Claude

### Quick Setup

**Step 1: Start local SearxNG** (same Docker setup as below)

```bash
cd scripts/docker
./start-searxng.sh
```

**Step 2: Install MCP SearXNG server**

```bash
npm install -g @kevinwatt/mcp-server-searxng
```

**Step 3: Configure Claude Code MCP**

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "searxng": {
      "command": "npx",
      "args": ["-y", "@kevinwatt/mcp-server-searxng"],
      "env": {
        "SEARXNG_URL": "http://localhost:8080"
      }
    }
  }
}
```

Or use the CLI:

```bash
claude mcp add searxng -- npx -y @kevinwatt/mcp-server-searxng
```

**Step 4: Disable native WebSearch** (forces Claude to use MCP)

Create `.claude/settings.json` in your project (or `~/.claude/settings.json` globally):

```json
{
  "permissions": {
    "deny": ["WebSearch"]
  }
}
```

**Step 5: Configure Auto-Approval (Critical)**

Claude Code's permissions system (`~/.claude/settings.json`) allows `mcp__*` tools, but if you're using the autonomous-dev plugin's PreToolUse hooks, there's a separate policy file that controls MCP tool auto-approval.

Create `~/.claude/config/auto_approve_policy.json`:

```json
{
  "version": "1.0",
  "web_tools": {
    "whitelist": ["WebFetch", "WebSearch", "mcp__searxng__web_search"],
    "allow_all_domains": true,
    "blocked_domains": ["localhost", "127.0.0.1", "169.254.*", "10.*", "192.168.*"]
  }
}
```

> **Why is this needed?**
>
> The PreToolUse hook's `tool_validator.py` has its own whitelist separate from Claude Code's main permissions. Without this policy file, MCP searches will prompt for approval each time, even if `mcp__*` is in your allowed tools.

**Step 6: Restart Claude Code**

Now when you ask Claude to search, it will use your local SearxNG via the MCP `mcp__searxng__web_search` tool - with **no permission prompts**.

### Alternative MCP Servers

| Server | Install | Notes |
|--------|---------|-------|
| [@kevinwatt/mcp-server-searxng](https://www.npmjs.com/package/@kevinwatt/mcp-server-searxng) | `npm install -g @kevinwatt/mcp-server-searxng` | Recommended, well-maintained |
| [searxng-mcp](https://github.com/tisDDM/searxng-mcp) | `uvx searxng-mcp` | Uses random public instances (no Docker needed) |
| [mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng) | See repo | Python-based |

### Verification

After setup, Claude Code will have a `searxng_search` tool available. You can verify by asking Claude:

```
What tools do you have for web search?
```

Claude should mention the `searxng_search` MCP tool instead of the native `WebSearch` tool.

### Troubleshooting MCP Auto-Approval

**Problem: Still getting permission prompts for MCP search**

```
Hook PreToolUse:mcp__searxng__web_search requires confirmation for this tool:
Not whitelisted: Tool 'mcp__searxng__web_search' not supported for auto-approval
```

**Solution:**

1. Create the policy file (Step 5 above)
2. Ensure the directory exists: `mkdir -p ~/.claude/config`
3. Restart Claude Code

**Why this happens:**

Claude Code has two permission layers:
1. **Claude Code permissions** (`~/.claude/settings.json`) - Controls which tools Claude can call
2. **Hook validator** (`~/.claude/lib/tool_validator.py`) - Pre-tool hooks may have their own whitelists

Even if `mcp__*` is allowed in settings.json, the hook's `tool_validator.py` checks its own `web_tools.whitelist`. The policy file bridges this gap.

**Verify it's working:**

After setup, ask Claude to search. You should see the search execute immediately without any permission dialog.

### References

- [Claude Code Issue #1380](https://github.com/anthropics/claude-code/issues/1380) - Allow native tools to be disabled ✅ Implemented
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Integrating MCP Servers for Web Search](https://intuitionlabs.ai/articles/mcp-servers-claude-code-internet-search)

---

## Proxy-Based Approach (For Other Clients)

**Benefits:**

- **Privacy**: All searches stay on your machine
- **No rate limits**: Unlimited searches without API quotas
- **No API costs**: Free forever, no API keys needed
- **Full control**: Configure search engines, caching, and behavior
- **Speed**: Local searches are fast (no network latency)

**When to use:**

- You want privacy-first web search
- You're hitting rate limits on cloud APIs
- You want to minimize cloud dependencies
- You need reliable search without API key management

## Quick Start

Three commands to get started:

```bash
# 1. Start local SearxNG (Docker)
cd scripts/docker
./start-searxng.sh

# 2. Set environment variable
export SEARXNG_URL=http://localhost:8080

# 3. Test the search
curl 'http://localhost:8080/search?q=test&format=json'
```

That's it! AnyClaude will now use local SearxNG for all web searches.

## Configuration

### Environment Variable (Recommended)

Enable local search by setting `SEARXNG_URL`:

```bash
# Use default localhost:8080
export SEARXNG_URL=http://localhost:8080

# Or use custom URL/port
export SEARXNG_URL=http://192.168.1.100:9999

# Or use HTTPS
export SEARXNG_URL=https://searxng.example.com
```

### Config File (Optional)

Add to `.anyclauderc.json`:

```json
{
  "webSearch": {
    "localSearxngUrl": "http://localhost:8080",
    "preferLocal": true,
    "enableFallback": true
  }
}
```

**Options:**

- `localSearxngUrl`: URL of your SearxNG instance (default: `http://localhost:8080`)
- `preferLocal`: Try local SearxNG first (default: `true`)
- `enableFallback`: Fall back to cloud APIs if local fails (default: `true`)

### Fallback Chain

When `SEARXNG_URL` is set, AnyClaude tries sources in this order:

1. **Local SearxNG** (privacy-first, unlimited)
2. **Anthropic API** (if `ANTHROPIC_API_KEY` set)
3. **Tavily API** (if `TAVILY_API_KEY` set)
4. **Brave API** (if `BRAVE_API_KEY` set)
5. **Public SearxNG** (free, rate-limited)

If local SearxNG returns results, it stops immediately (no cloud API calls).

## Docker Setup

### Start SearxNG

```bash
cd scripts/docker
./start-searxng.sh
```

This script:

- Checks Docker is running
- Starts `anyclaude-searxng` container
- Waits for SearxNG to be ready (health check)
- Prints test command

**Output:**

```
Starting SearxNG...
Waiting for SearxNG to be ready...
✅ SearxNG is running at http://localhost:8080

Test with: curl 'http://localhost:8080/search?q=test&format=json'
```

### Manual Docker Commands

```bash
# Start SearxNG
docker compose -f scripts/docker/docker-compose.searxng.yml up -d

# Check logs
docker logs anyclaude-searxng

# Stop SearxNG
docker compose -f scripts/docker/docker-compose.searxng.yml down

# Restart SearxNG
docker compose -f scripts/docker/docker-compose.searxng.yml restart
```

### Container Details

**Image:** `ghcr.io/searxng/searxng:latest`
**Container name:** `anyclaude-searxng`
**Port:** `127.0.0.1:8080:8080` (localhost only, not exposed to network)
**Restart policy:** `unless-stopped` (survives reboots)

**Security:**

- Runs with minimal capabilities (drops all except `CHOWN`, `SETGID`, `SETUID`)
- Bound to `127.0.0.1` only (not accessible from network)
- Read-only config volume

## Configuration Customization

### Customize Search Engines

Edit `scripts/docker/searxng-settings.yml`:

```yaml
engines:
  - name: google
    engine: google
    shortcut: g
    disabled: false
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg
    disabled: false
  - name: bing
    engine: bing
    shortcut: b
    disabled: false
  - name: stackoverflow
    engine: stackoverflow
    shortcut: so
    disabled: false
```

**Restart to apply:**

```bash
docker compose -f scripts/docker/docker-compose.searxng.yml restart
```

### Change Port

Edit `scripts/docker/docker-compose.searxng.yml`:

```yaml
ports:
  - "127.0.0.1:9999:8080" # Change 9999 to your port
```

Update environment variable:

```bash
export SEARXNG_URL=http://localhost:9999
```

### Security: Change Secret Key

Edit `scripts/docker/searxng-settings.yml`:

```yaml
server:
  secret_key: "your-random-string-here" # Generate with: openssl rand -hex 32
```

**Restart to apply:**

```bash
docker compose -f scripts/docker/docker-compose.searxng.yml restart
```

## Troubleshooting

### Connection Refused

**Error:**

```
Local SearxNG not running at http://localhost:8080.
Start with: docker compose -f scripts/docker/docker-compose.searxng.yml up -d
```

**Cause:** Docker container not running

**Fix:**

```bash
cd scripts/docker
./start-searxng.sh
```

**Check:**

```bash
docker ps | grep anyclaude-searxng
```

### 403 Forbidden (JSON Format Disabled)

**Error:**

```
SearxNG JSON format disabled. Enable in settings.yml:
search.formats: [html, json] (HTTP 403)
```

**Cause:** SearxNG not configured to return JSON

**Fix:** Edit `scripts/docker/searxng-settings.yml`:

```yaml
search:
  formats:
    - html
    - json # Ensure this is present
```

**Restart:**

```bash
docker compose -f scripts/docker/docker-compose.searxng.yml restart
```

### Timeout After 5 Seconds

**Error:**

```
Local SearxNG timeout after 5s at http://localhost:8080
```

**Cause:** SearxNG is slow or overloaded

**Check logs:**

```bash
docker logs anyclaude-searxng
```

**Fix:**

- Check Docker resource limits (CPU/memory)
- Disable slow search engines in `searxng-settings.yml`
- Reduce number of engines queried simultaneously

### Invalid JSON Response

**Error:**

```
Invalid JSON response from SearxNG at http://localhost:8080.
Check server configuration.
```

**Cause:** SearxNG returning HTML instead of JSON

**Check response manually:**

```bash
curl 'http://localhost:8080/search?q=test&format=json'
```

**Fix:**

- Ensure `format=json` is in URL
- Check `search.formats` in settings.yml includes `json`
- Restart container

### Docker Not Running

**Error:**

```
Error: Docker is not running. Please start Docker first.
```

**Fix:**

- Start Docker Desktop (macOS/Windows)
- Start Docker daemon (Linux): `sudo systemctl start docker`

### Port Already in Use

**Error:**

```
Error response from daemon: Ports are not available:
listen tcp 127.0.0.1:8080: bind: address already in use
```

**Cause:** Another process using port 8080

**Find process:**

```bash
lsof -i :8080
```

**Fix:**

- Stop the conflicting process
- Or change SearxNG port (see "Change Port" above)

### Container Exits Immediately

**Check logs:**

```bash
docker logs anyclaude-searxng
```

**Common causes:**

- Invalid `searxng-settings.yml` syntax
- Missing required settings
- Permission issues on config file

**Fix:**

- Validate YAML syntax
- Check file permissions: `chmod 644 scripts/docker/searxng-settings.yml`
- Restart with: `./start-searxng.sh`

## Advanced Usage

### Remote SearxNG Instance

Run SearxNG on a different machine:

```bash
# On remote server (192.168.1.100)
docker run -d \
  --name searxng \
  -p 8080:8080 \
  -v $(pwd)/searxng-settings.yml:/etc/searxng/settings.yml:ro \
  ghcr.io/searxng/searxng:latest

# On AnyClaude machine
export SEARXNG_URL=http://192.168.1.100:8080
```

### IPv6 Support

```bash
export SEARXNG_URL=http://[::1]:8080
```

Edit `docker-compose.searxng.yml`:

```yaml
ports:
  - "[::1]:8080:8080"
```

### HTTPS with Reverse Proxy

Use nginx/Caddy to add HTTPS:

```nginx
# nginx example
server {
    listen 443 ssl;
    server_name searxng.local;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
export SEARXNG_URL=https://searxng.local
```

### Persistent Data (Optional)

Add volume for persistent data:

```yaml
# docker-compose.searxng.yml
volumes:
  - ./searxng-settings.yml:/etc/searxng/settings.yml:ro
  - ./searxng-data:/etc/searxng/data # Add this
```

## Performance

### Expected Performance

- **Search latency**: 200-500ms (local network)
- **Timeout**: 5 seconds (hard limit)
- **Concurrent requests**: Unlimited (no rate limits)
- **Cache**: SearxNG caches results internally

### Optimization Tips

1. **Enable fewer search engines** (faster results)
2. **Use specific engines** (e.g., `?engines=google,duckduckgo`)
3. **Increase Docker resources** (CPU/memory)
4. **Use SSD storage** (faster Docker I/O)

## Security Considerations

### Network Security

**Default:** SearxNG binds to `127.0.0.1` only (localhost)

**Not accessible from:**

- Other machines on your network
- The internet

**To expose on network** (not recommended):

```yaml
ports:
  - "0.0.0.0:8080:8080" # WARNING: Exposes to network
```

**Better:** Use firewall rules or VPN for remote access

### API Security

**No API keys needed** for local SearxNG. All searches are private by default.

**Cloud fallback:** If local SearxNG fails, cloud APIs may be used (Anthropic/Tavily/Brave). These require API keys and send queries to cloud services.

**Disable fallback** to ensure 100% local:

```json
{
  "webSearch": {
    "enableFallback": false
  }
}
```

Or unset cloud API keys:

```bash
unset ANTHROPIC_API_KEY
unset TAVILY_API_KEY
unset BRAVE_API_KEY
```

### Container Security

**Capabilities:** Minimal Linux capabilities (drops all except required)
**User:** Runs as non-root user
**Network:** Localhost only
**Volumes:** Read-only config

### Data Privacy

**Local search:** All queries stay on your machine
**SearxNG privacy:** No tracking, no logs by default
**Search engines:** SearxNG forwards queries to search engines (Google, DuckDuckGo, etc.)

**For maximum privacy:**

- Use only privacy-focused engines (DuckDuckGo, Qwant, Startpage)
- Disable Google/Bing in `searxng-settings.yml`
- Use Tor proxy (requires additional SearxNG configuration)

## Comparison: Local vs Cloud Search

| Feature            | Local SearxNG              | Cloud APIs                     |
| ------------------ | -------------------------- | ------------------------------ |
| **Privacy**        | ✅ All local               | ❌ Sends to cloud              |
| **Rate limits**    | ✅ None                    | ❌ Yes (varies by API)         |
| **API costs**      | ✅ Free                    | ❌ Paid (free tiers available) |
| **Setup**          | ⚠️ Docker required         | ✅ Just API key                |
| **Latency**        | ✅ Fast (local)            | ⚠️ Network dependent           |
| **Reliability**    | ⚠️ Single point of failure | ✅ Cloud redundancy            |
| **Search quality** | ⚠️ Depends on engines      | ✅ Optimized for AI            |
| **Maintenance**    | ⚠️ You manage              | ✅ Managed service             |

**Recommendation:**

- **Use local SearxNG** for privacy and unlimited searches
- **Enable fallback** for reliability (best of both worlds)
- **Pure local** if privacy is critical (disable fallback)

## Related Documentation

- [SearxNG Official Docs](https://docs.searxng.org/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [AnyClaude Configuration Guide](configuration.md)
- [Web Search API Comparison](../reference/web-search-comparison.md)

## See Also

- [Issue #49: Local-Only WebSearch](https://github.com/yourusername/anyclaude/issues/49)
- [CHANGELOG.md](../../CHANGELOG.md) - Feature history
- [PROJECT.md](../../PROJECT.md) - Architecture overview
