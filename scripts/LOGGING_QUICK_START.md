# Logging Utility Quick Start

A Python logging utility for anyclaude with debug levels, cache tracking, and performance metrics.

## Files Created

1. **`scripts/utils_logging.py`** - Main logging module
2. **`scripts/LOGGING_GUIDE.md`** - Complete API reference
3. **`scripts/example_logging_integration.py`** - Working examples
4. **`scripts/LOGGING_QUICK_START.md`** - This file

## Quick Usage

### Import and Setup (Basic)

```python
from scripts.utils_logging import setup_logger, debug

# Setup logger for your module
logger = setup_logger(__name__)

# Log messages
logger.info("Starting process")
logger.error("Something went wrong")

# Debug messages (show with ANYCLAUDE_DEBUG=1+)
debug(1, "Basic debug info")
debug(2, "Detailed info", {"key": "value"})
```

### Run with Debug

```bash
# Level 1: Basic debug messages
ANYCLAUDE_DEBUG=1 python3 your_script.py

# Level 2: Verbose output + performance metrics
ANYCLAUDE_DEBUG=2 python3 your_script.py

# Level 3: Full trace with complete data structures
ANYCLAUDE_DEBUG=3 python3 your_script.py
```

## Common Patterns

### 1. Performance Timing

```python
from scripts.utils_logging import PerformanceTimer

with PerformanceTimer("operation_name") as timer:
    # ... do work ...
    elapsed = timer.checkpoint("halfway")
    # ... more work ...
# Logs: operation_name completed in 123.45ms
```

### 2. Cache Logging

```python
from scripts.utils_logging import log_cache_hit, log_cache_miss

# Cache hit
log_cache_hit("prompt", cache_key, {"tokens": 1500})

# Cache miss
log_cache_miss("kv_cache", session_id, "new_session")
```

### 3. Error Handling

```python
from scripts.utils_logging import write_error_debug_file, log_debug_error

try:
    result = process_request(request)
except Exception as e:
    debug_file = write_error_debug_file(
        status_code=500,
        request_info={"method": "POST", "url": "/api"},
        response_info={"statusCode": 500, "body": str(e)}
    )

    if debug_file:
        log_debug_error("HTTP", 500, debug_file,
                       {"provider": "mlx", "model": "qwen2.5"})
```

### 4. Conditional Logging

```python
from scripts.utils_logging import is_debug_enabled, is_verbose_debug_enabled

if is_debug_enabled():
    debug(1, "Basic info")

if is_verbose_debug_enabled():
    debug(2, "Detailed diagnostics")
```

## Integrating with vllm-mlx-server.py

Replace the top of vllm-mlx-server.py:

```python
# OLD:
import logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("vllm-mlx")

# NEW:
import sys
sys.path.insert(0, str(Path(__file__).parent))
from utils_logging import setup_logger, display_debug_startup

logger = setup_logger("vllm-mlx")
display_debug_startup()  # Shows debug info if ANYCLAUDE_DEBUG set
```

Then use in your code:

```python
from utils_logging import debug, log_cache_hit, PerformanceTimer

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    with PerformanceTimer("chat", log_level=2) as timer:
        logger.info("Chat request received")

        # Check cache
        if cache_hit:
            log_cache_hit("prompt", key)
        else:
            log_cache_miss("prompt", key)

        timer.checkpoint("cache_check")

        # ... inference ...

        timer.checkpoint("inference_done")
        return response
```

## What's Different from Standard Logging

| Feature | Standard | utils_logging |
|---------|----------|---------------|
| Debug levels | Manual if/else | `debug(level, msg, data)` |
| Environment control | Via CLI args | `ANYCLAUDE_DEBUG=1-3` |
| Performance timing | Manual time.time() | `PerformanceTimer()` context |
| Cache tracking | Manual logging | `log_cache_hit/miss()` |
| Error debugging | Console only | JSON files in `/tmp` |
| Data formatting | String only | Pretty JSON at level 3 |

## Example: Full Integration

```python
#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from utils_logging import (
    setup_logger,
    display_debug_startup,
    debug,
    log_cache_hit,
    PerformanceTimer
)
from fastapi import FastAPI, Request

# Setup
app = FastAPI()
logger = setup_logger("my_api")
display_debug_startup()

# Cache
cache = {}

@app.post("/v1/completions")
async def completions(request: Request):
    with PerformanceTimer("completion") as timer:
        req_data = await request.json()
        key = hash(req_data['prompt'])

        logger.info("Received request")
        debug(3, "Request data", req_data)  # Shows at level 3+

        # Check cache
        if key in cache:
            log_cache_hit("prompt", str(key))
        else:
            log_cache_miss("prompt", str(key))

        timer.checkpoint("cache_check")

        # Process...
        result = await model.generate(req_data['prompt'])
        cache[key] = result

        logger.info("Request completed")
        return {"result": result}

if __name__ == "__main__":
    import uvicorn
    # Run with: ANYCLAUDE_DEBUG=2 python3 api.py
    uvicorn.run(app, host="localhost", port=8000)
```

## Debugging

### Messages not showing?

1. Check `ANYCLAUDE_DEBUG` is set: `export ANYCLAUDE_DEBUG=1`
2. Use `debug()` function, not `logger.debug()` (debug is aware of ANYCLAUDE_DEBUG)
3. Verify debug level matches:
   - Level 1: Basic messages
   - Level 2: Verbose + performance
   - Level 3: Full trace

### Performance timer showing multiple times?

By default, `PerformanceTimer` requires level 2. Change with:

```python
# Shows at level 1
PerformanceTimer("op", log_level=1)

# Only at level 3
PerformanceTimer("op", log_level=3)
```

## Environment Variables

- `ANYCLAUDE_DEBUG=0` - No debug output (default)
- `ANYCLAUDE_DEBUG=1` - Basic debug
- `ANYCLAUDE_DEBUG=2` - Verbose (with performance)
- `ANYCLAUDE_DEBUG=3` - Trace (full objects)

## Files Created

- `scripts/utils_logging.py` - Module (250+ lines, fully typed)
- `scripts/LOGGING_GUIDE.md` - Complete reference
- `scripts/example_logging_integration.py` - Working example
- `scripts/LOGGING_QUICK_START.md` - You are here

## Next Steps

1. Copy the import pattern from example_logging_integration.py
2. Add `setup_logger()` call at startup of your script
3. Replace `logging.` calls with `debug()` for ANYCLAUDE_DEBUG support
4. Test with `ANYCLAUDE_DEBUG=2 python3 your_script.py`
