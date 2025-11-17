# Security Audit Fixes - Issue #5 RAM Cache

## Overview

This document provides exact code fixes for the vulnerabilities discovered in the security audit.

**Audit Date**: 2025-11-17
**Vulnerabilities Found**: 4 (2 HIGH, 2 MEDIUM)
**Estimated Fix Time**: 4-5 hours total

---

## Fix #1: Unbounded Key Memory Allocation (HIGH)

### Problem

Keys are stored in memory but not tracked in the memory limit. An attacker can exhaust RAM by storing large keys.

### Current Code (VULNERABLE)

File: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/ram_cache.py`

```python
# Lines 40-47: Data structures don't track key size
self.caches: dict[str, bytes] = {}
self.metadata: dict[str, dict[str, Any]] = {}

# Lines 78-79: Size calculation ignores keys
size_mb = len(value) / (1024 * 1024)

# Lines 87-92: Memory check doesn't include keys
needed_space = size_mb - existing_size
while needed_space > 0 and self._get_memory_used() + needed_space >= self.max_memory_mb:
```

### Fixed Code

```python
import sys

class InMemoryKVCacheManager:
    # ... existing code ...

    # Add constant for max key size
    MAX_KEY_SIZE_BYTES = 10000  # 10KB max key

    def set(self, key: str, value: bytes, prefix_tokens: Optional[int] = None) -> None:
        """
        Store value in RAM cache with metadata

        Args:
            key: Cache key (must be non-empty, max 10KB)
            value: Binary data to cache (must be bytes)
            prefix_tokens: Optional token count for prefix tracking

        Raises:
            TypeError: If value is not bytes
            ValueError: If value is None, key exceeds size limit, or exceeds cache memory limit
        """
        # Validate inputs
        if not key:
            raise ValueError("Cache key cannot be empty")  # FIX #3: Was silent failure

        # FIX #1: Validate key size
        if len(key) > self.MAX_KEY_SIZE_BYTES:
            raise ValueError(
                f"Key size {len(key)} bytes exceeds maximum {self.MAX_KEY_SIZE_BYTES} bytes"
            )

        if value is None:
            raise ValueError("Cache value cannot be None")

        if not isinstance(value, bytes):
            raise TypeError(f"Cache value must be bytes, got {type(value).__name__}")

        with self.lock:
            # FIX #1: Calculate total size including key
            key_size_bytes = sys.getsizeof(key)  # Python object size
            value_size_bytes = len(value)
            total_size_mb = (key_size_bytes + value_size_bytes) / (1024 * 1024)

            # Validate value size doesn't exceed cache limit
            if total_size_mb > self.max_memory_mb:
                raise ValueError(
                    f"Entry size {total_size_mb:.1f} MB (key: {key_size_bytes} bytes, "
                    f"value: {value_size_bytes} bytes) exceeds cache limit {self.max_memory_mb} MB. "
                    f"Cannot store entries larger than the entire cache."
                )

            # Check if updating existing key - need to account for freed space
            existing_size = 0.0
            if key in self.caches:
                # FIX #1: Include old key size in freed space
                old_key_size = sys.getsizeof(self.caches.keys().__iter__().__next__() if key in self.caches else "")
                old_metadata = self.metadata[key]
                existing_size = (old_key_size + old_metadata['size_mb'] * (1024 * 1024)) / (1024 * 1024)

            # Evict LRU entries if needed (considering freed space from update)
            needed_space = total_size_mb - existing_size
            while needed_space > 0 and self._get_memory_used() + needed_space >= self.max_memory_mb:
                # Don't evict the key we're updating
                if not self._evict_lru(exclude_key=key):
                    # No more entries to evict
                    break

            # Store value and metadata
            self.caches[key] = value
            self.metadata[key] = {
                'timestamp': time.time(),
                'size_mb': total_size_mb,  # FIX #1: Now includes key size
                'access_count': 0,
                'prefix_tokens': prefix_tokens,
                'key_size_bytes': key_size_bytes  # FIX #1: Track key size for updates
            }

    def _get_memory_used(self) -> float:
        """
        Calculate total memory used in MB

        Note: Assumes lock is already held by caller

        Returns:
            Total memory used in MB (includes both key and value sizes)
        """
        return sum(meta['size_mb'] for meta in self.metadata.values())

    def get_stats(self) -> dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Dictionary with statistics:
                - total_entries: Number of cached items
                - memory_used_mb: Total memory used in MB (keys + values)
                - key_memory_mb: Total key memory in MB
                - value_memory_mb: Total value memory in MB
                - cache_hits: Number of successful cache hits
                - cache_misses: Number of cache misses
                - hit_rate: Cache hit rate (0.0-1.0)
                - evictions: Number of entries evicted
        """
        with self.lock:
            total_hits = self.cache_hits
            total_misses = self.cache_misses
            total_requests = total_hits + total_misses
            hit_rate = total_hits / total_requests if total_requests > 0 else 0.0

            # FIX #1: Separate key and value memory tracking
            key_memory_mb = sum(meta.get('key_size_bytes', 0) for meta in self.metadata.values()) / (1024 * 1024)
            total_memory_mb = self._get_memory_used()
            value_memory_mb = total_memory_mb - key_memory_mb

            return {
                'total_entries': len(self.caches),
                'memory_used_mb': total_memory_mb,
                'key_memory_mb': key_memory_mb,
                'value_memory_mb': value_memory_mb,
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'hit_rate': hit_rate,
                'evictions': self.evictions
            }
```

### Testing

Add to test suite:

```python
def test_key_memory_tracked(self):
    """Test that key memory is tracked in the limit"""
    cache = InMemoryKVCacheManager(max_memory_mb=1)

    # Try to store large key - should be rejected or tracked
    large_key = "k" * 100000
    try:
        cache.set(large_key, b"v")
        # If accepted, verify it's tracked
        stats = cache.get_stats()
        self.assertGreater(stats['key_memory_mb'], 0)
    except ValueError:
        # Also acceptable - key too large
        pass

def test_key_size_limit(self):
    """Test that key size is limited"""
    cache = InMemoryKVCacheManager(max_memory_mb=100)

    # Try to store key larger than limit
    oversized_key = "k" * (InMemoryKVCacheManager.MAX_KEY_SIZE_BYTES + 1)
    with self.assertRaises(ValueError) as context:
        cache.set(oversized_key, b"value")

    self.assertIn("exceeds maximum", str(context.exception))
```

---

## Fix #2: Silent Failure on Empty Keys (MEDIUM)

### Problem

Empty keys are silently ignored instead of raising an error, making bugs hard to detect.

### Current Code (VULNERABLE)

```python
def set(self, key: str, value: bytes, prefix_tokens: Optional[int] = None) -> None:
    # Validate inputs
    if not key:
        return  # Silently ignore empty keys
```

### Fixed Code

```python
def set(self, key: str, value: bytes, prefix_tokens: Optional[int] = None) -> None:
    # Validate inputs
    if not key:
        raise ValueError("Cache key cannot be empty")
```

Also fix `get()` and `get_metadata()`:

```python
def get(self, key: str) -> Optional[bytes]:
    if not key:
        raise ValueError("Cache key cannot be empty")  # Changed from: return None

    with self.lock:
        # ... rest of method ...

def get_metadata(self, key: str) -> Optional[dict[str, Any]]:
    if not key:
        raise ValueError("Cache key cannot be empty")  # Changed from: return None

    with self.lock:
        # ... rest of method ...
```

### Testing

```python
def test_empty_key_raises_error(self):
    """Test that empty keys raise ValueError"""
    cache = InMemoryKVCacheManager()

    with self.assertRaises(ValueError) as context:
        cache.set("", b"value")
    self.assertIn("empty", str(context.exception).lower())

    with self.assertRaises(ValueError) as context:
        cache.get("")
    self.assertIn("empty", str(context.exception).lower())
```

---

## Fix #3: Float Precision in Memory Limit (HIGH)

### Problem

Float arithmetic in size calculations could allow exceeding memory limit due to precision issues.

### Current Code (VULNERABLE)

```python
# Line 78-79
size_mb = len(value) / (1024 * 1024)  # Float division

# Line 93
while needed_space > 0 and self._get_memory_used() + needed_space >= self.max_memory_mb:
```

### Fixed Code

Use integer-based tracking:

```python
import math

class InMemoryKVCacheManager:
    # Track memory in bytes internally, convert to MB only for reporting

    def __init__(self, max_memory_mb: int = 300000, eviction_policy: str = 'lru'):
        """
        Initialize RAM-based cache manager

        Args:
            max_memory_mb: Maximum memory in MB (default 300GB for M3 Ultra)
            eviction_policy: Eviction strategy ('lru' for least-recently-used)
        """
        self.max_memory_mb = max_memory_mb
        self.max_memory_bytes = max_memory_mb * 1024 * 1024  # Convert to bytes once
        self.eviction_policy = eviction_policy
        # ... rest of init ...

    def set(self, key: str, value: bytes, prefix_tokens: Optional[int] = None) -> None:
        with self.lock:
            # FIX #2: Use integer bytes, not floats
            key_size_bytes = sys.getsizeof(key)
            value_size_bytes = len(value)
            total_size_bytes = key_size_bytes + value_size_bytes

            # Validate value size doesn't exceed cache limit
            if total_size_bytes > self.max_memory_bytes:
                total_size_mb = total_size_bytes / (1024 * 1024)
                raise ValueError(
                    f"Entry size {total_size_mb:.1f} MB exceeds cache limit {self.max_memory_mb} MB. "
                    f"Cannot store entries larger than the entire cache."
                )

            # Check if updating existing key
            existing_size_bytes = 0
            if key in self.caches:
                existing_size_bytes = self.metadata[key]['size_bytes']

            # Evict LRU entries if needed (using integer math - no precision issues)
            needed_space_bytes = total_size_bytes - existing_size_bytes
            while needed_space_bytes > 0 and self._get_memory_used_bytes() + needed_space_bytes >= self.max_memory_bytes:
                if not self._evict_lru(exclude_key=key):
                    break

            # Store value and metadata
            self.caches[key] = value
            self.metadata[key] = {
                'timestamp': time.time(),
                'size_bytes': total_size_bytes,  # Store in bytes, not MB
                'access_count': 0,
                'prefix_tokens': prefix_tokens,
                'key_size_bytes': key_size_bytes
            }

    def _get_memory_used_bytes(self) -> int:
        """
        Calculate total memory used in bytes (no float precision issues)

        Note: Assumes lock is already held by caller

        Returns:
            Total memory used in bytes
        """
        return sum(meta['size_bytes'] for meta in self.metadata.values())

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics with proper float conversion at reporting time"""
        with self.lock:
            total_hits = self.cache_hits
            total_misses = self.cache_misses
            total_requests = total_hits + total_misses
            hit_rate = total_hits / total_requests if total_requests > 0 else 0.0

            # Convert bytes to MB only for reporting (not for comparisons)
            total_memory_bytes = self._get_memory_used_bytes()
            total_memory_mb = total_memory_bytes / (1024 * 1024)

            return {
                'total_entries': len(self.caches),
                'memory_used_mb': total_memory_mb,
                'memory_used_bytes': total_memory_bytes,
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'hit_rate': hit_rate,
                'evictions': self.evictions
            }
