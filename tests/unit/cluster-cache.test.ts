/**
 * Unit tests for cluster-cache.ts
 *
 * Tests the KV cache coordination for MLX cluster:
 * 1. CacheError class - Custom error with code, nodeId, hash context
 * 2. CacheRegistry class - Tracks cache state per node with hash index
 * 3. CacheWarmup class - Warms up nodes with system prompts
 * 4. CacheSynchronizer class - Periodic cache state polling
 * 5. ClusterCache class - Main orchestrator
 *
 * Test categories:
 * - CacheError: error construction, context fields, inheritance
 * - CacheRegistry: CRUD operations, hash indexing, expiration
 * - CacheWarmup: hash generation, warmup requests, concurrency control, callbacks
 * - CacheSynchronizer: periodic sync, overlap prevention, error handling, callbacks
 * - ClusterCache integration: initialization, warmup + sync workflow, stats
 *
 * Edge cases:
 * - Empty registry operations
 * - Stale cache entry expiration
 * - Concurrent warmup with failures
 * - Sync overlap prevention
 * - Node offline during sync
 * - Timeout handling
 *
 * Mock requirements:
 * - jest.useFakeTimers() for periodic sync and TTL testing
 * - Mock global fetch for HTTP warmup/sync requests
 * - Mock callbacks with jest.fn()
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  CacheError,
  CacheEntry,
  CacheRegistry,
  CacheWarmup,
  CacheSynchronizer,
  ClusterCache,
  CacheWarmupResult,
  CacheCallbacks,
  CacheWarmupOptions,
} from '../../src/cluster/cluster-cache';

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Test-specific cache config interface
 * (cluster-cache.ts will define its own config requirements)
 */
interface TestCacheConfig {
  readonly maxCacheAgeSec: number;
  readonly minCacheHitRate: number;
  readonly maxCacheSizeTokens: number;
}

/**
 * Helper to create a minimal cache entry
 */
function createCacheEntry(
  nodeId: string,
  overrides?: Partial<CacheEntry>
): CacheEntry {
  return {
    nodeId,
    nodeUrl: `http://localhost:8080`,
    systemPromptHash: 'hash-abc123',
    tokens: 1000,
    lastUpdated: Date.now(),
    hitRate: 0.8,
    ...overrides,
  };
}

/**
 * Helper to create test cache config
 */
function createCacheConfig(overrides?: Partial<TestCacheConfig>): TestCacheConfig {
  return {
    maxCacheAgeSec: 300, // 5 minutes
    minCacheHitRate: 0.5,
    maxCacheSizeTokens: 100000,
    ...overrides,
  };
}

/**
 * Helper to create warmup options
 */
function createWarmupOptions(
  overrides?: Partial<CacheWarmupOptions>
): CacheWarmupOptions {
  return {
    concurrency: 3,
    timeoutMs: 5000,
    retryCount: 1,
    systemPrompt: 'Test system prompt for warmup',
    ...overrides,
  };
}

/**
 * Helper to create mock callbacks
 */
function createMockCallbacks(): CacheCallbacks {
  return {
    onCacheWarmedUp: jest.fn(),
    onCacheWarmupFailed: jest.fn(),
    onCacheSyncComplete: jest.fn(),
    onCacheSyncError: jest.fn(),
  };
}

/**
 * Helper to create test node references
 */
function createTestNodes(count: number): Array<{ id: string; url: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i + 1}`,
    url: `http://localhost:${8080 + i}`,
  }));
}

/**
 * Mock fetch response helper
 */
function mockFetchSuccess(hash: string, tokens: number) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        systemPromptHash: hash,
        tokens,
        cached: true,
      }),
  } as Response);
}

function mockFetchError(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ error: message }),
  } as Response);
}

function mockFetchTimeout() {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 100)
  );
}

// ============================================================================
// CacheError Tests (5 tests)
// ============================================================================

