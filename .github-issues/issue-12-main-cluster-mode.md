## Summary

Update src/main.ts to support the mlx-cluster backend mode.

## Background

The main entry point needs to recognize mlx-cluster as a valid mode and initialize the ClusterManager.

## Requirements

### Mode Detection

Add "mlx-cluster" to valid modes in:

- AnyclaudeMode type (in trace-logger.ts)
- parseModeFromArgs()
- detectMode()

### Configuration

Add mlx-cluster to AnyclaudeConfig interface:

```
backends?: {
  lmstudio?: {...},
  claude?: {...},
  openrouter?: {...},
  "mlx-cluster"?: MLXClusterConfig
}
```

### Initialization

When mode is mlx-cluster:

1. Parse cluster config from .anyclauderc.json
2. Call initializeCluster(config)
3. Wait for cluster to be ready
4. Pass cluster provider to createAnthropicProxy

### Provider Integration

The providers object passed to createAnthropicProxy needs:

- "mlx-cluster": null initially (ClusterManager handles node selection)
- Or: Pass ClusterManager itself and let proxy call selectNode()

## File Locations

- Modify: src/main.ts
- Modify: src/trace-logger.ts (add mlx-cluster to AnyclaudeMode)

## Dependencies

- src/cluster/cluster-manager.ts
- src/cluster/cluster-config.ts

## Acceptance Criteria

- [ ] --mode=mlx-cluster recognized by CLI
- [ ] ANYCLAUDE_MODE=mlx-cluster works
- [ ] Config file backend: "mlx-cluster" works
- [ ] ClusterManager initialized before proxy
- [ ] Proper error if cluster config missing
- [ ] Startup logs show cluster status
- [ ] Existing modes still work (no regression)

## Labels

phase-3, integration, main
