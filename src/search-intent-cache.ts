/**
 * IntentCache - LRU cache with TTL for search intent classification results
 *
 * Implements an LRU (Least Recently Used) cache with TTL (Time To Live) expiration
 * for storing GenAI-based search intent classification results.
 *
 * Features:
 * - LRU eviction: Removes least recently used items when cache is full
 * - TTL expiration: Automatically expires entries after configured time
 * - Message normalization: Consistent cache keys (lowercase, trim, remove punctuation)
 * - Statistics tracking: Hits, misses, hit rate
 */

import { debug } from "./debug";

export interface CachedIntent {
  intent: boolean;
  timestamp: number;
  normalizedMessage: string;
}

/**
 * Normalize a message for consistent cache keys
 * - Convert to lowercase
 * - Trim leading/trailing whitespace
 * - Collapse multiple spaces to single space
 * - Remove trailing punctuation (?, !, ., etc.)
 */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,:;]+$/g, "");
}

export class IntentCache {
  private cache: Map<string, CachedIntent>;
  private maxSize: number;
  private ttlSeconds: number;
  private hits: number = 0;
  private misses: number = 0;
  private getNow: () => number;

  /**
   * Create a new IntentCache
   * @param maxSize Maximum number of cache entries (default: 100)
   * @param ttlSeconds Time-to-live in seconds, 0 to disable (default: 300 = 5 minutes)
   */
  constructor(maxSize: number = 100, ttlSeconds: number = 300) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlSeconds = ttlSeconds;
    // Use a function to get current time so it works with jest.setSystemTime()
    this.getNow = () => Date.now();

    debug(2, "[IntentCache] Created cache", { maxSize, ttlSeconds });
  }

  /**
   * Get cached intent for a message
   * @param message User message to look up
   * @returns Cached intent (true/false) or null if not found/expired
   */
  get(message: string): boolean | null {
    const normalized = normalizeMessage(message);
    const cached = this.cache.get(normalized);

    if (!cached) {
      this.misses++;
      debug(3, "[IntentCache] Cache miss", { message: normalized });
      return null;
    }

    // Check if expired (TTL disabled if ttlSeconds === 0)
    if (this.ttlSeconds > 0) {
      const age = this.getNow() - cached.timestamp;
      const maxAge = this.ttlSeconds * 1000;

      if (age > maxAge) {
        // Expired - remove and count as miss
        this.cache.delete(normalized);
        this.misses++;
        debug(3, "[IntentCache] Cache miss (expired)", {
          message: normalized,
          age,
        });
        return null;
      }
    }

    // Cache hit - move to end (most recently used)
    this.cache.delete(normalized);
    this.cache.set(normalized, cached);

    this.hits++;
    debug(3, "[IntentCache] Cache hit", {
      message: normalized,
      intent: cached.intent,
    });
    return cached.intent;
  }

  /**
   * Set cached intent for a message
   * @param message User message
   * @param intent Classification result (true = search, false = not search)
   */
  set(message: string, intent: boolean): void {
    const normalized = normalizeMessage(message);

    // If updating existing entry, remove it first (will re-add as most recent)
    if (this.cache.has(normalized)) {
      this.cache.delete(normalized);
    }

    // Evict least recently used if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string;
      if (firstKey) {
        this.cache.delete(firstKey);
        debug(3, "[IntentCache] LRU eviction", { evicted: firstKey });
      }
    }

    // Add new entry (at end = most recently used)
    const entry: CachedIntent = {
      intent,
      timestamp: this.getNow(),
      normalizedMessage: normalized,
    };

    this.cache.set(normalized, entry);
    debug(3, "[IntentCache] Cached intent", { message: normalized, intent });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    debug(2, "[IntentCache] Cache cleared");
  }

  /**
   * Get cache statistics
   * @returns Statistics object with size, hits, misses, and hit rate
   */
  getStats(): { size: number; hitRate: number; hits: number; misses: number } {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }
}