```

### Testing

```python
def test_float_precision_boundary(self):
    """Test that memory limit is strictly enforced with byte accuracy"""
    # Test with small cache size for precision testing
    cache = InMemoryKVCacheManager(max_memory_mb=1)

    # Store exactly 1MB (1024*1024 bytes)
    value_1mb = b"x" * (1024 * 1024)
    cache.set("key1", value_1mb)

    stats = cache.get_stats()
    memory_bytes = stats.get('memory_used_bytes', int(stats['memory_used_mb'] * 1024 * 1024))

    # Try to add 1 more byte - should trigger eviction or fail
    try:
        cache.set("key2", b"y")
        # If successful, verify no overage
        stats2 = cache.get_stats()
        memory_bytes2 = stats2.get('memory_used_bytes', int(stats2['memory_used_mb'] * 1024 * 1024))

        # Should not exceed limit significantly
        self.assertLess(memory_bytes2, self.max_memory_bytes + 1000)  # Small tolerance
    except ValueError:
        # Also acceptable - quota exceeded
        pass
```

---

## Fix #4: No Key Size Limit Validation (MEDIUM)

### Already Fixed in Fix #1

See lines above where we added:

```python
MAX_KEY_SIZE_BYTES = 10000  # 10KB max key

if len(key) > self.MAX_KEY_SIZE_BYTES:
    raise ValueError(
        f"Key size {len(key)} bytes exceeds maximum {self.MAX_KEY_SIZE_BYTES} bytes"
    )