describe('CacheError', () => {
  test('creates error with code and message', () => {
    const error = new CacheError('CACHE_WARMUP_FAILED', 'Warmup failed');
    expect(error.code).toBe('CACHE_WARMUP_FAILED');
    expect(error.message).toBe('Warmup failed');
  });

  test('creates error with nodeId context', () => {
    const error = new CacheError('NODE_OFFLINE', 'Node is offline', {
      nodeId: 'node-1',
    });
    expect(error.code).toBe('NODE_OFFLINE');
    expect(error.nodeId).toBe('node-1');
  });

  test('creates error with hash context', () => {
    const error = new CacheError('HASH_MISMATCH', 'Hash mismatch detected', {
      hash: 'hash-abc123',
    });
    expect(error.code).toBe('HASH_MISMATCH');
    expect(error.hash).toBe('hash-abc123');
  });

  test('creates error with both nodeId and hash', () => {
    const error = new CacheError('CACHE_INVALID', 'Cache is invalid', {
      nodeId: 'node-2',
      hash: 'hash-xyz789',
    });
    expect(error.nodeId).toBe('node-2');
    expect(error.hash).toBe('hash-xyz789');
  });

  test('inherits from Error class', () => {
    const error = new CacheError('TEST_ERROR', 'Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CacheError');
    expect(error.stack).toBeDefined();
  });
});

// ============================================================================
// CacheRegistry Tests (20 tests)
// ============================================================================

