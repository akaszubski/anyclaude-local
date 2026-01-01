/**
 * Node Discovery System for MLX Cluster
 *
 * Implements automatic discovery and validation of MLX nodes in a cluster:
 * 1. Periodic discovery of available nodes from static config
 * 2. HTTP-based validation via /v1/models endpoint
 * 3. Callbacks for node lifecycle events (discovered, lost, errors)
 * 4. Timeout handling with AbortController
 * 5. Deduplication and state tracking
 *
 * @module cluster-discovery
 */

import type {
  MLXNode,
  NodeHealth,
  NodeMetrics,
  NodeCacheState,
} from './cluster-types';
import { NodeStatus } from './cluster-types';

/**
 * Discovery-specific error with structured context.
 */
export class DiscoveryError extends Error {
  public readonly code: string;
  public readonly nodeId?: string;
  public readonly url?: string;

  constructor(
    code: string,
    message: string,
    context?: { nodeId?: string; url?: string }
  ) {
    super(message);
    this.name = 'DiscoveryError';
    this.code = code;
    this.nodeId = context?.nodeId;
    this.url = context?.url;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DiscoveryError.prototype);
  }
}

/**
 * Callbacks for node discovery lifecycle events.
 */
export interface DiscoveryCallbacks {
  onNodeDiscovered?: (nodeId: string, url: string) => void;
  onNodeLost?: (nodeId: string, url: string) => void;
  onDiscoveryError?: (error: DiscoveryError) => void;
}

/**
 * Discovery configuration for ClusterDiscovery.
 *
 * Extended discovery config with fields specific to the discovery implementation:
 * - staticNodes: List of static node URLs (for 'static' mode)
 * - refreshIntervalMs: How often to refresh node list (default: 30000ms)
 * - validationTimeoutMs: Timeout for node validation requests (default: 5000ms)
 *
 * Also includes standard fields from base DiscoveryConfig:
 * - mode: Discovery method ('static', 'dns', or 'kubernetes')
 * - dnsName, port, namespace, serviceLabel: For DNS/K8s modes
 */
export interface DiscoveryConfig {
  readonly mode: 'static' | 'dns' | 'kubernetes';
  readonly staticNodes?: Array<{ url: string; id: string }>;
  readonly refreshIntervalMs?: number;
  readonly validationTimeoutMs?: number;
  readonly dnsName?: string;
  readonly port?: number;
  readonly namespace?: string;
  readonly serviceLabel?: string;
}

/**
 * ClusterDiscovery manages periodic discovery and validation of MLX nodes.
 *
 * Features:
 * - Periodic refresh with configurable interval
 * - HTTP validation of nodes via /v1/models endpoint
 * - Automatic timeout handling with AbortController
 * - Node deduplication by ID and URL
 * - Lifecycle callbacks for monitoring
 * - Overlap prevention with isDiscovering flag
 */
export class ClusterDiscovery {
  private config: DiscoveryConfig;
  private callbacks: DiscoveryCallbacks;
  private discoveredNodes: Map<string, MLXNode> = new Map();
  private isDiscovering: boolean = false;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  // Default values
  private static readonly DEFAULT_REFRESH_INTERVAL_MS = 30000; // 30 seconds
  private static readonly DEFAULT_VALIDATION_TIMEOUT_MS = 5000; // 5 seconds

  constructor(config: DiscoveryConfig, callbacks?: DiscoveryCallbacks) {
    this.validateConfig(config);
    this.config = {
      ...config,
      refreshIntervalMs:
        config.refreshIntervalMs ?? ClusterDiscovery.DEFAULT_REFRESH_INTERVAL_MS,
      validationTimeoutMs:
        config.validationTimeoutMs ?? ClusterDiscovery.DEFAULT_VALIDATION_TIMEOUT_MS,
    };
    this.callbacks = callbacks || {};
  }

  /**
   * Validate configuration at construction time.
   */
  private validateConfig(config: DiscoveryConfig): void {
    // Validate mode
    if (!['static', 'dns', 'kubernetes'].includes(config.mode)) {
      throw new Error(`Invalid discovery mode: ${config.mode}`);
    }

    // Validate static mode requirements
    if (config.mode === 'static') {
      if (!config.staticNodes || !Array.isArray(config.staticNodes)) {
        throw new Error('Static discovery mode requires staticNodes array');
      }
      if (config.staticNodes.length === 0) {
        throw new Error('staticNodes array cannot be empty');
      }
    }

    // Validate refresh interval
    if (
      config.refreshIntervalMs !== undefined &&
      config.refreshIntervalMs < 0
    ) {
      throw new Error('refreshIntervalMs must be non-negative');
    }

    // Validate validation timeout
    if (
      config.validationTimeoutMs !== undefined &&
      config.validationTimeoutMs < 0
    ) {
      throw new Error('validationTimeoutMs must be non-negative');
    }
  }

  /**
   * Start periodic discovery.
   */
  public async start(): Promise<void> {
    if (this.running) {
      throw new Error('Discovery is already running');
    }

    this.running = true;

    // Perform initial discovery immediately
    await this.refreshNodes();

    // Schedule periodic refreshes using recursive setTimeout
    this.scheduleNextRefresh();
  }

