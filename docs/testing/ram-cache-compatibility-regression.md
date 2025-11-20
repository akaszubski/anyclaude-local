# RAM Cache Compatibility - Regression Testing

## Overview

This document describes regression tests added to prevent AttributeError when using MLX mode with `InMemoryKVCacheManager`.

## Bug History

**Version**: v2.2.0
**Date**: 2025-11-20
**Impact**: MLX mode completely broken (unusable)

### Symptoms

MLX mode failed on startup with:

```
AttributeError: 'InMemoryKVCacheManager' object has no attribute 'has_cache'
AttributeError: 'InMemoryKVCacheManager' object has no attribute '_count_tokens'
```

### Root Cause

The `InMemoryKVCacheManager` class (RAM-based cache) was missing two methods that `mlx-server.py` expected:

1. **`has_cache(key)`** - Used during cache warmup to check if cached data exists (line 585)
2. **`_count_tokens(tokenizer, text)`** - Used during generation for metrics tracking (line 913)

These methods existed in the older `MLXKVCacheManager` (disk-based) but were not implemented when switching to RAM-based cache.

### User Impact

- **Severity**: Critical (blocks all MLX mode usage)
- **Affected users**: Anyone using `--mode=mlx` or default backend
- **Workaround**: Switch to OpenRouter (`--mode=openrouter`) or Claude mode

## Fix Applied

Added two compatibility methods to `scripts/ram_cache.py`:

### 1. `has_cache(key: str) -> tuple[bool, Optional[str]]`

```python
def has_cache(self, key: str) -> tuple[bool, Optional[str]]:
    """Check if cache exists for a given key"""
    with self.lock:
        exists = key in self.caches
        return (exists, key if exists else None)
```

**Behavior**:
- Returns `(True, key)` if key is cached
- Returns `(False, None)` if key doesn't exist
- Thread-safe with lock protection

### 2. `_count_tokens(tokenizer, text: str) -> int`

```python
def _count_tokens(self, tokenizer, text: str) -> int:
    """Count tokens in text using tokenizer"""
    try:
        if hasattr(tokenizer, 'encode'):
            return len(tokenizer.encode(text))
        else:
            return len(text) // 4  # Fallback: ~4 chars per token
    except Exception:
        return len(text) // 4  # Fallback on error
```

**Behavior**:
- Uses tokenizer's `encode()` method if available
- Falls back to character-based estimation (4 chars/token)
- Gracefully handles exceptions without crashing

## Regression Test Coverage

### Unit Tests: `tests/regression/test_ram_cache_compatibility_methods.py`

**Test Classes**:

1. **`TestInMemoryKVCacheManagerHasCache`** (8 tests)
   - Returns tuple format
   - True for existing keys
   - False for nonexistent keys
   - Multiple keys handling
   - Behavior after delete/clear
   - Empty keys
   - Special characters

2. **`TestInMemoryKVCacheManagerCountTokens`** (8 tests)
   - Mock tokenizer
   - Empty string
   - Large text
   - Fallback scenarios (no tokenizer, no encode(), exceptions)
   - Unicode handling
   - Multiline text

3. **`TestMLXServerIntegrationScenarios`** (3 tests)
   - Cache warmup workflow
   - Token counting workflow
   - Full generation cycle

**Total**: 19 regression tests

### Integration Tests: `tests/integration/test_mlx_mode_startup_regression.py`

**Test Class**: `TestMLXModeStartupRegression` (6 tests)

- Cache warmup doesn't raise AttributeError
- Token counting doesn't raise AttributeError
- Full workflow without errors
- Both methods exist and are callable
- Signatures are compatible with MLX server

**Total**: 6 integration tests

## Test Execution

### Run Regression Tests Only

```bash
# Python regression tests
python3 tests/regression/test_ram_cache_compatibility_methods.py

# Python integration tests
python3 tests/integration/test_mlx_mode_startup_regression.py
```

### Run All RAM Cache Tests

```bash
# Unit + regression + integration
python3 tests/unit/test_ram_cache.py && \
python3 tests/regression/test_ram_cache_compatibility_methods.py && \
python3 tests/integration/test_mlx_mode_startup_regression.py
```

### Automated Test Suite

Tests are automatically run via:

1. **Pre-commit hook** (`.githooks/pre-commit`)
   - Runs TypeScript type checking
   - Fast validation before commits

2. **Pre-push hook** (`.githooks/pre-push`)
   - Runs full test suite: `npm test`
   - Includes all Python and JavaScript tests
   - Blocks push if tests fail

### CI/CD Integration

```bash
# Full test suite (what pre-push hook runs)
npm test

# This includes:
# - TypeScript unit tests
# - JavaScript integration tests
# - Python unit tests (via npm test)
# - Python regression tests
# - Python integration tests
```

## Prevention

### Code Review Checklist

When modifying `InMemoryKVCacheManager` or `MLXKVCacheManager`:

- [ ] Check if MLX server depends on any methods
- [ ] Search codebase for `cache_manager.method_name()` calls
- [ ] Run MLX mode manually before merging
- [ ] Verify all Python tests pass
- [ ] Check git hooks are enabled: `git config core.hooksPath`

### Manual Verification

```bash
# Build
npm run build

# Test MLX mode startup (should complete without AttributeError)
./dist/main-cli.js --mode=mlx

# In Claude Code prompt:
> who are you?
# Should respond without errors
```

## Related Files

**Implementation**:
- `scripts/ram_cache.py` - RAM cache implementation with compatibility methods

**Tests**:
- `tests/unit/test_ram_cache.py` - Core RAM cache unit tests (40 tests)
- `tests/regression/test_ram_cache_compatibility_methods.py` - Regression tests (19 tests)
- `tests/integration/test_mlx_mode_startup_regression.py` - Integration tests (6 tests)

**MLX Server**:
- `scripts/mlx-server.py` - Custom MLX server that uses cache manager

**Total Test Coverage**: 65 tests specifically for RAM cache functionality

## Success Criteria

✅ All 65 Python tests pass
✅ MLX mode starts without AttributeError
✅ Cache warmup completes successfully
✅ Token counting works during generation
✅ Pre-push hook includes these tests

## Future Improvements

1. **Add type stubs** for cache manager interface to prevent signature mismatches
2. **Integration test** that actually starts MLX server and makes a request
3. **Performance benchmark** comparing disk vs RAM cache with both methods
4. **Mock MLX server test** that exercises full code paths

## References

- Original bug report: UAT test output showing AttributeError
- Fix commit: Added `has_cache()` and `_count_tokens()` methods
- Test suite: `tests/regression/test_ram_cache_compatibility_methods.py`
