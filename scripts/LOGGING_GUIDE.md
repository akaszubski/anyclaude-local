# Python Logging Utility Guide

A comprehensive logging utility for anyclaude Python scripts with debug levels, performance metrics, and cache tracking.

## Quick Start

### Basic Usage

```python
from scripts.utils_logging import setup_logger, debug, is_debug_enabled

# Set up a logger
logger = setup_logger(__name__)

# Log messages
logger.info("Application started")
logger.warning("This might be an issue")
logger.error("Something went wrong")

# Debug messages (only show if ANYCLAUDE_DEBUG is set)
debug(1, "Basic debug info", {"key": "value"})
```

### Running with Debug Enabled

```bash
# Basic debug (level 1)
ANYCLAUDE_DEBUG=1 python3 scripts/vllm-mlx-server.py

# Verbose debug (level 2) - more detailed output
ANYCLAUDE_DEBUG=2 python3 scripts/vllm-mlx-server.py

# Trace debug (level 3) - all details, including full JSON structures
ANYCLAUDE_DEBUG=3 python3 scripts/vllm-mlx-server.py
```

## Functions Reference

### Debug Level Checking

```python
from scripts.utils_logging import (
    get_debug_level,
    is_debug_enabled,
    is_verbose_debug_enabled,
    is_trace_debug_enabled
)

# Get the numeric level (0, 1, 2, or 3)
level = get_debug_level()

# Check specific levels
if is_debug_enabled():
    # Any debug mode enabled
    pass

if is_verbose_debug_enabled():
    # Level 2 or 3
    pass

if is_trace_debug_enabled():
    # Level 3 only
    pass
```

### Logging

```python
from scripts.utils_logging import debug, logger

# Debug function (respects ANYCLAUDE_DEBUG levels)
debug(1, "Message")                        # Shows at level 1+
debug(2, "Detailed info")                  # Shows at level 2+
debug(3, "Full trace", full_data_dict)     # Shows at level 3 only, pretty-prints

# Standard logging
logger.info("Information message")
logger.warning("Warning message")
logger.error("Error message")
logger.debug("Debug message")
```

### Performance Tracking

```python
from scripts.utils_logging import PerformanceTimer, timing_decorator

# Context manager
with PerformanceTimer("Operation name") as timer:
    # ... do work ...
    elapsed = timer.checkpoint("halfway point")
    # ... more work ...
# Logs: Operation name completed in 123.45ms

# Decorator
@timing_decorator()
def my_function():
    # Function execution time is logged
    pass
```

### Cache Logging

```python
from scripts.utils_logging import log_cache_hit, log_cache_miss

# When cache hits
log_cache_hit("prompt", "system_prompt_hash_123", {
    "size_tokens": 1500,
    "age_seconds": 45
})

# When cache misses
log_cache_miss("kv_cache", "session_xyz", "new_session")
```

### Error Debugging

```python
from scripts.utils_logging import write_error_debug_file, log_debug_error

# Write detailed error info to a file
debug_file = write_error_debug_file(
    status_code=500,
    request_info={
        "method": "POST",
        "url": "/v1/chat/completions",
        "headers": {"content-type": "application/json"},
        "body": request_dict
    },
    response_info={
        "statusCode": 500,
        "headers": response_headers,
        "body": error_message
    }
)

# Log the error with context
if debug_file:
    log_debug_error(
        error_type="HTTP",
        status_code=500,
        debug_file=debug_file,
        context={"provider": "mlx", "model": "qwen2.5"}
    )
```

## Integration with vllm-mlx-server.py

Replace the basic logging setup:

```python
# OLD:
import logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("vllm-mlx")

# NEW:
from scripts.utils_logging import setup_logger, display_debug_startup

logger = setup_logger("vllm-mlx")
display_debug_startup()  # Show debug mode info if enabled
```

Then use throughout the server:

```python
from scripts.utils_logging import (
    debug,
    log_cache_hit,
    log_cache_miss,
    PerformanceTimer
)

# In your chat endpoint handler:
with PerformanceTimer("chat_completion", log_level=2) as timer:
    # Check prompt cache
    if cache_hit:
        log_cache_hit("prompt", cache_key, {"tokens": cached_size})
    else:
        log_cache_miss("prompt", cache_key, "new_request")

    # Process request...
    timer.checkpoint("model_loaded")

    # Run inference...
    timer.checkpoint("inference_complete")
```

## File Paths

- **Module**: `scripts/utils_logging.py`
- **This guide**: `scripts/LOGGING_GUIDE.md`
- **Debug files**: `{temp_dir}/anyclaude-debug-*.json` (created when errors occur)
- **Error log**: `{temp_dir}/anyclaude-errors.log` (running log of HTTP errors)

## Environment Variables

- `ANYCLAUDE_DEBUG`: Set to 0, 1, 2, or 3 to control debug verbosity
  - `0` or unset: No debug output
  - `1`: Basic debug (errors, important events)
  - `2`: Verbose debug (all operations, data truncated to 200 chars)
  - `3`: Trace debug (full data structures, streaming events)

## Examples

### Example 1: Basic Server Logging

```python
from scripts.utils_logging import setup_logger, display_debug_startup

logger = setup_logger("my_server")
display_debug_startup()

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    logger.info("Chat request received")
    # ... handle request ...
    logger.info("Chat response sent")
```

### Example 2: Cache-Aware Logging

```python
from scripts.utils_logging import (
    setup_logger,
    log_cache_hit,
    log_cache_miss,
    PerformanceTimer
)

logger = setup_logger("cache_server")

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    with PerformanceTimer("completion", log_level=2):
        prompt_key = hash_prompt(request.prompt)

        if prompt_key in cache:
            log_cache_hit("prompt", prompt_key, {
                "tokens": len(cache[prompt_key]),
                "age_ms": time.time() - cache_age[prompt_key]
            })
        else:
            log_cache_miss("prompt", prompt_key, "cache_miss")

        # ... process request ...
```

### Example 3: Error Handling with Debug Info

```python
from scripts.utils_logging import (
    setup_logger,
    write_error_debug_file,
    log_debug_error
)

logger = setup_logger("api_server")

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    try:
        result = await process_request(request)
        return result
    except Exception as e:
        # Write detailed debug info
        debug_file = write_error_debug_file(
            status_code=500,
            request_info={
                "method": "POST",
                "url": "/v1/chat/completions",
                "headers": dict(request.headers),
                "body": await request.body()
            },
            response_info={
                "statusCode": 500,
                "body": str(e)
            }
        )

        # Log with context
        log_debug_error(
            "HTTP",
            500,
            debug_file,
            {"provider": "mlx", "model": "current"}
        )

        return JSONResponse(
            {"error": str(e)},
            status_code=500
        )
```

## Troubleshooting

### Debug messages not showing?

1. Make sure `ANYCLAUDE_DEBUG` is set: `export ANYCLAUDE_DEBUG=1`
2. Check that you're using `debug()` function (not `logger.debug()` for ANYCLAUDE_DEBUG-aware logging)
3. Verify the debug level matches what you need:
   - Level 1: Basic info
   - Level 2: Verbose info + performance data
   - Level 3: Full trace with complete data structures

### Performance timer not showing?

By default, `PerformanceTimer` requires debug level 2 or higher. Change with:

```python
# Shows at level 1
PerformanceTimer("operation", log_level=1)

# Shows at level 3 (trace only)
PerformanceTimer("operation", log_level=3)
```

### Can't import module?

Make sure you're in the project root:

```python
# In project root: /Users/akaszubski/Documents/GitHub/anyclaude/
from scripts.utils_logging import setup_logger

# Or with sys.path manipulation:
import sys
sys.path.insert(0, '.')
from scripts.utils_logging import setup_logger
```
