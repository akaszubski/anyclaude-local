# Automatic Server Launch Guide

The vLLM-MLX server **auto-launches automatically** when you start anyclaude. No manual steps needed.

## How It Works

1. **anyclaude reads `.anyclauderc.json`**
2. **Detects `"backend": "vllm-mlx"`**
3. **Calls `launchBackendServer()` function**
4. **Starts Python server process**
5. **Waits for server to be ready**
6. **Returns proxy URL to Claude Code**

The entire flow is automatic and handled by:

- `src/main.ts` - Loads config and calls launcher at line 170
- `src/server-launcher.ts` - Contains `startVLLMMLXServer()` function

## Configuration

Edit `.anyclauderc.json`:

```json
{
  "backend": "vllm-mlx",
  "backends": {
    "vllm-mlx": {
      "enabled": true,
      "port": 8081,
      "baseUrl": "http://localhost:8081/v1",
      "apiKey": "vllm-mlx",
      "model": "/path/to/your/mlx-model",
      "serverScript": "scripts/vllm-mlx-server.py"
    }
  }
}
```

That's all! When you run anyclaude, it will:

```bash
bun run ./dist/main.js
```

The server starts automatically.

## What Happens on Startup

```
[anyclaude] Mode: VLLM-MLX
[anyclaude] Starting vLLM-MLX server...
[anyclaude] Model: your-model-name
[anyclaude] Port: 8081
[anyclaude] Waiting ~30 seconds for model to load...
[anyclaude] vLLM-MLX server started successfully
[anyclaude] Proxy URL: http://localhost:XXXXX
[anyclaude] vLLM-MLX endpoint: http://localhost:8081/v1
```

Then Claude Code starts automatically using the proxy.

## Environment Variable Overrides

You can override config via environment variables:

```bash
# Use different backend
ANYCLAUDE_MODE=vllm-mlx bun run ./dist/main.js

# Use different model
VLLM_MLX_MODEL=/path/to/other/model bun run ./dist/main.js

# Use different port
export VLLM_MLX_URL=http://localhost:8082/v1
bun run ./dist/main.js
```

## Configuration Priority

1. **Environment variables** (highest priority)
2. **`.anyclauderc.json`**
3. **Default values** (lowest priority)

Example:

```bash
# This will use the env var, not the config file
VLLM_MLX_MODEL=/custom/model bun run ./dist/main.js
```

## Disabling Auto-Launch

If you want to disable auto-launch and manage the server manually:

```bash
ANYCLAUDE_NO_AUTO_LAUNCH=true bun run ./dist/main.js
```

Then start the server manually:

```bash
python3 scripts/vllm-mlx-server.py --model /path/to/model --port 8081
```

## Port Already in Use

If port 8081 is already in use:

**Option 1: Kill the existing process**

```bash
lsof -i :8081
kill -9 <PID>
```

**Option 2: Change the port in config**

```json
{
  "vllm-mlx": {
    "port": 8082,
    "baseUrl": "http://localhost:8082/v1"
  }
}
```

**Option 3: Use environment variable**

```bash
VLLM_MLX_URL=http://localhost:8082/v1 bun run ./dist/main.js
```

## Check Server Status

After anyclaude starts, the server should be running. Test it:

```bash
curl http://localhost:8081/health
```

Should return:

```json
{ "status": "healthy", "model": "your-model-name", "caching": true }
```

## Debug Auto-Launch

Enable debug logging to see auto-launch details:

```bash
ANYCLAUDE_DEBUG=1 bun run ./dist/main.js
```

You'll see:

```
[anyclaude] Waiting for vllm-mlx server to be ready...
[server-launcher] Backend server is ready
```

## How Auto-Launch Works (Code)

The flow is in `src/main.ts`:

```typescript
// 1. Load configuration
const config = loadConfig();

// 2. Detect mode
const mode: AnyclaudeMode = detectMode(config);

// 3. Launch backend server (THIS IS THE AUTO-LAUNCH)
launchBackendServer(mode, config);

// 4. Wait for server to be ready
const isReady = await waitForServerReady(backendConfig.baseUrl);

// 5. Start proxy and Claude Code
const proxyURL = createAnthropicProxy({...});
spawn("claude", [...], {
  env: { ANTHROPIC_BASE_URL: proxyURL }
});
```

The `launchBackendServer()` function in `src/server-launcher.ts`:

```typescript
export function launchBackendServer(
  mode: string,
  config: { backends?: Record<string, any> }
): void {
  // ... reads config ...

  if (mode === "vllm-mlx") {
    startVLLMMLXServer({
      backend: mode,
      port: config.backends?.["vllm-mlx"]?.port,
      model: config.backends?.["vllm-mlx"]?.model,
    });
  }
}

function startVLLMMLXServer(config: ServerLauncherConfig): void {
  // Spawn Python process
  const serverProcess = spawn(
    "python3",
    [config.serverScript, "--model", config.model, "--port", config.port],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    }
  );

  // Keep running in background
  serverProcess.unref();
}
```

## File Structure

```
anyclaude/
├── .anyclauderc.json              # Your configuration
├── src/
│   ├── main.ts                     # Calls launchBackendServer() at line 170
│   └── server-launcher.ts          # startVLLMMLXServer() implementation
└── scripts/
    └── vllm-mlx-server.py          # The server being launched
```

## Summary

✅ **Auto-launch is already implemented**
✅ **Just configure `.anyclauderc.json`**
✅ **Run `bun run ./dist/main.js`**
✅ **Everything starts automatically**

No manual server start needed!
