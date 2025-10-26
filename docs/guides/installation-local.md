# Installing Local Development Version

## Problem

The `anyclaude` command in your PATH points to an **old npm-installed version**:
```
/opt/homebrew/bin/anyclaude -> ../lib/node_modules/anyclaude-lmstudio/dist/main.js
```

This old version **doesn't have the mode switching feature** we just implemented!

## Solution: Install Local Version

### Option 1: npm link (Recommended for Development)

```bash
# In the anyclaude project directory
npm link

# This will update /opt/homebrew/bin/anyclaude to point to your local version
```

**Test it worked**:
```bash
which anyclaude
# Should show: /opt/homebrew/bin/anyclaude

ls -la /opt/homebrew/bin/anyclaude
# Should now point to your local: .../anyclaude/dist/main.js
```

### Option 2: Use Local Version Directly

Don't use `anyclaude` command, use the local script:

```bash
# Instead of: anyclaude
# Use:
node dist/main.cjs

# With environment variables:
ANYCLAUDE_MODE=claude PROXY_ONLY=true node dist/main.cjs
```

### Option 3: Create Alias

Add to `~/.zshrc`:

```bash
alias anyclaude-dev='node /Users/akaszubski/Documents/GitHub/anyclaude/dist/main.cjs'
alias anyclaude-claude='ANYCLAUDE_MODE=claude node /Users/akaszubski/Documents/GitHub/anyclaude/dist/main.cjs'
alias anyclaude-lm='ANYCLAUDE_MODE=lmstudio node /Users/akaszubski/Documents/GitHub/anyclaude/dist/main.cjs'
```

Then reload:
```bash
source ~/.zshrc

# Use it:
anyclaude-dev
anyclaude-claude
anyclaude-lm
```

## Testing the New Version

### Test 1: Check Mode Detection

```bash
# Test LMStudio mode (default)
PROXY_ONLY=true node dist/main.cjs 2>&1 | head -5
# Should show: [anyclaude] Mode: LMSTUDIO

# Test Claude mode
ANYCLAUDE_MODE=claude PROXY_ONLY=true node dist/main.cjs 2>&1 | head -5
# Should show: [anyclaude] Mode: CLAUDE
```

### Test 2: Full Test with Trace Logging

```bash
# Start proxy in Claude mode
ANYCLAUDE_MODE=claude ANYCLAUDE_DEBUG=3 PROXY_ONLY=true node dist/main.cjs 2> test.log &

# Wait a moment
sleep 2

# Check logs
cat test.log
# Should show debug output and mode selection

# Check traces directory
ls -la ~/.anyclaude/traces/claude/
```

## Quick Fix Right Now

```bash
cd /Users/akaszubski/Documents/GitHub/anyclaude

# Link your local version
npm link

# Test it
ANYCLAUDE_MODE=claude PROXY_ONLY=true anyclaude 2>&1 | head -10
# Should now show: [anyclaude] Mode: CLAUDE
```

## Why This Happened

1. You previously installed anyclaude via npm: `npm install -g anyclaude-lmstudio`
2. That installed the **old** version to `/opt/homebrew/lib/node_modules/`
3. The new `/auto-implement` feature built the code but **didn't update the global install**
4. So `anyclaude` command still points to old version
5. New features only exist in your local `dist/` directory

## Recommended Workflow

For development, use:

```bash
# Build after changes
npm run build

# Test locally
node dist/main.cjs

# Or use npm link once and then just `anyclaude`
npm link
anyclaude
```

For production (when ready to publish):

```bash
# Publish to npm
npm version patch
npm publish

# Then globally update
npm install -g anyclaude-lmstudio
```

---

**TL;DR**: Run `npm link` in your project directory to use the new version!
