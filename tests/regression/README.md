# Regression Tests

Tests that ensure fixed bugs never return.

## Timeout Regression

**Bug**: Network calls to LMStudio would hang indefinitely without timeouts.

**Fixed**: 2025-10-25

**Tests**:

- `test_timeout_regression.test.ts` - Verifies all network calls have timeout protection

## Running Tests

```bash
npm test
```

## When to Add Regression Tests

After fixing any bug, add a regression test to ensure it never returns:

1. Create test file: `tests/regression/test_<bug_name>.test.ts`
2. Document the bug, fix date, and what broke
3. Write tests that verify the fix is present
4. Commit with bug reference: `git commit -m "fix: <issue> (regression test)"`
