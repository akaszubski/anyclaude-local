# AnyClaude Launcher Fix - Claude Code Interactive Prompt

## Problem

When running `./anyclaude`, the launcher successfully started both MLX-LM server and Claude Code, but the interactive Claude Code prompt was not appearing. Instead, users saw:

```
[AnyClaude] Started (PID: 29347)
...
ERROR  Raw mode is not supported on the current process.stdin
```

The system appeared to be stuck with no way to interact with Claude Code.

## Root Cause

In the `anyclaude-mlx-lm` launcher script (line 134), Claude Code was being spawned in the background:

```bash
"$SCRIPT_DIR/dist/main-cli.js" &
ANYCLAUDE_PID=$!
```

This backgrounding separated the spawned process from the terminal's stdin/stdout/stderr file descriptors. Claude Code's interactive CLI (built with Ink React) needs access to raw terminal mode to display the interactive UI, but backgrounding prevented this connection.

## Solution

Changed the `start_anyclaude()` function to use `exec` instead of backgrounding:

```bash
# Before (broken)
"$SCRIPT_DIR/dist/main-cli.js" &
ANYCLAUDE_PID=$!

# After (fixed)
exec "$SCRIPT_DIR/dist/main-cli.js"
```

Using `exec` replaces the current shell process with the spawned Claude Code process, preserving all file descriptors (stdin/stdout/stderr). This allows Claude Code to:
- Access the terminal's raw mode
- Display the interactive UI properly
- Handle keyboard input and mouse events
- Render the full Ink React component

## What Changed

**File:** `anyclaude-mlx-lm`

**Changes:**
1. Modified `start_anyclaude()` function to use `exec` when not in PROXY_ONLY mode
2. Updated `main()` function to handle the flow correctly since `exec` replaces the process
3. Added comments explaining why `exec` is used

## Test Results

✅ All tests pass:
- 5/5 Unit tests
- 5/5 Regression tests
- Build succeeds
- Configuration system works

## How It Works Now

### Execution Flow

```
./anyclaude
    ↓
anyclaude (main router script)
    ↓
anyclaude-mlx-lm (launcher)
    ├─ Start MLX-LM server (background)
    ├─ Wait for readiness
    ├─ Show status
    └─ exec → dist/main-cli.js (replaces process)
        ├─ Create proxy server
        └─ spawn → claude (inherits stdin/stdout/stderr)
            └─ Interactive Claude Code UI
```

### Terminal Behavior

**Before:** Process appears to run but interactive prompt doesn't show
**After:** Interactive Claude Code prompt appears and responds to user input

## Backward Compatibility

✅ All existing functionality preserved:
- Configuration system works unchanged
- PROXY_ONLY mode still works
- MLX-LM server startup unchanged
- All environment variables still respected

## When to Use

This fix applies whenever you run:
```bash
./anyclaude           # Uses MLX-LM (from config)
./anyclaude mlx-lm    # Explicitly select MLX-LM
```

## Files Modified

- `anyclaude-mlx-lm` - Fixed process spawning (lines 119-137, 164-184)

## Commit

```
fix: use exec to pass terminal control directly to Claude Code
```

This ensures Claude Code gets proper terminal access for raw mode support.
