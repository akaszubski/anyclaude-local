/**
 * Unit tests for cluster-discovery.ts
 *
 * Tests the node discovery system for MLX cluster management:
 * 1. ClusterDiscovery class - Lifecycle management (start/stop/isRunning)
 * 2. Static discovery - Reading nodes from config.staticNodes
 * 3. Node validation - HTTP requests to /v1/models with timeout handling
 * 4. Refresh logic - Detecting new/lost nodes and triggering callbacks
 * 5. Overlap prevention - isDiscovering flag prevents concurrent refresh
 * 6. Callback invocation - onNodeDiscovered, onNodeLost, onDiscoveryError
 * 7. Timer management - Cleanup on stop, no memory leaks
 *
 * Test categories:
 * - Lifecycle management (start, stop, isRunning)
 * - Static node discovery (config.staticNodes)
 * - Node validation (HTTP /v1/models endpoint)
 * - Discovery refresh (periodic checks)
 * - Callback invocation (discovered, lost, error)
 * - Timer cleanup (no memory leaks)
 * - Error handling (network errors, timeouts)
 * - Edge cases (empty nodes, duplicate nodes, concurrent calls)
 *
 * Mock requirements:
 * - global fetch() for HTTP responses
 * - setTimeout/clearTimeout for timer management
 * - jest.useFakeTimers() for timing control
 *
 * Expected: ALL TESTS FAIL (TDD red phase - implementation doesn't exist yet)
 */

import {
  ClusterDiscovery,
  DiscoveryConfig,
  DiscoveryCallbacks,
  DiscoveryError,
} from '../../src/cluster/cluster-discovery';
import { NodeId } from '../../src/cluster/cluster-types';

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Mock fetch globally for HTTP request testing
 */
global.fetch = jest.fn();

/**
 * Helper to create a minimal valid discovery config
 */
function createMinimalConfig(): DiscoveryConfig {
  return {
    mode: 'static',
    staticNodes: [
      { url: 'http://localhost:8080', id: 'node-1' },
    ],
    refreshIntervalMs: 30000,
    validationTimeoutMs: 2000,
  };
}

/**
 * Helper to create a config with multiple nodes
 */
function createMultiNodeConfig(): DiscoveryConfig {
  return {
    mode: 'static',
    staticNodes: [
      { url: 'http://localhost:8080', id: 'node-1' },
      { url: 'http://localhost:8081', id: 'node-2' },
      { url: 'http://localhost:8082', id: 'node-3' },
    ],
    refreshIntervalMs: 30000,
    validationTimeoutMs: 2000,
  };
}

/**
 * Helper to create mock callbacks
 */
function createMockCallbacks(): DiscoveryCallbacks {
  return {
    onNodeDiscovered: jest.fn(),
    onNodeLost: jest.fn(),
    onDiscoveryError: jest.fn(),
  };
}

/**
 * Helper to create a successful /v1/models response
 */
function createSuccessfulModelsResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        { id: 'test-model', object: 'model' },
      ],
    }),
  } as Response;
}

/**
 * Helper to create a failed HTTP response
 */
function createFailedResponse(status: number = 500) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'Internal Server Error' }),
  } as Response;
}

/**
 * Helper to create a timeout error
 */
function createTimeoutError() {
  const error = new Error('Request timeout');
  error.name = 'TimeoutError';
  return error;
}

/**
 * Helper to reset all mocks
 */
function resetMocks() {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
}

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeEach(() => {
  resetMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  resetMocks();
});

// ============================================================================
// Test Suite: DiscoveryError
// ============================================================================

