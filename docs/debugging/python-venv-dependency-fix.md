# Python Virtual Environment Dependency Fix

**Date**: 2025-11-20
**Issue**: Custom MLX server failed to start due to missing Python dependencies (fastapi, uvicorn, mlx-lm)
**Resolution**: Configure anyclaude to use project's `.venv` virtual environment

## Problem

When launching the custom MLX server (`scripts/mlx-server.py`), anyclaude was using the system Python 3.14 installation, which didn't have the required dependencies:

```
ModuleNotFoundError: No module named 'fastapi'
```

This happened because:

1. macOS Python 3.14 is an "externally managed environment" (PEP 668)
2. Installing packages system-wide requires `--break-system-packages` or using a venv
3. anyclaude's server launcher was calling `python3` directly instead of the venv Python

## Solution

### 1. Install dependencies in virtual environment

The project already has a `.venv` directory. Install all required dependencies:

```bash
source .venv/bin/activate
python3 -m pip install fastapi uvicorn mlx-lm
```

This installs:

- `fastapi` - Web framework for the server
- `uvicorn` - ASGI server for FastAPI
- `mlx-lm` - MLX language model utilities
- Dependencies: transformers, huggingface-hub, etc.

### 2. Configure anyclaude to use venv

Add `pythonVenv` to your `.anyclauderc.json`:

```json
{
  "backend": "mlx",
  "backends": {
    "mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "mlx",
      "model": "Qwen3-Coder-30B-A3B-Instruct-MLX-4bit",
      "modelPath": "/path/to/your/model",
      "serverScript": "scripts/mlx-server.py",
      "pythonVenv": ".venv", // ← Add this!
      "maxTokens": 32768
    }
  }
}
```

### 3. Updated server launcher

Modified `src/server-launcher.ts` to:

1. Read `pythonVenv` from backend config
2. Resolve venv path relative to project root
3. Check if venv Python exists
4. Use venv Python instead of system Python

**Code changes**:

```typescript
// Determine which Python to use
let pythonCmd = "python3";
if (config.pythonVenv) {
  const venvPath = path.resolve(projectRoot, config.pythonVenv);
  const venvPython = path.join(venvPath, "bin", "python3");
  if (fs.existsSync(venvPython)) {
    pythonCmd = venvPython;
    debug(1, `[server-launcher] Using venv Python: ${venvPython}`);
  } else {
    console.warn(
      `[anyclaude] Warning: venv Python not found at ${venvPython}, using system Python`
    );
  }
}

// Build command for custom server
const command = `"${pythonCmd}" "${scriptPath}" --model "${modelPath}" --port ${port} --host 127.0.0.1 2>&1`;
```

And in `launchBackendServer()`:

```typescript
startVLLMMLXServer({
  backend: mode,
  port,
  model: backendConfig.model,
  modelPath: backendConfig.modelPath,
  serverScript: backendConfig.serverScript,
  pythonVenv: backendConfig.pythonVenv || config.pythonVenv, // ← Support both locations
});
```

## Verification

After the fix, the server starts successfully:

```bash
$ ./dist/main-cli.js --mode=mlx
[anyclaude] Starting custom MLX server...
[anyclaude] Model: Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
[anyclaude] Port: 8081
[anyclaude] Script: scripts/mlx-server.py
[anyclaude] Waiting ~30 seconds for model to load...
[anyclaude] MLX server is ready
[anyclaude] ✓ Backend server is ready
```

Server logs confirm success:

```
✓ MLX core available
✓ MLX LM available
INFO:     Started server process [14078]
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8081
```

## Related Files

- `.anyclauderc.json` - Configuration with `pythonVenv` setting
- `src/server-launcher.ts` - Server launcher with venv support
- `scripts/requirements.txt` - Python dependencies
- `.venv/` - Virtual environment directory

## Future Improvements

1. **Auto-detect venv**: If `.venv` exists, use it automatically
2. **Better error messages**: Suggest installing deps if missing
3. **Requirements validation**: Check if all deps are installed before launching
4. **Setup script**: Automate venv creation and dependency installation
