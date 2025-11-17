# MLX Server Logging Integration Guide

This guide shows how to integrate the `utils_logging.py` module into `mlx-server.py` for structured logging with debug levels and performance tracking.

## Current Setup

Your mlx-server uses basic Python logging:

```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("mlx")
```

## Integration Steps

### Step 1: Update Imports (Top of mlx-server.py)

Replace the logging setup with:

```python
import sys
from pathlib import Path

# Add scripts directory to path for utils_logging
sys.path.insert(0, str(Path(__file__).parent))

# Use new logging utility
from utils_logging import (
    setup_logger,
    display_debug_startup,
    debug,
    log_cache_hit,
    log_cache_miss,
    PerformanceTimer,
    is_debug_enabled
)

# Setup logger
logger = setup_logger("mlx")

# Display debug info if ANYCLAUDE_DEBUG is set
display_debug_startup()
```

### Step 2: Replace Logging Calls

**Before:**

```python
logger.debug("Processing request")
logger.info("Cache hit for prompt")
logger.error("Error occurred", exc_info=True)
```

**After:**

```python
debug(1, "Processing request")
logger.info("Cache hit for prompt")
logger.error("Error occurred")
# No need for exc_info, just log the error
```

### Step 3: Add Cache Tracking (Optional)

In your PromptCache class:

```python
from utils_logging import log_cache_hit, log_cache_miss

class PromptCache:
    def __init__(self, max_size: int = 32):
        self.max_size = max_size
        self.cache = {}
        self.access_order = []
        self.kv_cache_state = None

    def get(self, key: str):
        """Get from cache with logging."""
        if key in self.cache:
            cache_entry = self.cache[key]
            log_cache_hit("prompt", key, {
                "age_seconds": time.time() - cache_entry["timestamp"],
                "tokens": len(cache_entry.get("content", "")) // 4  # rough estimate
            })
            return cache_entry
        else:
            log_cache_miss("prompt", key, "cache_miss")
            return None

    def put(self, key: str, value: dict):
        """Store in cache with logging."""
        debug(2, "Cache put", {
            "key": key,
            "size_kb": len(str(value)) / 1024,
            "cache_size": len(self.cache)
        })
        self.cache[key] = {
            **value,
            "timestamp": time.time()
        }
```

### Step 4: Add Performance Timing (Optional)

In your chat completion endpoint:

```python
from utils_logging import PerformanceTimer

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Chat completion endpoint with performance tracking."""
    with PerformanceTimer("chat_completion", log_level=2) as timer:
        try:
            # Parse request
            body = await request.json()
            debug(3, "Chat request", body)  # Full trace at level 3
            logger.info(f"Processing chat request")

            timer.checkpoint("request_parsed")

            # Check cache
            prompt_key = hash(body.get("prompt", ""))
            cached = cache.get(prompt_key)
            if cached:
                debug(2, "Using cached response")

            timer.checkpoint("cache_check")

            # Run inference
            logger.debug("Loading model...")
            model = await load_model(body.get("model", "current-model"))

            timer.checkpoint("model_loaded")

            logger.debug("Running inference...")
            response = await model.generate(body, **params)

            timer.checkpoint("inference_complete")

            # Cache response
            cache.put(prompt_key, response)
            log_cache_hit("prompt", prompt_key, {
                "cached": False,  # Just generated
                "tokens": response.get("usage", {}).get("completion_tokens", 0)
            })

            logger.info("Chat request completed successfully")
            return response

        except Exception as e:
            logger.error(f"Error in chat_completions: {str(e)}")
            if is_debug_enabled():
                debug(1, "Exception details", {
                    "type": type(e).__name__,
                    "message": str(e)
                })
            raise
        # PerformanceTimer logs total time on exit
```

### Step 5: Add Error Debugging (Optional)

For better error tracking:

```python
from utils_logging import write_error_debug_file, log_debug_error

@app.exception_handler(Exception)
async def handle_exception(request: Request, exc: Exception):
    """Global exception handler with debug file generation."""
    body = await request.body() if request.method == "POST" else None

    # Write debug file
    debug_file = write_error_debug_file(
        status_code=500,
        request_info={
            "method": request.method,
            "url": str(request.url),
            "headers": dict(request.headers),
            "body": body.decode() if body else None
        },
        response_info={
            "statusCode": 500,
            "body": str(exc)
        }
    )

    # Log with context
    if debug_file:
        log_debug_error(
            "HTTP",
            500,
            debug_file,
            {"provider": "mlx", "model": "current"}
        )

    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        {"error": str(exc), "debug_file": debug_file},
        status_code=500
    )
```

