## Summary

Update .anyclauderc.example.json with MLX cluster configuration example.

## Background

Users need a reference configuration for setting up the MLX cluster backend.

## Requirements

### Add Cluster Config Section

```json
{
  "backend": "mlx-cluster",
  "backends": {
    "mlx-cluster": {
      "enabled": true,
      "description": "Distributed MLX inference across multiple Macs",
      "discovery": {
        "method": "static",
        "staticNodes": [
          {
            "id": "mac-studio-1",
            "url": "http://192.168.1.100:8081",
            "weight": 1.0,
            "tags": ["primary", "high-memory"]
          },
          {
            "id": "macbook-pro-1",
            "url": "http://192.168.1.101:8081",
            "weight": 0.8,
            "tags": ["secondary"]
          }
        ],
        "refreshInterval": 30000
      },
      "routing": {
        "strategy": "cache-affinity",
        "stickySession": true,
        "stickyTTL": 300000,
        "maxRetries": 2
      },
      "cache": {
        "systemPromptWarmup": true,
        "warmupOnDiscovery": true,
        "warmupParallelism": 2
      },
      "health": {
        "checkInterval": 10000,
        "timeout": 5000,
        "failureThreshold": 3,
        "recoveryThreshold": 2
      }
    }
  }
}
```

### Documentation Comments

Add inline comments explaining:

- Node configuration options
- Routing strategies
- Cache warmup behavior
- Health check tuning

## File Location

Modify: .anyclauderc.example.json

## Acceptance Criteria

- [ ] Full cluster configuration example
- [ ] All options documented with comments
- [ ] Valid JSON (parseable)
- [ ] Matches actual config schema
- [ ] README.md updated with cluster setup guide

## Labels

phase-3, documentation, configuration