describe('CacheRegistry', () => {
  let config: TestCacheConfig;
  let registry: CacheRegistry;

  beforeEach(() => {
    config = createCacheConfig();
    registry = new CacheRegistry(config);
  });

  describe('Basic CRUD operations', () => {
    test('set and get entry', () => {
      const entry = createCacheEntry('node-1');
      registry.set(entry);
      const retrieved = registry.get('node-1');
      expect(retrieved).toEqual(entry);
    });

    test('get returns undefined for non-existent entry', () => {
      const retrieved = registry.get('node-999');
      expect(retrieved).toBeUndefined();
    });

    test('delete removes entry', () => {
      const entry = createCacheEntry('node-1');
      registry.set(entry);
      registry.delete('node-1');
      expect(registry.get('node-1')).toBeUndefined();
    });

    test('delete on non-existent entry does not throw', () => {
      expect(() => registry.delete('node-999')).not.toThrow();
    });

    test('clear removes all entries', () => {
      registry.set(createCacheEntry('node-1'));
      registry.set(createCacheEntry('node-2'));
      registry.set(createCacheEntry('node-3'));
      registry.clear();
      expect(registry.getNodeCount()).toBe(0);
      expect(registry.getCacheCount()).toBe(0);
    });

    test('update existing entry replaces old data', () => {
      registry.set(createCacheEntry('node-1', { tokens: 1000 }));
      registry.set(createCacheEntry('node-1', { tokens: 2000 }));
      const entry = registry.get('node-1');
      expect(entry?.tokens).toBe(2000);
    });
  });

  describe('Hash indexing', () => {
    test('findNodesWithCache returns empty array when no matches', () => {
      registry.set(createCacheEntry('node-1', { systemPromptHash: 'hash-a' }));
      const nodes = registry.findNodesWithCache('hash-b');
      expect(nodes).toEqual([]);
    });

    test('findNodesWithCache returns single matching node', () => {
      const entry = createCacheEntry('node-1', { systemPromptHash: 'hash-a' });
      registry.set(entry);
      const nodes = registry.findNodesWithCache('hash-a');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual(entry);
    });

    test('findNodesWithCache returns multiple matching nodes', () => {
      const entry1 = createCacheEntry('node-1', {
        systemPromptHash: 'hash-a',
      });
      const entry2 = createCacheEntry('node-2', {
        systemPromptHash: 'hash-a',
      });
      const entry3 = createCacheEntry('node-3', {
        systemPromptHash: 'hash-b',
      });
      registry.set(entry1);
      registry.set(entry2);
      registry.set(entry3);

      const nodes = registry.findNodesWithCache('hash-a');
      expect(nodes).toHaveLength(2);
      expect(nodes).toContainEqual(entry1);
      expect(nodes).toContainEqual(entry2);
    });

    test('hash index updated when entry deleted', () => {
      registry.set(createCacheEntry('node-1', { systemPromptHash: 'hash-a' }));
      registry.delete('node-1');
      const nodes = registry.findNodesWithCache('hash-a');
      expect(nodes).toEqual([]);
    });

    test('hash index updated when entry hash changes', () => {
      registry.set(createCacheEntry('node-1', { systemPromptHash: 'hash-a' }));
      registry.set(createCacheEntry('node-1', { systemPromptHash: 'hash-b' }));

      const nodesA = registry.findNodesWithCache('hash-a');
      const nodesB = registry.findNodesWithCache('hash-b');

      expect(nodesA).toEqual([]);
      expect(nodesB).toHaveLength(1);
    });

    test('getAllCachedHashes returns all unique hashes', () => {
      registry.set(createCacheEntry('node-1', { systemPromptHash: 'hash-a' }));
      registry.set(createCacheEntry('node-2', { systemPromptHash: 'hash-a' }));
      registry.set(createCacheEntry('node-3', { systemPromptHash: 'hash-b' }));

      const hashes = registry.getAllCachedHashes();
      expect(hashes).toHaveLength(2);
      expect(hashes).toContain('hash-a');
      expect(hashes).toContain('hash-b');
    });

    test('getAllCachedHashes returns empty array when registry empty', () => {
      const hashes = registry.getAllCachedHashes();
      expect(hashes).toEqual([]);
    });
  });

  describe('Counting and stats', () => {
    test('getNodeCount returns correct count', () => {
      expect(registry.getNodeCount()).toBe(0);
      registry.set(createCacheEntry('node-1'));
      expect(registry.getNodeCount()).toBe(1);
      registry.set(createCacheEntry('node-2'));
      expect(registry.getNodeCount()).toBe(2);
    });

    test('getCacheCount returns correct count', () => {
      expect(registry.getCacheCount()).toBe(0);
      registry.set(createCacheEntry('node-1'));
      expect(registry.getCacheCount()).toBe(1);
      registry.set(createCacheEntry('node-2'));
      expect(registry.getCacheCount()).toBe(2);
    });

    test('getCacheCount equals getNodeCount (each node has one cache)', () => {
      registry.set(createCacheEntry('node-1'));
      registry.set(createCacheEntry('node-2'));
      expect(registry.getCacheCount()).toBe(registry.getNodeCount());
    });
  });

  describe('Expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('expireStaleEntries removes old entries', () => {
      const now = Date.now();
      jest.setSystemTime(now);

      // Add entry that's already expired
      registry.set(
        createCacheEntry('node-1', {
          lastUpdated: now - config.maxCacheAgeSec * 1000 - 1000,
        })
      );

      const expired = registry.expireStaleEntries();
      expect(expired).toBe(1);
      expect(registry.getNodeCount()).toBe(0);
    });

    test('expireStaleEntries keeps fresh entries', () => {
      const now = Date.now();
      jest.setSystemTime(now);

      registry.set(createCacheEntry('node-1', { lastUpdated: now - 1000 }));

      const expired = registry.expireStaleEntries();
      expect(expired).toBe(0);
      expect(registry.getNodeCount()).toBe(1);
    });

    test('expireStaleEntries handles mixed fresh and stale', () => {
      const now = Date.now();
      jest.setSystemTime(now);

      registry.set(
        createCacheEntry('node-1', {
          lastUpdated: now - config.maxCacheAgeSec * 1000 - 1000,
        })
      );
      registry.set(createCacheEntry('node-2', { lastUpdated: now - 1000 }));
      registry.set(
        createCacheEntry('node-3', {
          lastUpdated: now - config.maxCacheAgeSec * 1000 - 2000,
        })
      );

      const expired = registry.expireStaleEntries();
      expect(expired).toBe(2);
      expect(registry.getNodeCount()).toBe(1);
      expect(registry.get('node-2')).toBeDefined();
    });

    test('expireStaleEntries updates hash index', () => {
      const now = Date.now();
      jest.setSystemTime(now);

      registry.set(
        createCacheEntry('node-1', {
          systemPromptHash: 'hash-a',
          lastUpdated: now - config.maxCacheAgeSec * 1000 - 1000,
        })
      );

      registry.expireStaleEntries();
      const nodes = registry.findNodesWithCache('hash-a');
      expect(nodes).toEqual([]);
    });
  });
});

