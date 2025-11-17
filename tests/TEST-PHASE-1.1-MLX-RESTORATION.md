# Test Documentation: Phase 1.1 - MLX Server Restoration

## Overview

This document describes the test-first (TDD) approach for restoring the legacy MLX server from archive to support backwards compatibility.

**Status**: RED phase (tests written, implementation pending)

## Test Strategy

Following Test-Driven Development (TDD):

1. **RED**: Write comprehensive FAILING tests first
2. **GREEN**: Implement minimum code to pass tests
3. **REFACTOR**: Improve code quality while keeping tests green

## Test Suites

### 1. Bash Structural Tests

**File**: `scripts/test/test-mlx-server-restoration.sh`

**Purpose**: Fast structural validation of file restoration

**Tests**:

- File structure (exists, executable, shebang)
- File size consistency with archive
- Python syntax validity
- Required imports (mlx.core, fastapi, uvicorn, mlx_lm)
- Class definitions (MLXKVCacheManager, PromptCache, VLLMMLXServer)
- CLI functionality (--help works)
- Security patterns (no hardcoded secrets, safe paths)
- Integration (config updated, docs exist)
- Regression prevention (production backend unaffected)

**Runtime**: ~5 seconds

**Usage**:

```bash
./scripts/test/test-mlx-server-restoration.sh
```

### 2. Node.js Integration Tests

**File**: `tests/integration/test_mlx_server_restoration.js`

**Purpose**: Integration testing matching existing test patterns

**Tests**:

- File structure and permissions
- Code quality (valid Python, correct imports)
- Class definitions (MLXKVCacheManager, PromptCache, VLLMMLXServer)
- Security (no API keys, passwords, tokens)
- Safe coding practices (pathlib, no shell injection)
- Configuration integration
- Documentation completeness
- Regression prevention

**Runtime**: ~3 seconds

**Usage**:

```bash
node tests/integration/test_mlx_server_restoration.js
```

### 3. Python Security Tests

**File**: `tests/unit/test_mlx_server_security.py`

**Purpose**: Deep Python-specific security and quality checks

**Tests**:

**Security**:

- No hardcoded API keys (Anthropic, OpenRouter patterns)
- No hardcoded passwords
- No hardcoded tokens (GitHub, JWT patterns)
- Safe path handling (pathlib.Path)
- No shell injection (os.system, shell=True)
- No code injection (eval, exec)
- Environment variables for config

**Code Quality**:

- Valid Python syntax (AST parsing)
- Module docstring present
- Required classes defined
- Required imports present
- Proper logging configuration
- Cache version constant
- Error handling (try-except blocks)
- No bare except clauses
- File permissions correct
- UTF-8 encoding
- Consistent indentation (spaces, not tabs)
- Minimal trailing whitespace

**Integration**:

- Example config updated
- Production backend unaffected
- Migration documentation exists
- Archive README updated
- CHANGELOG updated

**Runtime**: ~2 seconds

**Usage**:

```bash
python3 tests/unit/test_mlx_server_security.py
```

## Running All Tests

**Test Suite Runner**: `scripts/test/run-mlx-restoration-tests.sh`

```bash
# Run all test suites
./scripts/test/run-mlx-restoration-tests.sh

# Quick mode (bash tests only, fast)
./scripts/test/run-mlx-restoration-tests.sh --quick

# Help
./scripts/test/run-mlx-restoration-tests.sh --help
```

## Expected Results (RED Phase)

All tests should FAIL until implementation is complete:

```
Test Category 1: File Structure
--------------------------------
✗ Destination file exists at scripts/mlx-server.py
  Reason: File not found at /Users/.../scripts/mlx-server.py

✗ File has executable permissions
  Reason: File is not executable (chmod +x required)

... (more failures)

Test Summary
============
Total tests run: 40+
Passed: 5 (config/archive already documented)
Failed: 35+ (implementation pending)

✗ Tests failed!
This is expected in TDD Red phase.
```

## Test Coverage

### File Structure (6 tests)

- [x] File exists at correct location
- [x] Executable permissions set
- [x] Python3 shebang present
- [x] File size reasonable
- [x] Valid Python syntax
- [x] Module docstring

### Code Structure (8 tests)

