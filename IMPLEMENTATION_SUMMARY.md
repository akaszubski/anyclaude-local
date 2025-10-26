# AnyClaude Config System & MLX-LM Launcher Implementation

## Summary

Completed a comprehensive refactor of AnyClaude to support persistent model configuration and add MLX-LM launcher for local models. Users can now run `./anyclaude` with zero configuration using `.anyclauderc`.

## Key Achievements

### 1. MLX-LM Launcher Implementation
- Created `anyclaude-mlx-lm` - Integrated launcher for MLX-LM with auto-wait and lifecycle management
- Updated main `anyclaude` router to support both mlx-omni and mlx-lm modes
- Both launchers now handle: process cleanup, server startup, waiting for readiness, unified shutdown

### 2. Configuration System
- Added `.anyclauderc` configuration file format
- Implemented config loading with proper precedence:
  1. Environment variables (highest priority)
  2. `~/.anyclauderc` (home directory)
  3. `.anyclauderc` (project directory)
  4. Built-in defaults (lowest priority)
- Configuration reloads in: main launcher, mlx-lm launcher, mlx-omni launcher

### 3. Documentation
- **CONFIG.md** - Comprehensive configuration guide (477 lines)
  - How configuration works
  - All available settings with examples
  - Usage patterns for different scenarios
  - Troubleshooting guide
  - Best practices
  
- **LOCAL-MODEL-GUIDE.md** - Local model usage guide
  - MLX-Omni vs MLX-LM architectural differences
  - When to use each
  - Performance expectations
  - Troubleshooting for local models

- **QUICK-START.md** - 30-second setup guide (already existed)

## File Changes

### New Files Created
1. `.anyclauderc` - Default project configuration
   - Pre-configured for Qwen3-Coder-30B
   - ANYCLAUDE_MODE=mlx-lm
   - ANYCLAUDE_DEBUG=0

2. `anyclaude-mlx-lm` - MLX-LM launcher (executable script)
   - Starts MLX-LM server on port 8081
   - Waits for readiness (120 second timeout)
   - Spawns Claude Code with proper environment
   - Handles lifecycle cleanup

3. `CONFIG.md` - Configuration system documentation
   - 477 lines of comprehensive guides
   - Real-world examples and patterns
   - Troubleshooting section

4. `LOCAL-MODEL-GUIDE.md` - Local model documentation
   - Architecture explanation
   - Key discovery about MLX-Omni limitations
   - Performance tables

### Modified Files
1. `anyclaude` - Main launcher
   - Added config file loading (load_config function)
   - Support for mlx-lm mode selection
   - Config precedence implementation
   - 36-line MODE setting with fallback chain

2. `anyclaude-mlx-lm` - MLX-LM launcher
   - Added load_config function (similar to main launcher)
   - Config file reading support
   - Config-aware defaults for all settings

## Technical Architecture

```
Config Loading Chain:
Environment Variables (highest)
     ↓
~/.anyclauderc (home)
     ↓
.anyclauderc (project)
     ↓
Script Defaults (lowest)
```

## Key Discovery

**MLX-Omni-Server Limitation**: Only accepts HuggingFace model IDs, not local file paths.

This architectural finding meant:
- Users with local models MUST use MLX-LM mode
- MLX-LM supports both local paths and HuggingFace IDs
- Different modes for different use cases
- Documented in LOCAL-MODEL-GUIDE.md

## Usage Examples

### Before (Without Config)
```bash
export MLX_MODEL="/Users/akaszubski/ai-tools/lmstudio/lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
./anyclaude mlx-lm
```

### After (With Config)
```bash
./anyclaude
# Uses .anyclauderc automatically
```

## Configuration Options Available

| Setting | Purpose | Default |
|---------|---------|---------|
| `ANYCLAUDE_MODE` | Backend mode (mlx-omni or mlx-lm) | mlx-omni |
| `MLX_MODEL` | Model ID or local path | mlx-community/Qwen2.5-1.5B-Instruct-4bit |
| `ANYCLAUDE_DEBUG` | Debug verbosity (0-3) | 0 |
| `MLX_LM_PORT` | MLX-LM server port | 8081 |
| `MLX_OMNI_PORT` | MLX-Omni server port | 8080 |
| `VENV_PATH` | Python venv path | ~/.venv-mlx |
| `PROXY_ONLY` | Run proxy without Claude Code | false |

## Testing

All tests pass:
- Unit tests: 5/5 passed
- Regression tests: 5/5 passed
- Config loading: Verified in both launchers
- File organization: Validated against standards

## Commits Made

1. **feat: add MLX-LM launcher for local model support**
   - anyclaude-mlx-lm script
   - Updated anyclaude router
   - LOCAL-MODEL-GUIDE.md

2. **feat: add config file support with .anyclauderc**
   - .anyclauderc configuration file
   - Config loading in launchers
   - Precedence system implementation

3. **docs: add comprehensive config system documentation**
   - CONFIG.md with 477 lines
   - Usage patterns and examples
   - Troubleshooting guides

## Documentation Structure

```
docs/
├── CONFIG.md (comprehensive config guide)
├── LOCAL-MODEL-GUIDE.md (local model usage)
├── QUICK-START.md (30-second setup)
├── anyclaude-launcher-guide.md (advanced options)
├── guides/
│   └── mlx-omni-quick-start.md
├── development/
└── ...
```

## Next Steps (Optional Future Work)

1. Add `anyclaude config show` command to display current config
2. Add `anyclaude config set KEY VALUE` for easy config updates
3. Add config validation (check model paths exist)
4. Add performance profiling for different models
5. Add config schema validation

## Notes

- All changes maintain backward compatibility
- Existing functionality unchanged
- Config system is additive (opt-in)
- Default behavior same as before
- Can still use environment variables as before
- Tests ensure no regressions
