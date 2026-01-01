/**
 * KV cache coordination for MLX cluster nodes.
 *
 * This module provides:
 * 1. CacheRegistry - Tracks cache state per node with hash indexing
 * 2. CacheWarmup - Warms up nodes with system prompts (parallel with concurrency control)
 * 3. CacheSynchronizer - Periodic cache state polling across cluster
 * 4. ClusterCache - Main orchestrator for cache coordination
 * 5. CacheError - Typed errors for cache operations
 *
 * The cache coordination system enables efficient prompt caching by:
 * - Pre-warming caches on cluster initialization
 * - Tracking which nodes have which cached prompts
 * - Synchronizing cache state periodically
 * - Providing metrics for cache hit rate monitoring
 * - Handling failures gracefully without blocking cluster startup
 *
 * @module cluster-cache
 */

import crypto from 'crypto';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown during cache operations.
 *
 * Contains error code and optional context (nodeId, hash).
 */
export class CacheError extends Error {
  readonly code: string;
  readonly nodeId?: string;
  readonly hash?: string;

  constructor(code: string, message: string, context?: { nodeId?: string; hash?: string }) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.nodeId = context?.nodeId;
    this.hash = context?.hash;
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Cache entry for a single node.
 */
export interface CacheEntry {
  readonly nodeId: string;
  readonly nodeUrl: string;
  readonly systemPromptHash: string;
  readonly tokens: number;
  readonly lastUpdated: number;
  readonly hitRate?: number;
}

/**
 * Result of a cache warmup operation for a single node.
 */
export interface CacheWarmupResult {
  readonly nodeId: string;
  readonly success: boolean;
  readonly hash?: string;
  readonly tokens?: number;
  readonly error?: string;
  readonly durationMs: number;
}

/**
 * Options for cache warmup operations.
 */
export interface CacheWarmupOptions {
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly systemPrompt: string;
}

/**
 * Callbacks for cache operations.
 */
export interface CacheCallbacks {
  readonly onCacheWarmedUp?: (result: CacheWarmupResult) => void;
  readonly onCacheWarmupFailed?: (result: CacheWarmupResult) => void;
  readonly onCacheSyncComplete?: (stats: { syncedNodes: number; failedNodes: number; totalNodes: number }) => void;
  readonly onCacheSyncError?: (error: Error) => void;
}

// ============================================================================
// CacheRegistry - Tracks cache state per node
// ============================================================================

/**
 * Registry for tracking cache state across cluster nodes.
 *
 * Maintains two indexes:
 * - Primary index: nodeId → CacheEntry
 * - Hash index: hash → Set<nodeId> (for finding nodes with specific cache)
 *
 * Automatically updates hash index when entries are added/removed/updated.
 */
export class CacheRegistry {
  private readonly entries: Map<string, CacheEntry> = new Map();
  private readonly hashIndex: Map<string, Set<string>> = new Map();
  private readonly config: { maxCacheAgeSec: number };

  constructor(config: { maxCacheAgeSec: number }) {
    this.config = config;
  }

  /**
   * Add or update a cache entry.
   *
   * Updates hash index automatically.
   */
  set(entry: CacheEntry): void {
    const existingEntry = this.entries.get(entry.nodeId);

    // Remove old hash index if updating existing entry
    if (existingEntry && existingEntry.systemPromptHash !== entry.systemPromptHash) {
      const oldHashSet = this.hashIndex.get(existingEntry.systemPromptHash);
      if (oldHashSet) {
        oldHashSet.delete(entry.nodeId);
        if (oldHashSet.size === 0) {
          this.hashIndex.delete(existingEntry.systemPromptHash);
        }
      }
    }

    // Add to primary index
    this.entries.set(entry.nodeId, entry);

    // Add to hash index
    let hashSet = this.hashIndex.get(entry.systemPromptHash);
    if (!hashSet) {
      hashSet = new Set();
      this.hashIndex.set(entry.systemPromptHash, hashSet);
    }
    hashSet.add(entry.nodeId);
  }

