# Development Workflow Guide

## Problem: Running Old Builds

**The Issue**: When you install a package globally with `npm install -g`, the command in your PATH points to the installed version, not your local development version.

```bash
# This installs to global node_modules
npm install -g anyclaude-lmstudio

# The command points here:
/opt/homebrew/bin/anyclaude -> ../lib/node_modules/anyclaude-lmstudio/dist/main.js

# NOT your local development version:
/Users/akaszubski/Documents/GitHub/anyclaude/dist/main.js
```

## Solution 1: Use npm link (Recommended)

**Best for**: Active development where you frequently test changes

```bash
# One-time setup in your project directory
cd /Users/akaszubski/Documents/GitHub/anyclaude
npm link

# This updates the global command to point to your local build
# Now `anyclaude` runs your local version!

# After making changes:
npm run build          # Rebuild
anyclaude              # Test immediately (uses local build)
```

**Verify it worked**:
```bash
ls -la /opt/homebrew/bin/anyclaude
# Should show: -> /Users/akaszubski/Documents/GitHub/anyclaude/dist/main.js
```

**Unlink when done**:
```bash
npm unlink -g anyclaude-lmstudio
```

## Solution 2: Use Scripts Directly (Always Works)

**Best for**: Quick testing, CI/CD, or when npm link doesn't work

```bash
# Instead of: anyclaude
# Use:
node dist/main.cjs

# With environment variables:
ANYCLAUDE_MODE=claude PROXY_ONLY=true node dist/main.cjs

# With debug:
ANYCLAUDE_DEBUG=3 node dist/main.cjs
```

## Solution 3: Create Development Aliases

**Best for**: Frequent switching between versions

We've created a complete set of aliases in `shell-aliases.sh`. Load them with:

```bash
# Add to your ~/.zshrc
source /Users/akaszubski/Documents/GitHub/anyclaude/shell-aliases.sh

# Reload shell
source ~/.zshrc
```

**Available aliases**:
```bash
# Core
anyclaude-build         # Rebuild project
anyclaude-dev           # Run local version
anyclaude-test          # Run tests

# Modes
anyclaude-lm            # LMStudio mode
anyclaude-claude        # Claude mode

# Debug
anyclaude-debug         # Basic debug (level 1)
anyclaude-verbose       # Verbose debug (level 2)
anyclaude-trace         # Full trace (level 3)

# Combined
anyclaude-trace-claude  # Trace Claude API calls
anyclaude-trace-lm      # Trace LMStudio calls

# Traces
anyclaude-traces        # List recent traces
anyclaude-latest-trace  # View latest trace (JSON)
anyclaude-clean-traces  # Delete all traces

# Quick workflow
anyclaude-rb            # Rebuild and run
```

**See `shell-aliases.sh` for complete list and usage examples.**

## Solution 4: Use npm Scripts

**Best for**: Standardized development commands

Already set up in `package.json`:

```json
{
  "scripts": {
    "build": "node scripts/build.js",
    "start": "node dist/main.cjs",
    "test": "node --test tests/unit/*.js",
    "dev": "ANYCLAUDE_DEBUG=1 node dist/main.cjs",
    "trace": "ANYCLAUDE_DEBUG=3 ANYCLAUDE_MODE=claude PROXY_ONLY=true node dist/main.cjs"
  }
}
```

Usage:
```bash
npm run build             # Build the project
npm run start             # Run local version
npm run dev              # Run with debug
npm run trace            # Run in trace mode
```

## Recommended Development Workflow

### Setup (One Time)

```bash
# 1. Clone and install
cd /Users/akaszubski/Documents/GitHub/anyclaude
npm install

# 2. Link for development
npm link

# 3. Verify link worked
which anyclaude
# Should show: /opt/homebrew/bin/anyclaude

ls -la /opt/homebrew/bin/anyclaude
# Should point to: .../anyclaude/dist/main.js (your local version)
```

