# Testing Strategy

## Regression Tests

**Purpose**: Ensure fixed bugs never return.

### Current Tests

**Timeout Regression** (`tests/regression/test_timeout_regression.js`)

- Bug: Network calls hang indefinitely without timeouts
- Fixed: 2025-10-25
- Prevents: Missing AbortController, missing clearTimeout

### Running Tests

```bash
# Run all tests
npm test

# Run just regression tests
npm run test:regression
```

### Git Hook

Pre-commit hook automatically runs tests before every commit:

```bash
# Already configured!
# Tests run automatically on: git commit
```

### Adding New Regression Tests

When you fix a bug:

1. Add test to `tests/regression/test_timeout_regression.js`
2. Document what broke and when fixed
3. Commit with: `git commit -m "fix: <issue> + regression test"`

### Test Philosophy

Following Claude Code's testing-guide skill:

- **Simple**: Plain Node.js, no complex frameworks
- **Fast**: < 1 second to run
- **Focused**: Tests actual code patterns
- **Automatic**: Runs on every commit via git hook

## Best Practices

✅ **DO**:

- Keep tests simple and fast
- Test actual source code patterns
- Document what bug was fixed
- Run tests before committing

❌ **DON'T**:

- Over-engineer test infrastructure
- Add slow integration tests
- Skip documenting bugs
- Commit failing tests
