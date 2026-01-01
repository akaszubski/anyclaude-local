## Summary

Create configuration parsing for the MLX cluster backend in .anyclauderc.json.

## Background

The cluster needs configuration for node discovery, routing strategy, cache settings, and health checks.

## Requirements

### Configuration Schema

```json
{
  "backend": "mlx-cluster",
  "backends": {
    "mlx-cluster": {
      "enabled": true,
      "discovery": {
        "method": "static",
        "staticNodes": [
          { "id": "mac-1", "url": "http://192.168.1.100:8081", "weight": 1.0 }
        ]
      },
      "routing": {
        "strategy": "cache-affinity",
        "stickySession": true,
        "maxRetries": 2
      },
      "cache": {
        "systemPromptWarmup": true,
        "warmupOnDiscovery": true
      },
      "health": {
        "checkInterval": 10000,
        "timeout": 5000,
        "failureThreshold": 3
      }
    }
  }
}
```

### Environment Variable Overrides

- MLX_CLUSTER_NODES: comma-separated URLs
- MLX_CLUSTER_STRATEGY: routing strategy
- MLX_CLUSTER_HEALTH_INTERVAL: health check interval

### Functions to Implement

1. parseClusterConfig(config: AnyclaudeConfig): MLXClusterConfig
2. validateClusterConfig(config: MLXClusterConfig): ValidationResult
3. mergeWithDefaults(partial: Partial<MLXClusterConfig>): MLXClusterConfig
4. applyEnvOverrides(config: MLXClusterConfig): MLXClusterConfig

## File Location

src/cluster/cluster-config.ts

## Dependencies

- src/cluster/cluster-types.ts

## Acceptance Criteria

- [ ] Parse cluster config from .anyclauderc.json
- [ ] Validate required fields (at least one node)
- [ ] Apply sensible defaults for optional fields
- [ ] Environment variable overrides work
- [ ] Clear error messages for invalid config
- [ ] Unit tests for parsing and validation

## Labels

phase-2, cluster, configuration