describe('DiscoveryError', () => {
  describe('Error construction', () => {
    test('should create error with code and message', () => {
      const error = new DiscoveryError('VALIDATION_FAILED', 'Node validation failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DiscoveryError);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.message).toBe('Node validation failed');
    });

    test('should create error with nodeId context', () => {
      const error = new DiscoveryError(
        'NODE_TIMEOUT',
        'Node did not respond',
        { nodeId: 'node-1' }
      );

      expect(error.code).toBe('NODE_TIMEOUT');
      expect(error.message).toBe('Node did not respond');
      expect(error.nodeId).toBe('node-1');
    });

    test('should create error with url context', () => {
      const error = new DiscoveryError(
        'INVALID_URL',
        'URL is not valid',
        { url: 'http://invalid' }
      );

      expect(error.url).toBe('http://invalid');
    });

    test('should create error without context', () => {
      const error = new DiscoveryError('UNKNOWN_ERROR', 'Unknown error occurred');

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.nodeId).toBeUndefined();
      expect(error.url).toBeUndefined();
    });

    test('should have proper error name', () => {
      const error = new DiscoveryError('TEST_ERROR', 'Test');
      expect(error.name).toBe('DiscoveryError');
    });

    test('should be catchable as Error', () => {
      try {
        throw new DiscoveryError('TEST', 'Test error');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(DiscoveryError);
      }
    });
  });

  describe('Error codes', () => {
    test('should support VALIDATION_FAILED code', () => {
      const error = new DiscoveryError('VALIDATION_FAILED', 'Validation failed');
      expect(error.code).toBe('VALIDATION_FAILED');
    });

    test('should support NODE_TIMEOUT code', () => {
      const error = new DiscoveryError('NODE_TIMEOUT', 'Request timed out');
      expect(error.code).toBe('NODE_TIMEOUT');
    });

    test('should support INVALID_URL code', () => {
      const error = new DiscoveryError('INVALID_URL', 'Invalid URL format');
      expect(error.code).toBe('INVALID_URL');
    });

    test('should support HTTP_ERROR code', () => {
      const error = new DiscoveryError('HTTP_ERROR', 'HTTP request failed');
      expect(error.code).toBe('HTTP_ERROR');
    });

    test('should support NETWORK_ERROR code', () => {
      const error = new DiscoveryError('NETWORK_ERROR', 'Network unreachable');
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Constructor
// ============================================================================

describe('ClusterDiscovery - Constructor', () => {
  describe('Initialization', () => {
    test('should create instance with minimal config', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      expect(discovery).toBeInstanceOf(ClusterDiscovery);
    });

    test('should create instance with callbacks', () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      expect(discovery).toBeInstanceOf(ClusterDiscovery);
    });

    test('should create instance without callbacks', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      expect(discovery).toBeInstanceOf(ClusterDiscovery);
    });

    test('should start in stopped state', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      expect(discovery.isRunning()).toBe(false);
    });

    test('should have empty discovered nodes initially', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toEqual([]);
    });
  });

  describe('Config validation', () => {
    test('should throw on invalid mode', () => {
      const config: any = {
        mode: 'invalid-mode',
        staticNodes: [],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });

    test('should throw on missing staticNodes for static mode', () => {
      const config: any = {
        mode: 'static',
        // Missing staticNodes
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });

    test('should throw on negative refreshIntervalMs', () => {
      const config: any = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080', id: 'node-1' }],
        refreshIntervalMs: -1000,
        validationTimeoutMs: 2000,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });

    test('should throw on negative validationTimeoutMs', () => {
      const config: any = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080', id: 'node-1' }],
        refreshIntervalMs: 30000,
        validationTimeoutMs: -500,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });

    test('should throw on empty staticNodes array', () => {
      const config: any = {
        mode: 'static',
        staticNodes: [],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Lifecycle Management
// ============================================================================

describe('ClusterDiscovery - Lifecycle', () => {
  describe('start()', () => {
    test('should set isRunning to true', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      await discovery.start();

      expect(discovery.isRunning()).toBe(true);
    });

    test('should create refresh timer', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Verify setInterval was called
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    test('should perform initial discovery immediately', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Should have discovered the node
      expect(callbacks.onNodeDiscovered).toHaveBeenCalledWith('node-1', 'http://localhost:8080');
    });

    test('should throw if already running', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      await expect(discovery.start()).rejects.toThrow('already running');
    });

    test('should validate all configured nodes on start', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Should have validated all 3 nodes
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/models',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8081/v1/models',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8082/v1/models',
        expect.any(Object)
      );
    });
  });

  describe('stop()', () => {
    test('should set isRunning to false', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      discovery.stop();

      expect(discovery.isRunning()).toBe(false);
    });

    test('should clear refresh timer', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      const timerCountBefore = jest.getTimerCount();

      discovery.stop();

      const timerCountAfter = jest.getTimerCount();
      expect(timerCountAfter).toBeLessThan(timerCountBefore);
    });

    test('should not throw if already stopped', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      expect(() => discovery.stop()).not.toThrow();
    });

    test('should not trigger callbacks after stop', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      callbacks.onNodeDiscovered?.mockClear();

      discovery.stop();

      // Advance timers past refresh interval
      jest.advanceTimersByTime(config.refreshIntervalMs + 1000);

      // Should not have triggered any callbacks
      expect(callbacks.onNodeDiscovered).not.toHaveBeenCalled();
    });

    test('should prevent new discovery after stop', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      const fetchCountBefore = (global.fetch as jest.Mock).mock.calls.length;

      discovery.stop();

      // Advance timers
      jest.advanceTimersByTime(config.refreshIntervalMs + 1000);

      const fetchCountAfter = (global.fetch as jest.Mock).mock.calls.length;
      expect(fetchCountAfter).toBe(fetchCountBefore);
    });
  });

  describe('isRunning()', () => {
    test('should return false initially', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      expect(discovery.isRunning()).toBe(false);
    });

    test('should return true after start', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(discovery.isRunning()).toBe(true);
    });

    test('should return false after stop', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      discovery.stop();

      expect(discovery.isRunning()).toBe(false);
    });

    test('should return true during discovery', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 100))
      );

      const startPromise = discovery.start();

      expect(discovery.isRunning()).toBe(true);

      await startPromise;
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Static Node Discovery
// ============================================================================

