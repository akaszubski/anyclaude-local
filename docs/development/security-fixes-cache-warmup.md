# Security Fixes: Cache Warmup Feature

## Overview

Fixed 5 security vulnerabilities in the cache warmup implementation (`scripts/mlx-server.py`) identified by the security-auditor agent.

**Status**: ✅ All vulnerabilities fixed and validated

**File modified**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/mlx-server.py`

**Test suite**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/test/test-security-simple.py`

---

## Vulnerabilities Fixed

### VUL-001 (HIGH - CRITICAL): Path Traversal

**Location**: Lines 467-475 in `get_standard_system_prompt()`

**Issue**: No path validation allowed reading arbitrary files via `WARMUP_SYSTEM_FILE`

**Attack vector**:

```bash
WARMUP_SYSTEM_FILE=/etc/passwd python3 scripts/mlx-server.py
WARMUP_SYSTEM_FILE=~/.ssh/id_rsa python3 scripts/mlx-server.py
```

**Fix implemented**:

1. Canonical path resolution via `Path.resolve()` (prevents symlink attacks)
2. Whitelist validation using `Path.relative_to(ALLOWED_SYSTEM_PROMPT_DIR)`
3. Only files in `~/.anyclaude/system-prompts/` are allowed
4. Rejects paths outside allowed directory with sanitized error

**Code location**: Lines 484-498

---

### VUL-002 (MEDIUM): Unvalidated Timeout

**Location**: Line 107 (original)

**Issue**: No bounds checking on `WARMUP_TIMEOUT_SEC` allowed DoS attacks

**Attack vector**:

```bash
WARMUP_TIMEOUT_SEC=999999999 python3 scripts/mlx-server.py
WARMUP_TIMEOUT_SEC=inf python3 scripts/mlx-server.py
```

**Fix implemented**:

```python
# Validate timeout range (1-300 seconds) - VUL-002 fix
try:
    _timeout = float(os.environ.get("WARMUP_TIMEOUT_SEC", "60"))
    WARMUP_TIMEOUT_SEC = 60.0 if not (1.0 <= _timeout <= 300.0) else _timeout
except (ValueError, TypeError):
    WARMUP_TIMEOUT_SEC = 60.0
```

**Valid range**: 1.0 to 300.0 seconds
**Invalid values**: inf, nan, negative, > 300, non-numeric → defaults to 60.0

**Code location**: Lines 112-117

---

### VUL-003 (MEDIUM): Unbounded File Read

**Location**: Lines 471-472 (original)

**Issue**: No file size limit could exhaust memory with large files

**Attack vector**:

```bash
dd if=/dev/zero of=~/.anyclaude/system-prompts/huge.txt bs=1G count=1
WARMUP_SYSTEM_FILE=~/.anyclaude/system-prompts/huge.txt python3 scripts/mlx-server.py
```

**Fix implemented**:

1. Check file size before reading: `file_size = canonical.stat().st_size`
2. Reject files > 1MB: `if file_size > MAX_SYSTEM_PROMPT_SIZE`
3. Bounded read: `f.read(MAX_SYSTEM_PROMPT_SIZE)` (hard limit even if check bypassed)

**Code location**: Lines 504-512

**Constant**: `MAX_SYSTEM_PROMPT_SIZE = 1024 * 1024` (line 41)

---

### VUL-004 (LOW): Information Disclosure

**Location**: Lines 474, 477 (original)

**Issue**: Full file paths in log messages leak system information

**Original code**:

```python
logger.info(f"[Cache Warmup] Loaded system prompt from: {warmup_file}")
logger.warning(f"[Cache Warmup] Failed to read {warmup_file}: {e}")
```

**Fix implemented**:

```python
# VUL-004 fix: sanitized log (no file path)
logger.info("[Cache Warmup] Loaded system prompt from custom file")

# VUL-004 fix: sanitized log (no file path, only exception type)
logger.warning(f"[Cache Warmup] Failed to read file: {type(e).__name__}")
```

**Code location**: Lines 515, 520

---

### VUL-005 (MEDIUM): No Input Sanitization

**Issue**: Combined with VUL-001 (path traversal)

**Fix**: Implemented whitelist-based validation (same as VUL-001)

- Only `~/.anyclaude/system-prompts/` directory allowed
- Canonical path resolution prevents bypasses
- Input rejection with early return (no error details)

**Code location**: Lines 493-498 (same as VUL-001)

---

## Security Improvements

### Defense in Depth

1. **Canonical path resolution**
   - `Path.resolve()` resolves symlinks and normalizes paths
   - Prevents `../` traversal and symlink escapes

2. **Whitelist validation**
   - `relative_to(ALLOWED_SYSTEM_PROMPT_DIR.resolve())`
   - Throws `ValueError` if path is outside allowed directory
   - Works even after symlink resolution

3. **File type validation**
   - `canonical.is_file()` ensures regular file (not directory/device)
   - Prevents reading from `/dev/zero`, `/dev/random`, etc.

4. **Bounded reads**
   - Check size before reading
   - Bounded read even if check bypassed: `f.read(MAX_SYSTEM_PROMPT_SIZE)`
   - Prevents memory exhaustion

5. **Timeout validation**
   - Range check: 1.0 <= timeout <= 300.0
   - Exception handling for invalid types
   - Default fallback (60.0) for all invalid values

