# MLX Cluster Configuration API Reference

**Module**: `src/cluster/cluster-config.ts` (654 lines)
**Tests**: `tests/unit/cluster-config.test.ts` (97 tests, 1317 lines)
**Status**: Production-ready

---

## Overview

The cluster configuration module provides comprehensive configuration parsing and validation for MLX cluster management. It supports loading configuration from JSON files, applying environment variable overrides, and validating all settings against strict rules.

**Key Features**:
- Multi-source configuration (file + defaults + environment variables)
- Deep object merging for nested configurations
- Comprehensive validation with detailed error reporting
- Environment variable precedence system
- Production-ready default values
- Type-safe result types

---

## API Functions

### parseClusterConfig(filePath?: string): ClusterConfigResult

**Main entry point** for configuration parsing. Performs three-step process: load file, merge with defaults, apply environment overrides.

**Parameters**:
- `filePath` (optional): Path to JSON configuration file. If omitted, uses only defaults and environment variables.

**Returns**: `ClusterConfigResult` object with:
```typescript
{
  success: boolean;           // true if parsing succeeded
  config?: MLXClusterConfig;  // Configuration object (if success)
  error?: ClusterConfigError; // Error details (if !success)
  validation?: ValidationResult; // Validation warnings
}
```

**Errors**:
- `PARSE_ERROR`: JSON parsing failed
- `FILE_NOT_FOUND`: Configuration file does not exist
- Any error from `applyEnvOverrides()`

**Example**:
```typescript
const result = parseClusterConfig('/etc/mlx-cluster.json');
if (result.success) {
  console.log('Cluster nodes:', result.config.discovery.nodes.length);
  if (result.validation?.warnings.length) {
    console.warn('Config warnings:', result.validation.warnings);
  }
} else {
  console.error(`Config error [${result.error.code}]:`, result.error.message);
}
```

---

### loadConfigFile(filePath: string): MLXClusterConfig

**Load and parse** a JSON configuration file.

**Parameters**:
- `filePath`: Path to JSON file (absolute or relative)

**Returns**: Parsed configuration object (MLXClusterConfig)

**Throws**:
- `ClusterConfigError` with code:
  - `FILE_NOT_FOUND`: File does not exist
  - `PARSE_ERROR`: Invalid JSON syntax
  - `INVALID_CONFIG`: Parsed object is not a valid configuration

**Example**:
```typescript
try {
  const config = loadConfigFile('./cluster.json');
  console.log('Loaded:', config);
} catch (err) {
  if (err.code === 'FILE_NOT_FOUND') {
    console.log('Using default configuration');
  }
}
```

---

### mergeWithDefaults(userConfig: Partial<MLXClusterConfig>): MLXClusterConfig

**Deep merge** user configuration with production default values.

**Parameters**:
- `userConfig`: Partial configuration to merge (can omit any fields)

**Returns**: Complete configuration with all defaults applied

**Behavior**:
- User values override defaults for every field
- Nested objects are merged recursively (not replaced)
- Arrays are replaced entirely (not merged)
- Missing required fields are populated from defaults

**Example**:
```typescript
const user = {
  discovery: { nodes: [{ id: 'node1', url: 'http://localhost:8082/v1' }] }
};
const full = mergeWithDefaults(user);
// full.health.checkIntervalMs === 30000 (from defaults)
// full.discovery.nodes[0].id === 'node1' (from user)
// full.routing.strategy === 'round-robin' (from defaults)
```

---

### applyEnvOverrides(config: MLXClusterConfig): MLXClusterConfig

**Apply environment variable overrides** to configuration.

**Supported Environment Variables**:

| Variable | Type | Description |
|----------|------|-------------|
| `MLX_CLUSTER_ENABLED` | boolean | Enable/disable clustering (true/false) |
| `MLX_CLUSTER_NODES` | JSON array | Override discovery.nodes |
| `MLX_CLUSTER_STRATEGY` | string | Override routing.strategy |
| `MLX_CLUSTER_HEALTH_INTERVAL` | number | Override health.checkIntervalMs (ms) |

**Environment Variable Details**:

#### MLX_CLUSTER_ENABLED
- **Format**: `true` or `false` (case-insensitive)
- **Effect**: Sets top-level `enabled` flag
- **Example**: `MLX_CLUSTER_ENABLED=true`
- **Error**: Throws if not "true" or "false"

#### MLX_CLUSTER_NODES
- **Format**: JSON array of node objects
- **Schema**: `[{"id":"string","url":"http(s)://..."},...]`
- **Effect**: Overrides `discovery.nodes`
- **Example**: `MLX_CLUSTER_NODES='[{"id":"node1","url":"http://localhost:8082/v1"}]'`
- **Error**: Throws if not valid JSON array or array elements don't have id/url

