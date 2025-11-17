# Metrics Endpoint Authentication Guide

**Added:** Phase 3 Production Hardening (VUL-006 fix)
**Status:** Production-ready

---

## Overview

The `/v1/metrics` endpoint is now secured with Bearer token authentication to prevent unauthorized access to performance metrics.

## Quick Start

### 1. Generate API Key

```bash
# Generate a secure random key
export METRICS_API_KEY=$(openssl rand -hex 32)

# Or use your own key
export METRICS_API_KEY="my-secret-metrics-key"
```

### 2. Start Server

```bash
# Server will use METRICS_API_KEY from environment
anyclaude
```

### 3. Access Metrics

```bash
# Using curl
curl -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics

# Using httpie
http http://localhost:8080/v1/metrics \
  "Authorization: Bearer $METRICS_API_KEY"
```

---

## Environment Variables

### `METRICS_API_KEY`

**Type:** String
**Required:** No (defaults to empty string)
**Default:** `""`

**Behavior:**

- **If set:** Only requests with matching Bearer token can access metrics
- **If not set:** All requests return 403 Forbidden

**Security Note:** In production, ALWAYS set this variable to a strong random key.

---

## API Usage

### Request Format

```http
GET /v1/metrics?format=json HTTP/1.1
Host: localhost:8080
Authorization: Bearer your-secret-key-here
```

### Response Formats

#### JSON (default)

```bash
curl -H "Authorization: Bearer $METRICS_API_KEY" \
  "http://localhost:8080/v1/metrics?format=json"
```

Response:

```json
{
  "timestamp": 1700000000.123,
  "uptime_seconds": 3600.5,
  "cache": {
    "cache_hits": 150,
    "cache_misses": 50,
    "hit_rate": 0.75
  },
  "latency": {
    "p50": 125.5,
    "p95": 450.2,
    "p99": 890.1,
    "count": 200
  },
  "memory": {
    "current_mb": 512.3,
    "peak_mb": 678.9,
    "growth_percent": 15.2
  },
  "throughput": {
    "total_requests": 200,
    "requests_per_second": 5.5
  }
}
```

#### Prometheus

```bash
curl -H "Authorization: Bearer $METRICS_API_KEY" \
  "http://localhost:8080/v1/metrics?format=prometheus"
```

Response:

```prometheus
# HELP cache_hit_total Total number of cache hits
# TYPE cache_hit_total counter
cache_hit_total 150

# HELP cache_miss_total Total number of cache misses
# TYPE cache_miss_total counter
cache_miss_total 50

# HELP cache_hit_rate Cache hit rate (0.0-1.0)
# TYPE cache_hit_rate gauge
cache_hit_rate 0.7500

# ... more metrics
```

---

## Error Responses

### 403 Forbidden

**Cause:** Missing or invalid Authorization header

```bash
# No auth header
curl http://localhost:8080/v1/metrics
```

Response:

```json
{
  "detail": "Forbidden"
}
```

**Fix:** Add correct Authorization header

---

## Security Best Practices

### 1. Use Strong Keys

```bash
# ✅ Good: Random 32-byte key
export METRICS_API_KEY=$(openssl rand -hex 32)

# ❌ Bad: Weak key
export METRICS_API_KEY="password123"
```

### 2. Rotate Keys Regularly

```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Update environment
export METRICS_API_KEY="$NEW_KEY"

# Restart server
```

### 3. Store Keys Securely

```bash
# ✅ Good: Use secrets manager
export METRICS_API_KEY=$(aws secretsmanager get-secret-value --secret-id metrics-api-key --query SecretString --output text)

# ❌ Bad: Hardcode in scripts
export METRICS_API_KEY="hardcoded-key-123"
```

### 4. Limit Access

```bash
# ✅ Good: Firewall rules
iptables -A INPUT -p tcp --dport 8080 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 8080 -j DROP

# ✅ Good: Reverse proxy with additional auth
nginx -c /etc/nginx/nginx.conf  # With IP allowlist
```

---

## Integration Examples

### Python

```python
import requests

metrics_key = os.getenv("METRICS_API_KEY")
headers = {"Authorization": f"Bearer {metrics_key}"}

response = requests.get(
    "http://localhost:8080/v1/metrics",
    headers=headers
)

metrics = response.json()
print(f"Cache hit rate: {metrics['cache']['hit_rate']:.2%}")
```

### curl + jq

```bash
#!/bin/bash
METRICS_API_KEY="your-key"

# Get P95 latency
curl -s -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics | \
  jq -r '.latency.p95'

# Get cache hit rate
curl -s -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics | \
  jq -r '.cache.hit_rate'
```

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: "mlx-server"
    metrics_path: "/v1/metrics"
    params:
      format: ["prometheus"]
    static_configs:
      - targets: ["localhost:8080"]
    bearer_token: "your-secret-key-here"
```

### Grafana

```bash
# Add data source
curl -X POST http://grafana:3000/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MLX Server",
    "type": "prometheus",
    "url": "http://localhost:8080/v1/metrics?format=prometheus",
    "access": "proxy",
    "jsonData": {
      "httpHeaderName1": "Authorization"
    },
    "secureJsonData": {
      "httpHeaderValue1": "Bearer your-secret-key"
    }
  }'
```

---

## Troubleshooting

### Issue: 403 Forbidden

**Symptoms:** All requests return 403

**Causes:**

1. `METRICS_API_KEY` not set on server
2. Wrong key in Authorization header
3. Missing `Bearer` prefix

**Solutions:**

```bash
# Check server environment
echo $METRICS_API_KEY

# Check request format
curl -v -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics

# Verify Bearer prefix
curl -H "Authorization: Bearer my-key" ...  # ✅ Correct
curl -H "Authorization: my-key" ...         # ❌ Wrong
```

### Issue: Empty Metrics

**Symptoms:** Metrics return all zeros

**Cause:** Server just started, no requests processed yet

**Solution:** Make some requests, then check metrics

```bash
# Make some requests
curl http://localhost:8080/v1/chat/completions ...
curl http://localhost:8080/v1/chat/completions ...

# Check metrics
curl -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics
```

---

## Migration Guide

### Existing Deployments

If you were using the metrics endpoint before Phase 3:

**Before (no auth):**

```bash
curl http://localhost:8080/v1/metrics
```

**After (with auth):**

```bash
# 1. Set API key
export METRICS_API_KEY=$(openssl rand -hex 32)

# 2. Update all scripts/monitors to use auth
curl -H "Authorization: Bearer $METRICS_API_KEY" \
  http://localhost:8080/v1/metrics

# 3. Restart server
anyclaude
```

### No Downtime Migration

```bash
# 1. Start new server with auth
export METRICS_API_KEY="new-key"
anyclaude --port 8081 &

# 2. Update monitoring to use new port + auth
# ... update Prometheus/Grafana config

# 3. Stop old server
pkill -f "anyclaude.*8080"

# 4. Start new server on old port
anyclaude --port 8080
```

---

## Related Documentation

- [Production Hardening](../architecture/production-hardening.md)
- [Security Audit Report](../../PHASE-3-SECURITY-FIXES-COMPLETE.md)
- [Metrics Collector](../architecture/metrics-collector.md)

---

**Last Updated:** 2025-11-17
**Version:** v2.2.0+
**Status:** Production-ready