  /**
   * Schedule next refresh using setTimeout (not setInterval).
   */
  private scheduleNextRefresh(): void {
    if (!this.running) {
      return;
    }

    this.discoveryTimer = setTimeout(() => {
      // Execute refresh asynchronously
      this.refreshNodes().then(() => {
        this.scheduleNextRefresh(); // Recursive scheduling
      });
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop discovery and clear all state.
   */
  public stop(): void {
    this.running = false;

    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  /**
   * Check if discovery is currently running.
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Get all currently discovered nodes.
   */
  public getDiscoveredNodes(): MLXNode[] {
    return Array.from(this.discoveredNodes.values());
  }

  /**
   * Discover candidate node URLs from config.
   */
  private discoverNodes(): Array<{ url: string; id: string }> {
    if (this.config.mode === 'static' && this.config.staticNodes) {
      // Deduplicate by ID and URL
      const seen = new Set<string>();
      const unique: Array<{ url: string; id: string }> = [];

      for (const node of this.config.staticNodes) {
        const key = `${node.id}|${node.url}`;
        if (!seen.has(key)) {
          // Also check for duplicate IDs or URLs separately
          const hasDuplicateId = unique.some((n) => n.id === node.id);
          const hasDuplicateUrl = unique.some((n) => n.url === node.url);

          if (!hasDuplicateId && !hasDuplicateUrl) {
            seen.add(key);
            unique.push(node);
          }
        }
      }

      return unique;
    }

    // TODO: Implement DNS and Kubernetes discovery modes
    return [];
  }

  /**
   * Validate a single node via HTTP request to /v1/models.
   *
   * Returns an MLXNode object if validation succeeds, null otherwise.
   */
  private async validateNode(
    url: string,
    id: string,
    timeout?: number
  ): Promise<MLXNode | null> {
    const effectiveTimeout =
      timeout ?? this.config.validationTimeoutMs ?? ClusterDiscovery.DEFAULT_VALIDATION_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const endpoint = `${url}/v1/models`;
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Reject non-2xx responses
      if (!response.ok || response.status < 200 || response.status >= 300) {
        return null;
      }

      // Parse and validate response JSON
      const data: any = await response.json();
      if (!data || !data.data || !Array.isArray(data.data)) {
        // Invalid response structure
        return null;
      }

      // Create MLXNode with default values
      const node: MLXNode = {
        id,
        url,
        status: NodeStatus.HEALTHY,
        health: {
          lastCheck: Date.now(),
          consecutiveFailures: 0,
          avgResponseTime: 0,
          errorRate: 0,
        },
        cache: {
          tokens: 0,
          systemPromptHash: '',
          lastUpdated: Date.now(),
        },
        metrics: {
          requestsInFlight: 0,
          totalRequests: 0,
          cacheHitRate: 0,
          avgLatency: 0,
        },
      };

      return node;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Determine error type
      if (error.name === 'AbortError') {
        // Timeout
        const discoveryError = new DiscoveryError(
          'NODE_TIMEOUT',
          `Node validation timed out after ${effectiveTimeout}ms`,
          { nodeId: id, url }
        );
        try {
          this.callbacks.onDiscoveryError?.(discoveryError);
        } catch (callbackError) {
          // Silently ignore callback errors
        }
      } else if (
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('getaddrinfo')
      ) {
        // DNS error
        const discoveryError = new DiscoveryError(
          'NETWORK_ERROR',
          `DNS resolution failed: ${error.message}`,
          { nodeId: id, url }
        );
        try {
          this.callbacks.onDiscoveryError?.(discoveryError);
        } catch (callbackError) {
          // Silently ignore callback errors
        }
      } else {
        // Generic network/connection error
        const discoveryError = new DiscoveryError(
          'NETWORK_ERROR',
          `Network error: ${error.message}`,
          { nodeId: id, url }
        );
        try {
          this.callbacks.onDiscoveryError?.(discoveryError);
        } catch (callbackError) {
          // Silently ignore callback errors
        }
      }

      return null;
    }
  }

  /**
   * Main discovery refresh loop.
   *
   * Discovers candidate nodes, validates each, detects changes, and fires callbacks.
   */
  private async refreshNodes(): Promise<void> {
    // Prevent overlapping refreshes
    if (this.isDiscovering) {
      return;
    }

    this.isDiscovering = true;

    try {
      // Discover candidate nodes
      const candidates = this.discoverNodes();

      // Validate all candidates
      const validationPromises = candidates.map((candidate) =>
        this.validateNode(candidate.url, candidate.id)
      );

      const results = await Promise.all(validationPromises);

      // Build new discovered nodes map
      const newNodes = new Map<string, MLXNode>();
      for (const node of results) {
        if (node) {
          newNodes.set(node.id, node);
        }
      }

      // Detect newly discovered nodes
      for (const [nodeId, node] of Array.from(newNodes.entries())) {
        if (!this.discoveredNodes.has(nodeId)) {
          try {
            this.callbacks.onNodeDiscovered?.(nodeId, node.url);
          } catch (error) {
            // Silently ignore callback errors
          }
        }
      }

      // Detect lost nodes
      for (const [nodeId, node] of Array.from(this.discoveredNodes.entries())) {
        if (!newNodes.has(nodeId)) {
          try {
            this.callbacks.onNodeLost?.(nodeId, node.url);
          } catch (error) {
            // Silently ignore callback errors
          }
        }
      }

      // Update discovered nodes
      this.discoveredNodes = newNodes;
    } finally {
      this.isDiscovering = false;
    }
  }
}