6. **Log sanitization**
   - No file paths in logs
   - Only exception types, not full tracebacks
   - Reduces information disclosure

### Security Constants

```python
# Security constants for file access
MAX_SYSTEM_PROMPT_SIZE = 1024 * 1024  # 1MB
ALLOWED_SYSTEM_PROMPT_DIR = Path.home() / ".anyclaude" / "system-prompts"
```

**Location**: Lines 40-42

### Directory Creation

Ensures allowed directory exists before warmup:

```python
# Create system prompts directory if needed (security requirement)
ALLOWED_SYSTEM_PROMPT_DIR.mkdir(parents=True, exist_ok=True)
```

**Location**: Line 2023 in `VLLMMLXServer.run()`

---

## Testing

### Test Suite

**File**: `/Users/andrewkaszubski/Documents/GitHub/anyclaude/scripts/test/test-security-simple.py`

**Tests**:

1. **Timeout validation** (VUL-002)
   - ✓ inf → 60.0
   - ✓ negative → 60.0
   - ✓ > 300 → 60.0
   - ✓ 120 → 120.0 (valid)
   - ✓ 1.0 → 1.0 (minimum)
   - ✓ 300 → 300.0 (maximum)

2. **Path traversal protection** (VUL-001, VUL-005)
   - ✓ Valid path accepted
   - ✓ /etc/passwd blocked
   - ✓ Symlink escape blocked
   - ✓ Path outside directory blocked
   - ✓ Relative path escape blocked

3. **File size limit** (VUL-003)
   - ✓ 2MB file rejected
   - ✓ 100KB file accepted
   - ✓ 1MB file accepted (exactly at limit)
   - ✓ 1MB+1 byte rejected

4. **Code implementation verification**
   - ✓ All security constants present
   - ✓ All security checks present
   - ✓ All VUL-\* comments present

### Running Tests

```bash
# Run test suite
python3 scripts/test/test-security-simple.py

# Expected output:
# ===== Security Fixes Test Suite =====
# ...
# ✓ All security fixes validated!
# Ready for security re-audit!
```

---

## Attack Scenarios Prevented

### 1. Reading Sensitive Files

**Attack**:

```bash
WARMUP_SYSTEM_FILE=/etc/passwd python3 scripts/mlx-server.py
```

**Prevention**: Path outside `~/.anyclaude/system-prompts/` is rejected

---

### 2. Symlink Escape

**Attack**:

```bash
ln -s /etc ~/.anyclaude/system-prompts/escape
WARMUP_SYSTEM_FILE=~/.anyclaude/system-prompts/escape/passwd python3 scripts/mlx-server.py
```

**Prevention**: Canonical path resolution detects symlink points outside allowed directory

---

### 3. Relative Path Traversal

**Attack**:

```bash
WARMUP_SYSTEM_FILE=~/.anyclaude/system-prompts/../../../etc/passwd python3 scripts/mlx-server.py
```

**Prevention**: Path normalization + whitelist validation

---

### 4. Memory Exhaustion

**Attack**:

```bash
dd if=/dev/zero of=~/.anyclaude/system-prompts/huge.txt bs=1G count=10
WARMUP_SYSTEM_FILE=~/.anyclaude/system-prompts/huge.txt python3 scripts/mlx-server.py
```

**Prevention**: File size check rejects files > 1MB

---

### 5. Timeout DoS

**Attack**:

```bash
WARMUP_TIMEOUT_SEC=999999999 python3 scripts/mlx-server.py
```

**Prevention**: Timeout clamped to 1-300 seconds range

---

## Code Changes Summary

### Modified Functions

1. **`get_standard_system_prompt()`** (lines 462-539)
   - Complete rewrite with security-first design
   - Added nested `safe_read_prompt()` helper function
   - Implements all 5 vulnerability fixes

2. **Timeout validation** (lines 112-117)
   - Added range checking and exception handling
   - Validates 1.0 <= timeout <= 300.0

3. **`VLLMMLXServer.run()`** (line 2023)
   - Added directory creation before warmup

### New Constants

```python
MAX_SYSTEM_PROMPT_SIZE = 1024 * 1024  # 1MB
ALLOWED_SYSTEM_PROMPT_DIR = Path.home() / ".anyclaude" / "system-prompts"
```

### Documentation

- Comprehensive docstring for `get_standard_system_prompt()`
- Security section documenting all protections
- VUL-\* comments marking each fix in code

---

## Validation

✅ **Python syntax**: Valid (`python3 -m py_compile`)
✅ **All tests pass**: 100% pass rate
✅ **All vulnerabilities fixed**: 5/5 addressed
✅ **Defense in depth**: Multiple layers of protection
✅ **Ready for re-audit**: Security-auditor can verify

---

## Next Steps

1. **Security re-audit**: Run security-auditor agent to verify fixes
2. **Integration testing**: Test with actual MLX server startup
3. **Documentation update**: Update SECURITY.md with hardening details
4. **Changelog entry**: Document security fixes in CHANGELOG.md

---

## References

- **Original vulnerability report**: Identified by security-auditor agent
- **Test suite**: `scripts/test/test-security-simple.py`
- **Modified file**: `scripts/mlx-server.py`
- **Security constants**: Lines 40-42
- **Timeout validation**: Lines 112-117
- **Path validation**: Lines 484-539

---

**Document version**: 1.0
**Date**: 2025-11-17
**Author**: implementer agent
**Status**: ✅ Complete and validated