#### MLX_CLUSTER_STRATEGY
- **Format**: One of: `round-robin`, `least-loaded`, `cache-aware`, `latency-based`
- **Effect**: Overrides `routing.strategy`
- **Example**: `MLX_CLUSTER_STRATEGY=cache-aware`
- **Error**: Throws if not a valid strategy

#### MLX_CLUSTER_HEALTH_INTERVAL
- **Format**: Integer milliseconds (must be positive)
- **Effect**: Overrides `health.checkIntervalMs`
- **Example**: `MLX_CLUSTER_HEALTH_INTERVAL=15000`
- **Error**: Throws if not a positive integer

**Returns**: New configuration with environment overrides applied

**Throws**: `Error` with details if environment variable has invalid format

**Example**:
```typescript
process.env.MLX_CLUSTER_STRATEGY = 'cache-aware';
process.env.MLX_CLUSTER_HEALTH_INTERVAL = '15000';

const config = applyEnvOverrides(baseConfig);
console.log(config.routing.strategy); // 'cache-aware'
console.log(config.health.checkIntervalMs); // 15000
```

---

### validateClusterConfig(config: Partial<MLXClusterConfig>): ValidationResult

**Comprehensive validation** of cluster configuration.

**Parameters**:
- `config`: Configuration object to validate (can be partial)

**Returns**: `ValidationResult` with:
```typescript
{
  isValid: boolean;              // true if no errors
  missingRequired: string[];     // Required fields that are missing
  warnings: string[];            // Non-fatal warnings
  errors: string[];              // Validation errors
}
```

**Validation Rules**:

#### Discovery Configuration
- **Required**: `discovery` field must exist
- **Static Mode**:
  - At least one node required in `discovery.nodes`
  - Each node URL must start with `http://` or `https://`
  - Warning if node URL uses `http://` (not encrypted)
- **DNS Mode**:
  - Requires: `dnsName`, `namespace`, `serviceLabel`
- **Kubernetes Mode**:
  - Requires: `namespace`, `serviceLabel`

#### Routing Configuration
- **Strategy**: Must be one of: `round-robin`, `least-loaded`, `cache-aware`, `latency-based`
- **Retries**: `maxRetries` must be non-negative
  - Warning if `maxRetries > 5` (slow failure)
- **Delay**: `retryDelayMs` must be non-negative

#### Health Configuration
- **Check Interval**: `checkIntervalMs` must be positive
  - Warning if `>= 60000` (slow failure detection)
- **Timeout**: `timeoutMs` must be positive
- **Failures**: `maxConsecutiveFailures` must be positive
- **Threshold**: `unhealthyThreshold` must be between 0.0 and 1.0

#### Cache Configuration
- **Age**: `maxCacheAgeSec` must be positive
- **Size**: `maxCacheSizeTokens` must be positive
- **Hit Rate**: `minCacheHitRate` must be between 0.0 and 1.0

**Example**:
```typescript
const result = validateClusterConfig(config);
if (!result.isValid) {
  console.error('Validation failed:');
  console.error('Missing:', result.missingRequired);
  console.error('Errors:', result.errors);
}
if (result.warnings.length) {
  console.warn('Warnings:', result.warnings);
}
```

---

## Error Handling

### ClusterConfigError

Custom error class for configuration-related issues.

**Properties**:
- `message` (string): Human-readable error message
- `code` (string): Error code identifying the issue type
- `context` (object, optional): Additional debugging information

**Standard Error Codes**:

| Code | Meaning | Context Fields |
|------|---------|-----------------|
| `FILE_NOT_FOUND` | Configuration file not found | `filePath` |
| `PARSE_ERROR` | JSON parsing failed | `filePath`, `details` |
| `INVALID_CONFIG` | Configuration structure is invalid | `reason` |
| `MISSING_NODES` | No nodes in static mode | `mode` |
| `INVALID_URL` | Node URL is malformed | `nodeId`, `url`, `reason` |
| `INVALID_STRATEGY` | Unknown load balance strategy | `strategy`, `validStrategies` |

**Example**:
```typescript
try {
  const result = parseClusterConfig('./cluster.json');
  if (!result.success) {
    console.error(`Error: ${result.error.message}`);
    console.error(`Code: ${result.error.code}`);
    if (result.error.context?.filePath) {
      console.error(`File: ${result.error.context.filePath}`);
    }
  }
} catch (err) {
  console.error('Unexpected error:', err);
}
```

---

## Configuration Structure

### Default Values

```typescript
{
  enabled: false,
  discovery: {
    mode: 'static',
    nodes: []
  },
  routing: {
    strategy: 'round-robin',
    maxRetries: 1,
    retryDelayMs: 100
  },
  health: {
    checkIntervalMs: 30000,    // 30 seconds
    timeoutMs: 5000,           // 5 seconds
    maxConsecutiveFailures: 3,
    unhealthyThreshold: 0.5
  },
  cache: {
    maxCacheAgeSec: 300,       // 5 minutes
    maxCacheSizeTokens: 1000000, // 1M tokens
    minCacheHitRate: 0.7
  }
}
```