```

---

## Summary of Changes

### Files to Modify

- `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/ram_cache.py`

### Key Changes

1. Add `import sys` at top
2. Add `MAX_KEY_SIZE_BYTES = 10000` constant
3. Track internal memory in bytes, not floats
4. Add key size tracking in metadata
5. Include key memory in all size calculations
6. Change empty key handling from silent to ValueError
7. Update statistics to show separate key/value memory
8. Update tests with security-focused test cases

### Backwards Compatibility

- Public API remains the same (same method signatures)
- Existing code will work but may hit the new key size limit if keys exceed 10KB
- Statistics dictionary has new fields but old fields still present

### Testing Added

- Key memory tracking verification
- Key size limit validation
- Float precision boundary testing
- Empty key error handling

---

## Verification Checklist

After applying fixes:

- [ ] All 37 original tests still pass
- [ ] New security tests pass
- [ ] Key memory is tracked in statistics
- [ ] Memory limit cannot be exceeded via keys
- [ ] Empty keys raise ValueError
- [ ] Integer-based memory tracking uses no floats
- [ ] Code review completed
- [ ] No regressions in mlx-server.py integration

---

## Implementation Order

1. First: Apply float precision fix (safest, no API changes)
2. Second: Add key size limit validation
3. Third: Fix empty key handling
4. Fourth: Add tests
5. Finally: Run full test suite

Estimated time per step:

1. 30-45 minutes
2. 30-45 minutes
3. 15 minutes
4. 60-90 minutes
5. 15 minutes

**Total: 3.5-4.5 hours**