## Running with Debug Enabled

```bash
# Level 1: Basic debug messages
ANYCLAUDE_DEBUG=1 python3 scripts/mlx-server.py

# Level 2: Verbose + performance metrics
ANYCLAUDE_DEBUG=2 python3 scripts/mlx-server.py

# Level 3: Full trace with all data structures
ANYCLAUDE_DEBUG=3 python3 scripts/mlx-server.py
```

## What You'll See

### Level 0 (Default)

```
[2025-10-28 22:46:27] [mlx] INFO: Processing chat request
[2025-10-28 22:46:27] [mlx] INFO: Chat request completed successfully
```

### Level 1 (Basic Debug)

```
[2025-10-28 22:46:27] [mlx] INFO: Processing chat request
[2025-10-28 22:46:27] [mlx] DEBUG: Processing request
[2025-10-28 22:46:27] [anyclaude] DEBUG: Cache put {"key":"...","size_kb":1.2,"cache_size":0}
[2025-10-28 22:46:27] [mlx] INFO: Chat request completed successfully
```

### Level 2 (Verbose + Performance)

```
[2025-10-28 22:46:27] [mlx] INFO: Processing chat request
[2025-10-28 22:46:27] [mlx] DEBUG: Cache put {"key":"...","size_kb":1.2}
[2025-10-28 22:46:27] [anyclaude] DEBUG: [Timer] chat_completion @ request_parsed: 10.45ms
[2025-10-28 22:46:27] [anyclaude] DEBUG: [Timer] chat_completion @ cache_check: 15.67ms
[2025-10-28 22:46:27] [anyclaude] DEBUG: [Timer] chat_completion @ model_loaded: 1250.34ms
[2025-10-28 22:46:27] [anyclaude] DEBUG: [Timer] chat_completion @ inference_complete: 5000.12ms
[2025-10-28 22:46:32] [anyclaude] DEBUG: [Timer] chat_completion completed in 5400.50ms
[2025-10-28 22:46:32] [mlx] INFO: Chat request completed successfully
```

### Level 3 (Full Trace)

```
[2025-10-28 22:46:27] [mlx] INFO: Processing chat request
[2025-10-28 22:46:27] [anyclaude] DEBUG: Chat request {
  "model": "qwen2.5-7b",
  "messages": [...],
  "temperature": 0.7
}
[2025-10-28 22:46:27] [anyclaude] DEBUG: Cache put {
  "key": "12345abcdef",
  "size_kb": 1.23,
  "cache_size": 0
}
... (all timing checkpoints) ...
```

## Benefits

| Aspect              | Before            | After                      |
| ------------------- | ----------------- | -------------------------- |
| Debug control       | No built-in       | `ANYCLAUDE_DEBUG=0-3`      |
| Cache visibility    | Manual logging    | `log_cache_hit/miss()`     |
| Performance metrics | Time.time() calls | `PerformanceTimer` context |
| Error details       | Console only      | JSON files in `/tmp`       |
| Data formatting     | String concat     | Pretty JSON at level 3     |
| Trace analysis      | Grep logs         | Structured debug files     |

## Testing

1. **Start server with debug:**

   ```bash
   ANYCLAUDE_DEBUG=2 python3 scripts/mlx-server.py
   ```

2. **Make a request:**

   ```bash
   curl http://localhost:8081/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"current-model","messages":[{"role":"user","content":"Hello"}]}'
   ```

3. **Check output:**
   - Should see cache messages
   - Should see performance timers
   - Should see structured debug data

## Debugging Issues

**Messages not showing?**

- Check `echo $ANYCLAUDE_DEBUG` is set
- Use `debug()` not `logger.debug()` for ANYCLAUDE_DEBUG awareness
- Check log level matches your expectation

**Performance timer showing twice?**

- That's normal - it logs at checkpoint and on exit
- Adjust log_level if too verbose: `PerformanceTimer(..., log_level=3)`

**Errors not being caught?**

- Make sure you have a global exception handler
- Check error_debug_file is being created in /tmp

## Files Modified

- `scripts/mlx-server.py` - Add imports and integrate logging
- No other files need changes (utils_logging.py is standalone)

## Next Steps

1. Read `scripts/LOGGING_GUIDE.md` for complete API reference
2. Read `scripts/LOGGING_QUICK_START.md` for quick examples
3. Run `example_logging_integration.py` to see patterns
4. Integrate into your mlx-server.py using this guide