### Configuration File Example

```json
{
  "enabled": true,
  "discovery": {
    "mode": "static",
    "nodes": [
      {
        "id": "gpu-node-1",
        "url": "http://gpu1.example.com:8082/v1"
      },
      {
        "id": "gpu-node-2",
        "url": "http://gpu2.example.com:8082/v1"
      }
    ]
  },
  "routing": {
    "strategy": "cache-aware",
    "maxRetries": 2,
    "retryDelayMs": 200
  },
  "health": {
    "checkIntervalMs": 15000,
    "timeoutMs": 5000,
    "maxConsecutiveFailures": 3,
    "unhealthyThreshold": 0.5
  },
  "cache": {
    "maxCacheAgeSec": 300,
    "maxCacheSizeTokens": 1000000,
    "minCacheHitRate": 0.7
  }
}
```

---

## Usage Patterns

### Basic Setup

```typescript
// Load from file with environment overrides
const result = parseClusterConfig('/etc/mlx/cluster.json');
if (!result.success) {
  console.error('Failed to load cluster config:', result.error.message);
  process.exit(1);
}
const config = result.config;
```

### Environment-Only Configuration

```typescript
// Load defaults + environment variables (no file)
process.env.MLX_CLUSTER_ENABLED = 'true';
process.env.MLX_CLUSTER_NODES = '[{"id":"node1","url":"http://localhost:8082/v1"}]';
process.env.MLX_CLUSTER_STRATEGY = 'cache-aware';

const result = parseClusterConfig(); // No file path
if (result.success) {
  console.log('Cluster configured from environment');
}
```

### Configuration with Validation

```typescript
// Load and validate
const result = parseClusterConfig('./cluster.json');
if (result.success) {
  const validation = validateClusterConfig(result.config);

  if (!validation.isValid) {
    console.error('Validation failed:');
    for (const error of validation.errors) {
      console.error('  -', error);
    }
    process.exit(1);
  }

  for (const warning of validation.warnings) {
    console.warn('  -', warning);
  }
}
```

### Debugging Configuration Issues

```typescript
// Debug config loading
const result = parseClusterConfig('./cluster.json');

if (!result.success) {
  console.error('Config Error:');
  console.error('  Message:', result.error.message);
  console.error('  Code:', result.error.code);
  if (result.error.context) {
    console.error('  Context:', JSON.stringify(result.error.context, null, 2));
  }
}

// Debug validation warnings
if (result.validation?.warnings.length) {
  console.warn('Warnings:');
  for (const warning of result.validation.warnings) {
    console.warn('  -', warning);
  }
}
```

---

## Integration Points

### With Cluster Manager

The configuration module is designed to integrate with a cluster manager that handles:
- Load balancing decisions based on strategy
- Health check monitoring
- Node routing and failover

Example integration:
```typescript
const configResult = parseClusterConfig('./cluster.json');
if (configResult.success) {
  const manager = new ClusterManager(configResult.config);
  await manager.initialize();
  // Use manager to route requests
}
```

### With Type System

The configuration uses types from `cluster-types.ts`:
```typescript
import {
  MLXClusterConfig,
  LoadBalanceStrategy,
  HealthConfig,
  CacheConfig
} from './cluster-types';
```

---

## Testing

**Test Coverage**: 97 comprehensive unit tests

**Test Categories**:
1. **Configuration Parsing** (15 tests)
   - File loading success/failure
   - Default application
   - Environment variable overrides

2. **File Operations** (8 tests)
   - Valid/invalid JSON
   - Missing files
   - Path resolution

3. **Deep Merging** (12 tests)
   - Nested object merging
   - Array replacement
   - Partial configurations

4. **Environment Overrides** (18 tests)
   - All 4 environment variables
   - Validation errors
   - Precedence handling

5. **Validation** (28 tests)
   - All validation rules
   - Warning conditions
   - Edge cases and boundaries

6. **Error Handling** (6 tests)
   - Error codes
   - Context information
   - Stack traces

7. **Integration** (10 tests)
   - Full parsing pipeline
   - Multiple features combined
   - Real-world scenarios

---

## Performance Notes

- **File I/O**: Synchronous (blocking) - suitable for startup configuration
- **Parsing**: O(n) where n = configuration size
- **Merging**: O(n) deep merge with recursive object traversal
- **Validation**: O(n) single pass over all fields

For typical configurations (<10KB), operations complete in <1ms.

---

## See Also

- [MLX Cluster Type System](../architecture/mlx-cluster-system.md)
- [CLAUDE.md - Environment Variables](../../CLAUDE.md#environment-variables)
- [CHANGELOG.md - Issue #23](../../CHANGELOG.md#issue-23-mlx-cluster-configuration-parser)