describe('ClusterDiscovery - Static Discovery', () => {
  describe('Reading static nodes', () => {
    test('should discover single static node', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('node-1');
      expect(nodes[0].url).toBe('http://localhost:8080');
    });

    test('should discover multiple static nodes', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(3);
      expect(nodes.map((n) => n.id)).toEqual(['node-1', 'node-2', 'node-3']);
    });

    test('should preserve node order from config', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes[0].id).toBe('node-1');
      expect(nodes[1].id).toBe('node-2');
      expect(nodes[2].id).toBe('node-3');
    });

    test('should filter out nodes that fail validation', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-1: success
        .mockResolvedValueOnce(createFailedResponse(500)) // node-2: fail
        .mockResolvedValueOnce(createSuccessfulModelsResponse()); // node-3: success

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes.map((n) => n.id)).toEqual(['node-1', 'node-3']);
    });

    test('should handle all nodes failing validation', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createFailedResponse(500));

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Node deduplication', () => {
    test('should deduplicate nodes with same ID', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [
          { url: 'http://localhost:8080', id: 'node-1' },
          { url: 'http://localhost:8081', id: 'node-1' }, // Duplicate ID
        ],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      // Should only have one node with id 'node-1'
      expect(nodes.filter((n) => n.id === 'node-1')).toHaveLength(1);
    });

    test('should deduplicate nodes with same URL', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [
          { url: 'http://localhost:8080', id: 'node-1' },
          { url: 'http://localhost:8080', id: 'node-2' }, // Duplicate URL
        ],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      // Should only have one node with url 'http://localhost:8080'
      expect(nodes.filter((n) => n.url === 'http://localhost:8080')).toHaveLength(1);
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Node Validation
// ============================================================================

describe('ClusterDiscovery - Node Validation', () => {
  describe('HTTP validation', () => {
    test('should validate via GET /v1/models', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/models',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        })
      );
    });

    test('should include timeout in request', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    });

    test('should accept 200 OK response', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(1);
    });

    test('should reject 404 response', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createFailedResponse(404));

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });

    test('should reject 500 response', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createFailedResponse(500));

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });

    test('should validate response JSON structure', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'response' }),
      } as Response);

      await discovery.start();

      // Should reject nodes with invalid response
      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Timeout handling', () => {
    test('should timeout after validationTimeoutMs', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 10000))
      );

      await discovery.start();

      // Should have timed out
      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
      expect(callbacks.onDiscoveryError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NODE_TIMEOUT',
        })
      );
    });

    test('should abort fetch on timeout', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      const abortSpy = jest.fn();
      (global.fetch as jest.Mock).mockImplementation((url, options) => {
        options.signal.addEventListener('abort', abortSpy);
        return new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 10000));
      });

      await discovery.start();

      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('Network error handling', () => {
    test('should handle network errors', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
      expect(callbacks.onDiscoveryError).toHaveBeenCalled();
    });

    test('should handle DNS errors', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      const dnsError = new Error('getaddrinfo ENOTFOUND');
      dnsError.name = 'DNSError';
      (global.fetch as jest.Mock).mockRejectedValue(dnsError);

      await discovery.start();

      expect(callbacks.onDiscoveryError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NETWORK_ERROR',
        })
      );
    });

    test('should handle connection refused', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      const connError = new Error('connect ECONNREFUSED');
      connError.name = 'ConnectionError';
      (global.fetch as jest.Mock).mockRejectedValue(connError);

      await discovery.start();

      expect(callbacks.onDiscoveryError).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Refresh Logic
// ============================================================================

describe('ClusterDiscovery - Refresh Logic', () => {
  describe('Periodic refresh', () => {
    test('should refresh nodes at configured interval', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      (global.fetch as jest.Mock).mockClear();

      // Advance time to trigger refresh
      jest.advanceTimersByTime(config.refreshIntervalMs);

      // Wait for async refresh
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalled();
    });

    test('should not refresh before interval elapsed', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      (global.fetch as jest.Mock).mockClear();

      // Advance time but not enough to trigger refresh
      jest.advanceTimersByTime(config.refreshIntervalMs - 1000);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should continue refreshing until stopped', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      (global.fetch as jest.Mock).mockClear();

      // Trigger multiple refreshes
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(config.refreshIntervalMs);
        await Promise.resolve();
      }

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Node change detection', () => {
    test('should detect newly available nodes', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // First discovery: only node-1 is available
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-1
        .mockRejectedValueOnce(new Error('Connection refused')) // node-2
        .mockRejectedValueOnce(new Error('Connection refused')); // node-3

      await discovery.start();
      callbacks.onNodeDiscovered?.mockClear();

      // Second discovery: node-2 becomes available
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-1
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-2 (NEW!)
        .mockRejectedValueOnce(new Error('Connection refused')); // node-3

      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(callbacks.onNodeDiscovered).toHaveBeenCalledWith('node-2', 'http://localhost:8081');
    });

    test('should detect lost nodes', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // First discovery: all nodes available
      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      callbacks.onNodeLost?.mockClear();

      // Second discovery: node-2 goes offline
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-1
        .mockRejectedValueOnce(new Error('Connection refused')) // node-2 (LOST!)
        .mockResolvedValueOnce(createSuccessfulModelsResponse()); // node-3

      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(callbacks.onNodeLost).toHaveBeenCalledWith('node-2', 'http://localhost:8081');
    });

    test('should detect multiple new nodes', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // First discovery: no nodes available
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      await discovery.start();
      callbacks.onNodeDiscovered?.mockClear();

      // Second discovery: all nodes become available
      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(callbacks.onNodeDiscovered).toHaveBeenCalledTimes(3);
    });

    test('should detect multiple lost nodes', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // First discovery: all nodes available
      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      callbacks.onNodeLost?.mockClear();

      // Second discovery: all nodes go offline
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(callbacks.onNodeLost).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrent refresh prevention', () => {
    test('should prevent overlapping refresh operations', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      // Make validation slow
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 5000))
      );

      await discovery.start();
      (global.fetch as jest.Mock).mockClear();

      // Trigger refresh
      jest.advanceTimersByTime(config.refreshIntervalMs);

      // Try to trigger another refresh while first is still running
      jest.advanceTimersByTime(config.refreshIntervalMs);

      // Should only call fetch once (second refresh blocked)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('should allow refresh after previous completes', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      (global.fetch as jest.Mock).mockClear();

      // First refresh
      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      // Second refresh (should be allowed)
      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Callbacks
