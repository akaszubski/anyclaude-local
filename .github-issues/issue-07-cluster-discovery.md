## Summary

Create node discovery mechanism for finding MLX worker nodes in the cluster.

## Background

The cluster needs to discover available worker nodes, either from static configuration or via mDNS service discovery.

## Requirements

### Discovery Methods

1. Static: Use nodes defined in configuration
2. mDNS: Discover nodes advertising \_mlx-inference.\_tcp service (future)

### Functions to Implement

1. discoverNodes(config: DiscoveryConfig): Promise<NodeStatus[]>
2. validateNode(url: string): Promise<boolean> - Check if node is reachable
3. refreshNodes(): Promise<void> - Re-discover nodes periodically

### Node Validation

When discovering a node, validate:

- HTTP connectivity to /v1/models endpoint
- Model is loaded and ready
- Cache state endpoint responds

### Events

- onNodeDiscovered(node: NodeStatus)
- onNodeLost(nodeId: string)
- onDiscoveryError(error: Error)

## File Location

src/cluster/cluster-discovery.ts

## Dependencies

- src/cluster/cluster-types.ts
- src/cluster/cluster-config.ts

## Acceptance Criteria

- [ ] Static discovery works with configured nodes
- [ ] Node validation confirms reachability
- [ ] Periodic refresh finds new/lost nodes
- [ ] Graceful handling of unreachable nodes
- [ ] Events emitted for discovery changes
- [ ] Timeout handling for slow nodes
- [ ] Unit tests with mock nodes

## Labels

phase-2, cluster, discovery
