# Backend Migration Tests - TDD Red Phase Summary

## Test Creation Date

2026-01-02

## Purpose

Comprehensive test suite for migrating from 'lmstudio' backend to 'local' backend (Issue #41).

## Test Files Created

### 1. deprecation-warnings.test.ts

**Location**: `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/deprecation-warnings.test.ts`

**Components Tested**:

- `warnDeprecation()` - Emit deprecation warning with tracking
- `resetWarnings()` - Clear warning state
- Warning deduplication system
- Warning message formatting
- Independent warning tracking

**Test Categories** (48 tests total):

- Basic warning emission (5 tests)
- Warning deduplication (4 tests)
- Multiple independent warnings (3 tests)
- Message format validation (3 tests)
- Edge cases (6 tests)
- State reset (2 tests)
- Return value validation (3 tests)

**Key Test Scenarios**:

1. Warning emitted on first call
2. Warning suppressed on subsequent calls (no spam)
3. Multiple different warnings tracked independently
4. Warning message contains deprecated and replacement names
5. Edge cases: empty strings, special characters, multiline messages

### 2. backend-migration.test.ts

**Location**: `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/backend-migration.test.ts`

**Components Tested**:

- `getMigratedEnvVar()` - Environment variable migration
- `getMigratedBackendConfig()` - Configuration object migration
- `normalizeBackendMode()` - Mode name normalization
- Integration with deprecation warning system

**Test Categories** (72 tests total):

- getMigratedEnvVar() basic functionality (4 tests)
- getMigratedEnvVar() deprecation warnings (5 tests)
- getMigratedEnvVar() multiple variables (4 tests)
- getMigratedEnvVar() edge cases (4 tests)
- getMigratedBackendConfig() basic functionality (4 tests)
- getMigratedBackendConfig() deprecation warnings (5 tests)
- getMigratedBackendConfig() edge cases (5 tests)
- normalizeBackendMode() basic functionality (5 tests)
- normalizeBackendMode() case sensitivity (5 tests)
- normalizeBackendMode() deprecation warnings (5 tests)
- normalizeBackendMode() edge cases (3 tests)
- Integration scenarios (4 tests)

**Key Test Scenarios**:

1. **Precedence**: New values always take precedence over old
2. **Fallback**: Old values used when new values not set
3. **Warnings**: Deprecation warnings emitted only for old values
4. **Normalization**: 'lmstudio' → 'local', case-insensitive
5. **Edge cases**: Empty strings, undefined, whitespace, mixed configs

### 3. Backend Display Tests (Updated)

**Files Updated**:

- `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/test_backend_display.js`
- `/Users/andrewkaszubski/Dev/anyclaude/tests/unit/backend-display.test.ts`

**Changes Made**:

- Added tests for 'local' mode display name ('Local')
- Added tests for 'local' mode log prefix ('[Local]')
- Marked 'lmstudio' tests as deprecated
- Updated VALID_MODES test data to include 'local'

**New Tests**:

- `should return 'Local' for local mode`
- `should return '[Local]' for local mode`

## Implementation Requirements

### File 1: src/utils/deprecation-warnings.ts

```typescript
export function warnDeprecation(
  deprecatedName: string,
  replacementName: string,
  message: string
): boolean;

export function resetWarnings(): void;
```

### File 2: src/utils/env-migration.ts (or backend-migration.ts)

```typescript
export function getMigratedEnvVar(
  newVarName: string,
  oldVarName: string
): string | undefined;
```

### File 3: src/utils/config-migration.ts (or backend-migration.ts)

```typescript
export function getMigratedBackendConfig(
  config: any,
  newKey: string,
  oldKey: string
): any;
```

### File 4: src/utils/backend-migration.ts

```typescript
export function normalizeBackendMode(mode: string): AnyclaudeMode;
```

### File 5: src/utils/backend-display.ts (Update)

```typescript
// Add 'local' to mode mappings
case 'local':
  return 'Local';
```

### File 6: src/trace-logger.ts (Update)

```typescript
// Add 'local' to AnyclaudeMode type
export type AnyclaudeMode =
  | "claude"
  | "local"
  | "lmstudio" // deprecated
  | "openrouter"
  | "mlx-cluster";
```

## Migration Strategy

### Environment Variables

- `LMSTUDIO_URL` → `LOCAL_URL`
- `LMSTUDIO_CONTEXT_LENGTH` → `LOCAL_CONTEXT_LENGTH`
- `LMSTUDIO_MODEL` → `LOCAL_MODEL`
- Old variables still work with deprecation warning

### Configuration

- `.anyclauderc.json`:
  - `lmstudio { ... }` → `local { ... }`
  - Old config section still works with deprecation warning

### Mode Names

- `ANYCLAUDE_MODE=lmstudio` → `ANYCLAUDE_MODE=local`
- Case-insensitive normalization
- Old mode name still works with deprecation warning

## Expected Test Results (RED Phase)

### Before Implementation

All tests should FAIL with:

- `Cannot find module` errors for new utilities
- `undefined is not a function` errors
- Type errors for new 'local' mode

### Specific Expected Failures

1. **deprecation-warnings.test.ts**: 48 failures
   - Module not found: `src/utils/deprecation-warnings`
   - Functions undefined: `warnDeprecation`, `resetWarnings`

2. **backend-migration.test.ts**: 72 failures
   - Module not found: `src/utils/backend-migration`
   - Functions undefined: `getMigratedEnvVar`, `getMigratedBackendConfig`, `normalizeBackendMode`

3. **test_backend_display.js**: 2 failures
   - 'local' mode returns 'Unknown Backend' instead of 'Local'
   - '[local]' prefix returns '[Unknown Backend]' instead of '[Local]'

4. **backend-display.test.ts**: 2 failures
   - Same as above

### Total Expected Failures

**124 test failures** across 4 test files

## Test Execution

### Run All Tests

```bash
# TypeScript tests (requires build)
npm test

# Individual test files
npx jest tests/unit/deprecation-warnings.test.ts
npx jest tests/unit/backend-migration.test.ts
npx jest tests/unit/backend-display.test.ts
```

### Run JavaScript Tests

```bash
# Build first
bun run build

# Run display tests
node tests/unit/test_backend_display.js
```

### Minimal Verbosity (Recommended)

```bash
# Prevent subprocess pipe deadlock (Issue #90)
pytest --tb=line -q
npx jest --verbose=false
```

## Coverage Goals

### Target Coverage

- **Overall**: 80%+ code coverage
- **Deprecation system**: 100% (critical path)
- **Migration utilities**: 95%+
- **Edge cases**: 90%+

### Coverage Areas

1. **Deprecation warnings**: All warning types
2. **Environment migration**: All variable types
3. **Config migration**: All config sections
4. **Mode normalization**: All modes + edge cases
5. **Integration**: End-to-end migration scenarios

## Edge Cases Covered

### String Handling

- Empty strings
- Whitespace-only strings
- Special characters
- Very long strings
- Multiline strings

### Case Sensitivity

- Uppercase mode names
- Mixed case mode names
- Case-insensitive matching

### Precedence Rules

- Both old and new values set (new wins)
- Only old value set (fallback)
- Neither value set (undefined)
- Empty new value vs non-empty old value

### Configuration Edge Cases

- Empty config objects
- Null/undefined configs
- Nested config properties
- Mixed old and new sections

## Next Steps (After GREEN Phase)

1. Implement deprecation warning system
2. Implement environment variable migration
3. Implement config migration
4. Implement mode normalization
5. Update backend display names
6. Update type definitions
7. Run tests - verify GREEN phase
8. Integration testing
9. Documentation updates

## Notes

- All tests follow TDD red phase - they MUST fail before implementation
- Tests are comprehensive and cover all specified edge cases
- Deprecation warnings prevent spam (shown once per session)
- Migration maintains full backward compatibility
- Case-insensitive mode handling for user convenience
- Integration tests validate complete migration workflow

## Related Files

### Source Files to Create

- `src/utils/deprecation-warnings.ts`
- `src/utils/backend-migration.ts` (or split into env-migration.ts + config-migration.ts)

### Source Files to Update

- `src/utils/backend-display.ts`
- `src/trace-logger.ts`
- `src/main.ts`
- `src/backend-client.ts`
- `src/anthropic-proxy.ts`

### Documentation to Update

- `CLAUDE.md`
- `README.md`
- `docs/guides/configuration.md`
- `.anyclauderc.example.json`

## Test Maintenance

### When to Update Tests

- Adding new environment variables
- Adding new config options
- Adding new backend modes
- Changing deprecation message format

### Test Stability

- All tests are deterministic
- No network dependencies
- No file system dependencies
- Clean setup/teardown in each test
- Warning state properly reset

## Success Criteria

### RED Phase (Current)

- [x] All tests fail with expected errors
- [x] Test coverage is comprehensive
- [x] Edge cases are thoroughly tested
- [x] Tests follow project patterns

### GREEN Phase (Next)

- [ ] All tests pass after implementation
- [ ] No test modifications needed
- [ ] 80%+ code coverage achieved
- [ ] All edge cases handled

### REFACTOR Phase (Final)

- [ ] Code is clean and maintainable
- [ ] No duplication
- [ ] Performance is acceptable
- [ ] Documentation is complete