// ============================================================================

describe('ClusterDiscovery - Callbacks', () => {
  describe('onNodeDiscovered callback', () => {
    test('should invoke on new node discovered', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(callbacks.onNodeDiscovered).toHaveBeenCalledWith('node-1', 'http://localhost:8080');
    });

    test('should invoke for each discovered node', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(callbacks.onNodeDiscovered).toHaveBeenCalledTimes(3);
    });

    test('should not invoke if callback not provided', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config); // No callbacks

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      // Should not throw
      await expect(discovery.start()).resolves.not.toThrow();
    });

    test('should handle callback errors gracefully', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      callbacks.onNodeDiscovered?.mockImplementation(() => {
        throw new Error('Callback error');
      });

      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      // Should not throw even if callback throws
      await expect(discovery.start()).resolves.not.toThrow();
    });
  });

  describe('onNodeLost callback', () => {
    test('should invoke when node becomes unavailable', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // First: node available
      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());
      await discovery.start();

      callbacks.onNodeLost?.mockClear();

      // Second: node unavailable
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      expect(callbacks.onNodeLost).toHaveBeenCalledWith('node-1', 'http://localhost:8080');
    });

    test('should not invoke if node was never discovered', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      // Node never available
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      await discovery.start();

      expect(callbacks.onNodeLost).not.toHaveBeenCalled();
    });

    test('should not invoke if callback not provided', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createSuccessfulModelsResponse())
        .mockRejectedValueOnce(new Error('Connection refused'));

      await discovery.start();
      jest.advanceTimersByTime(config.refreshIntervalMs);

      // Should not throw
      await Promise.resolve();
    });
  });

  describe('onDiscoveryError callback', () => {
    test('should invoke on validation timeout', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 10000))
      );

      await discovery.start();

      expect(callbacks.onDiscoveryError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NODE_TIMEOUT',
          nodeId: 'node-1',
        })
      );
    });

    test('should invoke on network error', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await discovery.start();

      expect(callbacks.onDiscoveryError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NETWORK_ERROR',
        })
      );
    });

    test('should invoke on HTTP error', async () => {
      const config = createMinimalConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock).mockResolvedValue(createFailedResponse(500));

      await discovery.start();

      expect(callbacks.onDiscoveryError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'HTTP_ERROR',
        })
      );
    });

    test('should not invoke if callback not provided', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(discovery.start()).resolves.not.toThrow();
    });

    test('should continue discovery after error', async () => {
      const config = createMultiNodeConfig();
      const callbacks = createMockCallbacks();
      const discovery = new ClusterDiscovery(config, callbacks);

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Error')) // node-1: error
        .mockResolvedValueOnce(createSuccessfulModelsResponse()) // node-2: success
        .mockResolvedValueOnce(createSuccessfulModelsResponse()); // node-3: success

      await discovery.start();

      // Should have discovered 2 nodes despite error on first
      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(2);
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - getDiscoveredNodes()
// ============================================================================

describe('ClusterDiscovery - getDiscoveredNodes()', () => {
  describe('Return value', () => {
    test('should return empty array initially', () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      const nodes = discovery.getDiscoveredNodes();

      expect(nodes).toEqual([]);
    });

    test('should return discovered nodes', async () => {
      const config = createMultiNodeConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();

      expect(nodes).toHaveLength(3);
      expect(nodes[0]).toMatchObject({
        id: 'node-1',
        url: 'http://localhost:8080',
      });
    });

    test('should return immutable copy', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes1 = discovery.getDiscoveredNodes();
      const nodes2 = discovery.getDiscoveredNodes();

      expect(nodes1).not.toBe(nodes2); // Different array instances
      expect(nodes1).toEqual(nodes2); // Same content
    });

    test('should reflect current state', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      // First: node available
      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());
      await discovery.start();

      let nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(1);

      // Second: node unavailable
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      jest.advanceTimersByTime(config.refreshIntervalMs);
      await Promise.resolve();

      nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('Node structure', () => {
    test('should include node ID', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();

      expect(nodes[0].id).toBeDefined();
      expect(typeof nodes[0].id).toBe('string');
    });

    test('should include node URL', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();

      expect(nodes[0].url).toBeDefined();
      expect(typeof nodes[0].url).toBe('string');
    });

    test('should include lastSeen timestamp', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      const nodes = discovery.getDiscoveredNodes();

      expect(nodes[0].lastSeen).toBeDefined();
      expect(typeof nodes[0].lastSeen).toBe('number');
      expect(nodes[0].lastSeen).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Memory Management
// ============================================================================

describe('ClusterDiscovery - Memory Management', () => {
  describe('Timer cleanup', () => {
    test('should clear timer on stop', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      const timersBefore = jest.getTimerCount();

      discovery.stop();
      const timersAfter = jest.getTimerCount();

      expect(timersAfter).toBeLessThan(timersBefore);
    });

    test('should clear timer on multiple start/stop cycles', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      // Start/stop 3 times
      for (let i = 0; i < 3; i++) {
        await discovery.start();
        discovery.stop();
      }

      // Should have no lingering timers
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('State cleanup', () => {
    test('should clear discovered nodes on stop', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();
      discovery.stop();

      const nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(0);
    });

    test('should reset state on restart', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      // First run
      await discovery.start();
      let nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(1);

      discovery.stop();

      // Second run
      await discovery.start();
      nodes = discovery.getDiscoveredNodes();
      expect(nodes).toHaveLength(1);
    });
  });
});

// ============================================================================
// Test Suite: ClusterDiscovery - Edge Cases
// ============================================================================

describe('ClusterDiscovery - Edge Cases', () => {
  describe('Configuration edge cases', () => {
    test('should handle zero refresh interval', () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080', id: 'node-1' }],
        refreshIntervalMs: 0,
        validationTimeoutMs: 2000,
      };

      expect(() => new ClusterDiscovery(config)).toThrow();
    });

    test('should handle very short refresh interval', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080', id: 'node-1' }],
        refreshIntervalMs: 100,
        validationTimeoutMs: 50,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Should handle rapid refreshes
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      discovery.stop();
    });

    test('should handle very long refresh interval', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080', id: 'node-1' }],
        refreshIntervalMs: 3600000, // 1 hour
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(discovery.isRunning()).toBe(true);

      discovery.stop();
    });
  });

  describe('URL edge cases', () => {
    test('should handle URLs with trailing slash', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080/', id: 'node-1' }],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Should normalize URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/models'),
        expect.any(Object)
      );
    });

    test('should handle URLs with path', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://localhost:8080/api', id: 'node-1' }],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/models',
        expect.any(Object)
      );
    });

    test('should handle IPv6 URLs', async () => {
      const config: DiscoveryConfig = {
        mode: 'static',
        staticNodes: [{ url: 'http://[::1]:8080', id: 'node-1' }],
        refreshIntervalMs: 30000,
        validationTimeoutMs: 2000,
      };

      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://[::1]:8080/v1/models',
        expect.any(Object)
      );
    });
  });

  describe('Concurrent operations', () => {
    test('should handle stop during initial discovery', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createSuccessfulModelsResponse()), 1000))
      );

      const startPromise = discovery.start();

      // Stop before discovery completes
      discovery.stop();

      await expect(startPromise).rejects.toThrow();
    });

    test('should handle multiple getDiscoveredNodes calls', async () => {
      const config = createMinimalConfig();
      const discovery = new ClusterDiscovery(config);

      (global.fetch as jest.Mock).mockResolvedValue(createSuccessfulModelsResponse());

      await discovery.start();

      // Multiple concurrent calls
      const results = await Promise.all([
        Promise.resolve(discovery.getDiscoveredNodes()),
        Promise.resolve(discovery.getDiscoveredNodes()),
        Promise.resolve(discovery.getDiscoveredNodes()),
      ]);

      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });
  });
});