// ============================================================================
// CacheWarmup Tests (15 tests)
// ============================================================================

describe('CacheWarmup', () => {
  let options: CacheWarmupOptions;
  let callbacks: CacheCallbacks;
  let warmup: CacheWarmup;

  beforeEach(() => {
    options = createWarmupOptions();
    callbacks = createMockCallbacks();
    warmup = new CacheWarmup(options, callbacks);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Hash generation', () => {
    test('generateHash returns consistent SHA256 hash', () => {
      const prompt = 'Test system prompt';
      const hash1 = warmup.generateHash(prompt);
      const hash2 = warmup.generateHash(prompt);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex format
    });

    test('generateHash returns different hashes for different prompts', () => {
      const hash1 = warmup.generateHash('Prompt A');
      const hash2 = warmup.generateHash('Prompt B');
      expect(hash1).not.toBe(hash2);
    });

    test('generateHash handles empty string', () => {
      const hash = warmup.generateHash('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('generateHash handles very long prompts', () => {
      const longPrompt = 'A'.repeat(100000);
      const hash = warmup.generateHash(longPrompt);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Single node warmup', () => {
    test('warmUpNodes with single success returns correct result', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      const results = await warmup.warmUpNodes(nodes);

      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe('node-1');
      expect(results[0].success).toBe(true);
      expect(results[0].hash).toBe('hash-abc123');
      expect(results[0].tokens).toBe(5000);
      expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test('warmUpNodes with timeout returns error result', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(mockFetchTimeout());

      const results = await warmup.warmUpNodes(nodes);

      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe('node-1');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Timeout');
    });

    test('warmUpNodes with HTTP error returns error result', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchError(500, 'Internal Server Error')
      );

      const results = await warmup.warmUpNodes(nodes);

      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe('node-1');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    test('warmUpNodes with network error returns error result', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const results = await warmup.warmUpNodes(nodes);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Network error');
    });
  });

  describe('Multiple node warmup', () => {
    test('warmUpNodes with all success', async () => {
      const nodes = createTestNodes(3);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      const results = await warmup.warmUpNodes(nodes);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test('warmUpNodes with some failures', async () => {
      const nodes = createTestNodes(3);
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(mockFetchSuccess('hash-abc123', 5000))
        .mockReturnValueOnce(mockFetchError(500, 'Server error'))
        .mockReturnValueOnce(mockFetchSuccess('hash-abc123', 5000));

      const results = await warmup.warmUpNodes(nodes);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    test('warmUpNodes respects concurrency limit', async () => {
      const nodes = createTestNodes(10);
      const concurrentCalls: number[] = [];
      let currentConcurrent = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        currentConcurrent++;
        concurrentCalls.push(currentConcurrent);
        return new Promise((resolve) => {
          setTimeout(() => {
            currentConcurrent--;
            resolve(mockFetchSuccess('hash-abc123', 5000));
          }, 10);
        });
      });

      await warmup.warmUpNodes(nodes);

      // Max concurrent should not exceed concurrency limit
      const maxConcurrent = Math.max(...concurrentCalls);
      expect(maxConcurrent).toBeLessThanOrEqual(options.concurrency);
    });

    test('warmUpNodes processes nodes in batches', async () => {
      const nodes = createTestNodes(7);
      const concurrency = 3;
      const warmupWithConcurrency = new CacheWarmup({
        ...options,
        concurrency,
      });

      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      const results = await warmupWithConcurrency.warmUpNodes(nodes);

      expect(results).toHaveLength(7);
      expect(global.fetch).toHaveBeenCalledTimes(7);
    });
  });

  describe('Callbacks', () => {
    test('onCacheWarmedUp called on successful warmup', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await warmup.warmUpNodes(nodes);

      expect(callbacks.onCacheWarmedUp).toHaveBeenCalledTimes(1);
      expect(callbacks.onCacheWarmedUp).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          success: true,
          hash: 'hash-abc123',
          tokens: 5000,
        })
      );
    });

    test('onCacheWarmupFailed called on warmup failure', async () => {
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchError(500, 'Server error')
      );

      await warmup.warmUpNodes(nodes);

      expect(callbacks.onCacheWarmupFailed).toHaveBeenCalledTimes(1);
      expect(callbacks.onCacheWarmupFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('callbacks work without being provided', async () => {
      const warmupNoCallbacks = new CacheWarmup(options);
      const nodes = [{ id: 'node-1', url: 'http://localhost:8080' }];
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await expect(warmupNoCallbacks.warmUpNodes(nodes)).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// CacheSynchronizer Tests (15 tests)
// ============================================================================

describe('CacheSynchronizer', () => {
  let config: TestCacheConfig;
  let registry: CacheRegistry;
  let callbacks: CacheCallbacks;
  let synchronizer: CacheSynchronizer;

  beforeEach(() => {
    config = createCacheConfig();
    registry = new CacheRegistry(config);
    callbacks = createMockCallbacks();
    synchronizer = new CacheSynchronizer(registry, config, callbacks);
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    synchronizer.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Start and stop', () => {
    test('start begins periodic sync', () => {
      const nodes = createTestNodes(2);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      synchronizer.start(nodes, 1000);

      expect(synchronizer.isRunning()).toBe(true);
    });

    test('stop cancels sync timer', () => {
      const nodes = createTestNodes(2);
      synchronizer.start(nodes, 1000);
      synchronizer.stop();

      expect(synchronizer.isRunning()).toBe(false);
    });

    test('isRunning returns false initially', () => {
      expect(synchronizer.isRunning()).toBe(false);
    });

    test('isRunning returns true after start', () => {
      const nodes = createTestNodes(2);
      synchronizer.start(nodes, 1000);
      expect(synchronizer.isRunning()).toBe(true);
    });

    test('stop can be called multiple times safely', () => {
      const nodes = createTestNodes(2);
      synchronizer.start(nodes, 1000);
      synchronizer.stop();
      synchronizer.stop();

      expect(synchronizer.isRunning()).toBe(false);
    });
  });

  describe('Cache state synchronization', () => {
    test('syncCacheState updates registry with node responses', async () => {
      const nodes = createTestNodes(2);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await synchronizer.syncCacheState(nodes);

      expect(registry.getNodeCount()).toBe(2);
      expect(registry.get('node-1')).toBeDefined();
      expect(registry.get('node-2')).toBeDefined();
    });

    test('syncCacheState handles node errors gracefully', async () => {
      const nodes = createTestNodes(3);
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(mockFetchSuccess('hash-abc123', 5000))
        .mockReturnValueOnce(mockFetchError(500, 'Server error'))
        .mockReturnValueOnce(mockFetchSuccess('hash-xyz789', 3000));

      await synchronizer.syncCacheState(nodes);

      // Two successful syncs
      expect(registry.getNodeCount()).toBe(2);
      expect(registry.get('node-1')).toBeDefined();
      expect(registry.get('node-3')).toBeDefined();
    });

    test('syncCacheState handles timeouts', async () => {
      const nodes = createTestNodes(1);
      // Mock a network timeout that rejects immediately (no timer delay)
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Timeout'));

      await synchronizer.syncCacheState(nodes);

      // Node should not be in registry due to timeout
      expect(registry.getNodeCount()).toBe(0);
    });

    test('syncCacheState removes stale entries', async () => {
      const now = Date.now();
      jest.setSystemTime(now);

      // Add stale entry
      registry.set(
        createCacheEntry('node-stale', {
          lastUpdated: now - config.maxCacheAgeSec * 1000 - 1000,
        })
      );

      const nodes = createTestNodes(1);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await synchronizer.syncCacheState(nodes);

      // Stale entry should be removed
      expect(registry.get('node-stale')).toBeUndefined();
    });
  });

  describe('Periodic sync', () => {
    test('periodic sync triggers at interval', async () => {
      const nodes = createTestNodes(1);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      synchronizer.start(nodes, 1000);

      // Fast-forward time
      await jest.advanceTimersByTimeAsync(1000);

      expect(global.fetch).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('periodic sync does not overlap', async () => {
      const nodes = createTestNodes(1);
      let resolveFirstSync: any;
      const firstSyncPromise = new Promise((resolve) => {
        resolveFirstSync = resolve;
      });

      (global.fetch as jest.Mock).mockImplementation(() => firstSyncPromise);

      synchronizer.start(nodes, 100);

      // Trigger first sync
      await jest.advanceTimersByTimeAsync(100);

      // Try to trigger second sync while first is still running
      await jest.advanceTimersByTimeAsync(100);

      // Only one fetch should have been called (overlap prevented)
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Complete first sync
      resolveFirstSync(mockFetchSuccess('hash-abc123', 5000));
    });

    test('stop prevents further periodic syncs', async () => {
      const nodes = createTestNodes(1);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      synchronizer.start(nodes, 1000);
      await jest.advanceTimersByTimeAsync(1000);

      const callCountBeforeStop = (global.fetch as jest.Mock).mock.calls.length;

      synchronizer.stop();
      await jest.advanceTimersByTimeAsync(2000);

      // No additional calls after stop
      expect(global.fetch).toHaveBeenCalledTimes(callCountBeforeStop);
    });
  });

  describe('Callbacks', () => {
    test('onCacheSyncComplete called on successful sync', async () => {
      const nodes = createTestNodes(2);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await synchronizer.syncCacheState(nodes);

      expect(callbacks.onCacheSyncComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onCacheSyncComplete).toHaveBeenCalledWith({
        syncedNodes: 2,
        failedNodes: 0,
        totalNodes: 2,
      });
    });

    test('onCacheSyncComplete includes failure count', async () => {
      const nodes = createTestNodes(3);
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(mockFetchSuccess('hash-abc123', 5000))
        .mockReturnValueOnce(mockFetchError(500, 'Server error'))
        .mockReturnValueOnce(mockFetchSuccess('hash-xyz789', 3000));

      await synchronizer.syncCacheState(nodes);

      expect(callbacks.onCacheSyncComplete).toHaveBeenCalledWith({
        syncedNodes: 2,
        failedNodes: 1,
        totalNodes: 3,
      });
    });

    test('onCacheSyncError called on sync errors', async () => {
      const nodes = createTestNodes(1);
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Critical sync error')
      );

      await synchronizer.syncCacheState(nodes);

      expect(callbacks.onCacheSyncError).toHaveBeenCalledTimes(1);
    });

    test('callbacks work without being provided', async () => {
      const synchronizerNoCallbacks = new CacheSynchronizer(registry, config);
      const nodes = createTestNodes(1);
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await expect(
        synchronizerNoCallbacks.syncCacheState(nodes)
      ).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// ClusterCache Integration Tests (15 tests)
// ============================================================================

describe('ClusterCache', () => {
  let config: TestCacheConfig;
  let callbacks: CacheCallbacks;
  let clusterCache: ClusterCache;

  beforeEach(() => {
    config = createCacheConfig();
    callbacks = createMockCallbacks();
    clusterCache = new ClusterCache(config, callbacks);
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    clusterCache.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('initialize runs warmup then starts sync', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      expect(clusterCache.isRunning()).toBe(true);
      expect(callbacks.onCacheWarmedUp).toHaveBeenCalled();
    });

    test('initialize handles warmup failures gracefully', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(mockFetchSuccess('hash-abc123', 5000))
        .mockReturnValueOnce(mockFetchError(500, 'Server error'));

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      // Should still start sync even if some warmups failed
      expect(clusterCache.isRunning()).toBe(true);
    });

    test('initialize adds warmed nodes to registry', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const stats = clusterCache.getCacheStats();
      expect(stats.nodeCount).toBe(2);
    });

    test('initialize with zero nodes does not start sync', async () => {
      const nodes: Array<{ id: string; url: string }> = [];
      const warmupOptions = createWarmupOptions();

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      expect(clusterCache.isRunning()).toBe(false);
    });
  });

  describe('Registry delegation', () => {
    test('findNodesWithCache delegates to registry', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const foundNodes = clusterCache.findNodesWithCache('hash-abc123');
      expect(foundNodes).toHaveLength(2);
    });

    test('getCacheRegistry returns all entries', async () => {
      const nodes = createTestNodes(3);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const registry = clusterCache.getCacheRegistry();
      expect(registry.size).toBe(3);
      expect(registry.has('node-1')).toBe(true);
      expect(registry.has('node-2')).toBe(true);
      expect(registry.has('node-3')).toBe(true);
    });

    test('getNodeCacheState returns single entry', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const state = clusterCache.getNodeCacheState('node-1');
      expect(state).toBeDefined();
      expect(state?.nodeId).toBe('node-1');
    });

    test('getNodeCacheState returns undefined for non-existent node', () => {
      const state = clusterCache.getNodeCacheState('node-999');
      expect(state).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    test('getCacheStats returns correct counts', async () => {
      const nodes = createTestNodes(3);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const stats = clusterCache.getCacheStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.cacheCount).toBe(3);
      expect(stats.uniqueHashes).toBe(1);
    });

    test('getCacheStats with multiple unique hashes', async () => {
      const nodes = createTestNodes(3);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(mockFetchSuccess('hash-a', 5000))
        .mockReturnValueOnce(mockFetchSuccess('hash-b', 5000))
        .mockReturnValueOnce(mockFetchSuccess('hash-a', 5000));

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      const stats = clusterCache.getCacheStats();
      expect(stats.uniqueHashes).toBe(2);
    });

    test('getCacheStats returns zeros when not initialized', () => {
      const stats = clusterCache.getCacheStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.cacheCount).toBe(0);
      expect(stats.uniqueHashes).toBe(0);
    });
  });

  describe('Lifecycle management', () => {
    test('stop stops synchronizer', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);
      clusterCache.stop();

      expect(clusterCache.isRunning()).toBe(false);
    });

    test('isRunning reflects synchronizer state', async () => {
      const nodes = createTestNodes(2);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      expect(clusterCache.isRunning()).toBe(false);

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);
      expect(clusterCache.isRunning()).toBe(true);

      clusterCache.stop();
      expect(clusterCache.isRunning()).toBe(false);
    });

    test('stop can be called before initialize', () => {
      expect(() => clusterCache.stop()).not.toThrow();
    });
  });

  describe('Callback propagation', () => {
    test('warmup callbacks flow through correctly', async () => {
      const nodes = createTestNodes(1);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      expect(callbacks.onCacheWarmedUp).toHaveBeenCalledTimes(1);
    });

    test('sync callbacks flow through correctly', async () => {
      const nodes = createTestNodes(1);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchSuccess('hash-abc123', 5000)
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 100);

      // Advance timer to trigger sync
      await jest.advanceTimersByTimeAsync(100);

      expect(callbacks.onCacheSyncComplete).toHaveBeenCalled();
    });

    test('failure callbacks flow through correctly', async () => {
      const nodes = createTestNodes(1);
      const warmupOptions = createWarmupOptions();
      (global.fetch as jest.Mock).mockReturnValue(
        mockFetchError(500, 'Server error')
      );

      await clusterCache.initialize(nodes, 'Test prompt', warmupOptions, 1000);

      expect(callbacks.onCacheWarmupFailed).toHaveBeenCalledTimes(1);
    });
  });
});