  /**
   * Get cache entry for a node.
   */
  get(nodeId: string): CacheEntry | undefined {
    return this.entries.get(nodeId);
  }

  /**
   * Remove cache entry for a node.
   *
   * Updates hash index automatically.
   */
  delete(nodeId: string): void {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return;
    }

    // Remove from hash index
    const hashSet = this.hashIndex.get(entry.systemPromptHash);
    if (hashSet) {
      hashSet.delete(nodeId);
      if (hashSet.size === 0) {
        this.hashIndex.delete(entry.systemPromptHash);
      }
    }

    // Remove from primary index
    this.entries.delete(nodeId);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.entries.clear();
    this.hashIndex.clear();
  }

  /**
   * Find all nodes that have a specific cache hash.
   */
  findNodesWithCache(hash: string): CacheEntry[] {
    const nodeIds = this.hashIndex.get(hash);
    if (!nodeIds) {
      return [];
    }

    const entries: CacheEntry[] = [];
    for (const nodeId of nodeIds) {
      const entry = this.entries.get(nodeId);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /**
   * Get all unique cache hashes in the registry.
   */
  getAllCachedHashes(): string[] {
    return Array.from(this.hashIndex.keys());
  }

  /**
   * Get number of nodes in registry.
   */
  getNodeCount(): number {
    return this.entries.size;
  }

  /**
   * Get number of cache entries (same as node count - each node has one cache).
   */
  getCacheCount(): number {
    return this.entries.size;
  }

  /**
   * Remove stale cache entries based on lastUpdated timestamp.
   *
   * @returns Number of entries expired
   */
  expireStaleEntries(): number {
    const now = Date.now();
    const maxAgeMs = this.config.maxCacheAgeSec * 1000;
    let expiredCount = 0;

    for (const [nodeId, entry] of this.entries.entries()) {
      if (now - entry.lastUpdated > maxAgeMs) {
        this.delete(nodeId);
        expiredCount++;
      }
    }

    return expiredCount;
  }
}

// ============================================================================
// CacheWarmup - Parallel warmup with concurrency control
// ============================================================================

/**
 * Cache warmup coordinator for cluster nodes.
 *
 * Warms up node caches by sending system prompts in parallel batches.
 * Uses concurrency control to avoid overwhelming nodes.
 */
export class CacheWarmup {
  private readonly options: CacheWarmupOptions;
  private readonly callbacks?: CacheCallbacks;

  constructor(options: CacheWarmupOptions, callbacks?: CacheCallbacks) {
    this.options = options;
    this.callbacks = callbacks;
  }

  /**
   * Generate SHA256 hash of a prompt.
   *
   * Used to identify cached prompts.
   */
  generateHash(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  /**
   * Warm up multiple nodes in parallel with concurrency control.
   *
   * Processes nodes in batches to avoid overwhelming the cluster.
   */
  async warmUpNodes(nodes: Array<{ id: string; url: string }>): Promise<CacheWarmupResult[]> {
    const results: CacheWarmupResult[] = [];

    // Process nodes in batches based on concurrency limit
    for (let i = 0; i < nodes.length; i += this.options.concurrency) {
      const batch = nodes.slice(i, i + this.options.concurrency);
      const batchResults = await Promise.all(batch.map(node => this.warmUpSingleNode(node)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Warm up a single node's cache.
   * Uses finally block to ensure timer cleanup even on failure (prevents memory leak).
   */
  private async warmUpSingleNode(node: { id: string; url: string }): Promise<CacheWarmupResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await Promise.race([
        fetch(`${node.url}/v1/cluster/cache/warm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: this.options.systemPrompt }),
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.options.timeoutMs)
        ),
      ]);

      if (!response.ok) {
        const durationMs = Date.now() - startTime;
        const result: CacheWarmupResult = {
          nodeId: node.id,
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          durationMs,
        };
        this.notifyWarmupFailed(result);
        return result;
      }

      const data = await response.json() as { systemPromptHash: string; tokens: number };
      const durationMs = Date.now() - startTime;
      const result: CacheWarmupResult = {
        nodeId: node.id,
        success: true,
        hash: data.systemPromptHash,
        tokens: data.tokens,
        durationMs,
      };

      this.notifyWarmupSuccess(result);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const result: CacheWarmupResult = {
        nodeId: node.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
      this.notifyWarmupFailed(result);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Notify warmup success callback.
   */
  private notifyWarmupSuccess(result: CacheWarmupResult): void {
    if (this.callbacks?.onCacheWarmedUp) {
      try {
        this.callbacks.onCacheWarmedUp(result);
      } catch (error) {
        // Swallow callback errors
      }
    }
  }

  /**
   * Notify warmup failure callback.
   */
  private notifyWarmupFailed(result: CacheWarmupResult): void {
    if (this.callbacks?.onCacheWarmupFailed) {
      try {
        this.callbacks.onCacheWarmupFailed(result);
      } catch (error) {
        // Swallow callback errors
      }
    }
  }
}

// ============================================================================
// CacheSynchronizer - Periodic cache state polling
// ============================================================================

/**
 * Periodic cache state synchronizer for cluster nodes.
 *
 * Polls nodes for cache state and updates registry.
 * Uses recursive setTimeout for scheduling with overlap prevention.
 */
export class CacheSynchronizer {
  private readonly registry: CacheRegistry;
  private readonly config: { maxCacheAgeSec: number };
  private readonly callbacks?: CacheCallbacks;

  private running: boolean = false;
  private syncTimer?: NodeJS.Timeout;
  private syncInProgress: boolean = false;

  constructor(
    registry: CacheRegistry,
    config: { maxCacheAgeSec: number },
    callbacks?: CacheCallbacks
  ) {
    this.registry = registry;
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Start periodic cache synchronization.
   */
  start(nodes: Array<{ id: string; url: string }>, intervalMs: number): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleSyncRecursive(nodes, intervalMs);
  }

  /**
   * Stop periodic cache synchronization.
   */
  stop(): void {
    this.running = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Check if synchronizer is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Synchronize cache state for all nodes.
   */
  async syncCacheState(nodes: Array<{ id: string; url: string }>): Promise<void> {
    if (this.syncInProgress) {
      return; // Prevent overlap
    }

    this.syncInProgress = true;

    try {
      let syncedNodes = 0;
      let failedNodes = 0;
      const errors: Error[] = [];

      // Poll all nodes in parallel
      const results = await Promise.allSettled(
        nodes.map(node => this.syncSingleNode(node))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            syncedNodes++;
          } else {
            failedNodes++;
            if (result.value.error) {
              errors.push(result.value.error);
            }
          }
        } else {
          failedNodes++;
        }
      }

      // Expire stale entries after sync
      this.registry.expireStaleEntries();

      // Notify sync errors if any occurred
      for (const error of errors) {
        this.notifySyncError(error);
      }

      // Notify sync completion
      this.notifySyncComplete({
        syncedNodes,
        failedNodes,
        totalNodes: nodes.length,
      });
    } catch (error) {
      this.notifySyncError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Synchronize cache state for a single node.
   */
  private async syncSingleNode(
    node: { id: string; url: string }
  ): Promise<{ success: boolean; error?: Error }> {
    try {
      const response = await fetch(`${node.url}/v1/cluster/cache`);

      if (!response.ok) {
        return { success: false };
      }

      const data = await response.json() as {
        systemPromptHash: string;
        tokens: number;
        hitRate?: number;
      };

      // Update registry with fresh cache state
      const entry: CacheEntry = {
        nodeId: node.id,
        nodeUrl: node.url,
        systemPromptHash: data.systemPromptHash,
        tokens: data.tokens,
        lastUpdated: Date.now(),
        hitRate: data.hitRate,
      };

      this.registry.set(entry);
      return { success: true };
    } catch (error) {
      // Node failed to sync - return error for monitoring
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Schedule next sync using recursive setTimeout.
   */
  private scheduleSyncRecursive(nodes: Array<{ id: string; url: string }>, intervalMs: number): void {
    if (!this.running) {
      return;
    }

    const performSync = async () => {
      await this.syncCacheState(nodes);

      // Schedule next sync after this one completes
      if (this.running) {
        this.syncTimer = setTimeout(performSync, intervalMs);
      }
    };

    // Start first sync after interval
    this.syncTimer = setTimeout(performSync, intervalMs);
  }

  /**
   * Notify sync completion callback.
   */
  private notifySyncComplete(stats: { syncedNodes: number; failedNodes: number; totalNodes: number }): void {
    if (this.callbacks?.onCacheSyncComplete) {
      try {
        this.callbacks.onCacheSyncComplete(stats);
      } catch (error) {
        // Swallow callback errors
      }
    }
  }

  /**
   * Notify sync error callback.
   */
  private notifySyncError(error: Error): void {
    if (this.callbacks?.onCacheSyncError) {
      try {
        this.callbacks.onCacheSyncError(error);
      } catch (error) {
        // Swallow callback errors
      }
    }
  }
}

// ============================================================================
// ClusterCache - Main orchestrator
// ============================================================================

/**
 * Main orchestrator for cluster cache coordination.
 *
 * Combines CacheRegistry, CacheWarmup, and CacheSynchronizer to provide:
 * - Initial cache warmup on cluster initialization
 * - Periodic cache state synchronization
 * - Cache metrics and monitoring
 */
export class ClusterCache {
  private readonly registry: CacheRegistry;
  private readonly synchronizer: CacheSynchronizer;
  private readonly config: { maxCacheAgeSec: number };
  private readonly callbacks?: CacheCallbacks;

  constructor(config: { maxCacheAgeSec: number }, callbacks?: CacheCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.registry = new CacheRegistry(config);
    this.synchronizer = new CacheSynchronizer(this.registry, config, callbacks);
  }

  /**
   * Initialize cluster cache with warmup and periodic sync.
   *
   * 1. Warm up all nodes with system prompt
   * 2. Add warmed nodes to registry
   * 3. Start periodic sync
   */
  async initialize(
    nodes: Array<{ id: string; url: string }>,
    systemPrompt: string,
    warmupOptions: CacheWarmupOptions,
    syncIntervalMs: number
  ): Promise<void> {
    if (nodes.length === 0) {
      return;
    }

    // Step 1: Warm up nodes
    const warmup = new CacheWarmup(warmupOptions, this.callbacks);
    const results = await warmup.warmUpNodes(nodes);

    // Step 2: Add successful warmups to registry
    for (const result of results) {
      if (result.success && result.hash && result.tokens !== undefined) {
        const node = nodes.find(n => n.id === result.nodeId);
        if (node) {
          const entry: CacheEntry = {
            nodeId: result.nodeId,
            nodeUrl: node.url,
            systemPromptHash: result.hash,
            tokens: result.tokens,
            lastUpdated: Date.now(),
          };
          this.registry.set(entry);
        }
      }
    }

    // Step 3: Start periodic sync
    this.synchronizer.start(nodes, syncIntervalMs);
  }

  /**
   * Stop periodic cache synchronization.
   */
  stop(): void {
    this.synchronizer.stop();
  }

  /**
   * Check if cache synchronization is running.
   */
  isRunning(): boolean {
    return this.synchronizer.isRunning();
  }

  /**
   * Find nodes with a specific cache hash.
   */
  findNodesWithCache(hash: string): CacheEntry[] {
    return this.registry.findNodesWithCache(hash);
  }

  /**
   * Get all cache registry entries.
   */
  getCacheRegistry(): Map<string, CacheEntry> {
    return new Map(this.registry['entries']);
  }

  /**
   * Get cache state for a specific node.
   */
  getNodeCacheState(nodeId: string): CacheEntry | undefined {
    return this.registry.get(nodeId);
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { nodeCount: number; cacheCount: number; uniqueHashes: number } {
    return {
      nodeCount: this.registry.getNodeCount(),
      cacheCount: this.registry.getCacheCount(),
      uniqueHashes: this.registry.getAllCachedHashes().length,
    };
  }
}