### Daily Development

```bash
# 1. Make changes to source files
vim src/main.ts

# 2. Rebuild
npm run build

# 3. Test immediately
anyclaude                              # Uses your local build!

# Or test specific modes:
ANYCLAUDE_MODE=claude anyclaude       # Claude mode
ANYCLAUDE_DEBUG=3 anyclaude           # Trace mode
```

### Testing Before Publishing

```bash
# 1. Test local version works
npm run build
node dist/main.cjs

# 2. Test as if globally installed
npm link
anyclaude

# 3. Run all tests
npm test

# 4. Clean build
rm -rf dist/
npm run build

# 5. Verify entry point
./dist/main.js
```

## How to Check Which Version You're Running

```bash
# Method 1: Check symlink
ls -la $(which anyclaude)

# If it shows:
# -> /opt/homebrew/lib/node_modules/...  ❌ OLD (npm installed)
# -> /Users/akaszubski/Documents/GitHub/... ✅ NEW (local dev)

# Method 2: Check for new features
ANYCLAUDE_MODE=claude PROXY_ONLY=true anyclaude 2>&1 | head -5

# Old version: No output about mode
# New version: [anyclaude] Mode: CLAUDE
```

## Troubleshooting

### "anyclaude command not found" after npm link

```bash
# Check npm global bin directory
npm config get prefix
# Should be: /opt/homebrew (on M-series Mac)

# Link manually if needed
ln -sf /Users/akaszubski/Documents/GitHub/anyclaude/dist/main.js \
       /opt/homebrew/bin/anyclaude

# Make executable
chmod +x dist/main.js
```

### "npm link doesn't update the symlink"

```bash
# Force unlink first
npm unlink -g anyclaude-lmstudio

# Remove old symlink
rm /opt/homebrew/bin/anyclaude

# Link again
npm link

# Verify
ls -la /opt/homebrew/bin/anyclaude
```

### "Still running old version after npm link"

```bash
# Check package.json bin field
cat package.json | grep -A2 '"bin"'

# Should be:
# "bin": {
#   "anyclaude": "./dist/main.js"
# }

# If different, fix it and run:
npm run build
npm link
```

## Best Practices

1. **Always use npm link during development**
   - One-time setup, then `anyclaude` always runs your local version
   - No need to remember paths or scripts

2. **Use explicit paths in CI/CD**
   - Don't rely on global commands
   - Use: `node dist/main.cjs`

3. **Add aliases for common tasks**
   - Makes testing different modes easy
   - Reduces typing and errors

4. **Verify before publishing**
   - Test with `npm link` (simulates global install)
   - Check `which anyclaude` points to expected location
   - Run full test suite

5. **Document local testing in README**
   - Help contributors avoid this issue
   - Show recommended workflow

## Quick Reference

| Task | Command |
|------|---------|
| **Setup** | `npm link` (one time) |
| **Build** | `npm run build` |
| **Test local** | `anyclaude` (after npm link) |
| **Test directly** | `node dist/main.cjs` |
| **Claude mode** | `ANYCLAUDE_MODE=claude anyclaude` |
| **Trace mode** | `ANYCLAUDE_DEBUG=3 anyclaude` |
| **Check version** | `ls -la $(which anyclaude)` |
| **Unlink** | `npm unlink -g anyclaude-lmstudio` |

## Summary

**The Problem**: Global `npm install -g` creates a separate copy, so `anyclaude` runs old code

**The Solution**: Use `npm link` to point the global command at your local development version

**The Workflow**:
1. `npm link` (once)
2. `npm run build` (after changes)
3. `anyclaude` (test immediately)

**No more path challenges!** 🎉

---

**See Also**:
- `INSTALL_LOCAL.md` - Detailed installation guide
- `MODE_SWITCHING_GUIDE.md` - How to use Claude vs LMStudio mode
- `AUTHENTICATION_GUIDE.md` - API key vs session-based auth
