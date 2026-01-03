# Local-Only Web Search with SearxNG

Privacy-first web search using self-hosted SearxNG for AnyClaude. No cloud dependencies, no rate limits, full control.

## Overview

AnyClaude supports local web search via [SearxNG](https://github.com/searxng/searxng), a privacy-respecting metasearch engine. When enabled, web searches happen on your local machine instead of calling cloud APIs.

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
  - "127.0.0.1:9999:8080"  # Change 9999 to your port
```

Update environment variable:
```bash
export SEARXNG_URL=http://localhost:9999
```

### Security: Change Secret Key

Edit `scripts/docker/searxng-settings.yml`:

```yaml
server:
  secret_key: "your-random-string-here"  # Generate with: openssl rand -hex 32
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
    - json  # Ensure this is present
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
  - ./searxng-data:/etc/searxng/data  # Add this
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
  - "0.0.0.0:8080:8080"  # WARNING: Exposes to network
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

| Feature | Local SearxNG | Cloud APIs |
|---------|---------------|------------|
| **Privacy** | ✅ All local | ❌ Sends to cloud |
| **Rate limits** | ✅ None | ❌ Yes (varies by API) |
| **API costs** | ✅ Free | ❌ Paid (free tiers available) |
| **Setup** | ⚠️ Docker required | ✅ Just API key |
| **Latency** | ✅ Fast (local) | ⚠️ Network dependent |
| **Reliability** | ⚠️ Single point of failure | ✅ Cloud redundancy |
| **Search quality** | ⚠️ Depends on engines | ✅ Optimized for AI |
| **Maintenance** | ⚠️ You manage | ✅ Managed service |

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