- [x] Required imports (mlx.core, fastapi, uvicorn, mlx_lm)
- [x] Class definitions (MLXKVCacheManager, PromptCache, VLLMMLXServer)
- [x] CLI argument parsing (argparse)
- [x] Help functionality works

### Security (10 tests)

- [x] No hardcoded API keys
- [x] No hardcoded passwords
- [x] No hardcoded tokens
- [x] Safe path handling (pathlib)
- [x] No shell injection (os.system)
- [x] No shell injection (subprocess shell=True)
- [x] No code injection (eval/exec)
- [x] Environment variables for config
- [x] Proper error handling
- [x] No bare except clauses

### Code Quality (8 tests)

- [x] UTF-8 encoding
- [x] Consistent indentation
- [x] Minimal trailing whitespace
- [x] Proper logging setup
- [x] Cache version constant
- [x] Limited debug prints
- [x] Required imports present
- [x] Module docstring

### Integration (6 tests)

- [x] Example config documents legacy backend
- [x] Example config references production backend
- [x] Migration documentation exists
- [x] Migration doc explains differences
- [x] Archive README updated
- [x] CHANGELOG updated

### Regression Prevention (4 tests)

- [x] Production backend unaffected
- [x] File organization standards maintained
- [x] Archive directory clean
- [x] No files in project root

**Total**: 42 automated tests

## Implementation Checklist

Once tests are GREEN, implementation must include:

### File Restoration

- [ ] Copy `scripts/archive/mlx-server.py` to `scripts/mlx-server.py`
- [ ] Verify executable permissions (`chmod +x`)
- [ ] Verify Python3 shebang
- [ ] Test `--help` command works

### Documentation

- [ ] Create `docs/guides/mlx-migration.md` explaining:
  - Legacy backend (mlx-server.py) vs Production (mlx-textgen)
  - When to use each
  - Migration path
  - Known limitations
- [ ] Update `scripts/archive/README.md` to document MLX server files
- [ ] Update `CHANGELOG.md` with restoration entry

### Configuration

- [ ] Update `.anyclauderc.example.json` to document legacy backend option
- [ ] Ensure production backend still referenced
- [ ] Add comments explaining both options

### Verification

- [ ] Run test suite: `./scripts/test/run-mlx-restoration-tests.sh`
- [ ] All tests GREEN
- [ ] Manual test: `python3 scripts/mlx-server.py --help`
- [ ] Production backend unaffected

## Success Criteria

Tests pass when:

1. **File exists** at `scripts/mlx-server.py`
2. **Executable** with Python3 shebang
3. **Valid Python** syntax (compiles)
4. **All classes** defined (MLXKVCacheManager, PromptCache, VLLMMLXServer)
5. **No security issues** (hardcoded secrets, shell injection)
6. **Safe patterns** (pathlib, environment variables)
7. **Documentation** complete (migration guide, config, changelog)
8. **No regression** to production backend

## Timeline

- **RED phase**: Tests written (current)
- **GREEN phase**: Implementation (next)
- **REFACTOR phase**: Code quality improvements (if needed)

## Notes

### Why Test-First?

1. **Clear requirements**: Tests document exactly what needs to be done
2. **Catch issues early**: Security checks, structural validation
3. **Regression prevention**: Ensure production backend unaffected
4. **Documentation**: Tests serve as executable documentation
5. **Confidence**: Know when implementation is complete

### Test Categories Explained

**Structural Tests** (bash): Fast checks for file existence, permissions, syntax
**Integration Tests** (Node.js): Match existing test patterns, validate integration
**Security Tests** (Python): Deep security and quality checks using AST parsing

### Maintenance

When updating the MLX server in the future:

1. Run tests BEFORE changes: `./scripts/test/run-mlx-restoration-tests.sh`
2. Make changes
3. Run tests AFTER changes
4. Fix any failures
5. Update tests if requirements change

## Related Files

- Implementation plan: `docs/development/optimum-implementation-plan.md`
- Archive: `scripts/archive/mlx-server.py`
- Production backend: `scripts/mlx-textgen-server.sh`
- Test runner: `scripts/test/run-mlx-restoration-tests.sh`

## Questions?

See the implementation plan or run tests with `--help` for more information.
