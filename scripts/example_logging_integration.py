#!/usr/bin/env python3
"""
Example: How to integrate utils_logging.py into mlx-server.py

This file demonstrates the recommended patterns for using the logging utility
in your FastAPI server and other Python scripts.

Copy these patterns to your own code:

1. Import at the top
2. Setup logger early in main()
3. Use throughout your code
4. Optional: Add performance tracking for critical paths
"""

import asyncio
import sys
from pathlib import Path

# Add scripts directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from utils_logging import (
    setup_logger,
    display_debug_startup,
    debug,
    log_cache_hit,
    log_cache_miss,
    PerformanceTimer,
    is_debug_enabled,
    is_verbose_debug_enabled,
    write_error_debug_file,
    log_debug_error
)

# ============================================================================
# STEP 1: Setup logger at module level
# ============================================================================

logger = setup_logger("mlx-server-example")


# ============================================================================
# STEP 2: Example Server Setup
# ============================================================================

class ExampleInferenceServer:
    """Example server showing logging integration patterns."""

    def __init__(self):
        """Initialize server with logging."""
        logger.info("Initializing inference server...")
        display_debug_startup()  # Show debug info if enabled

        # Simulate cache
        self.prompt_cache = {}
        self.cache_age = {}

    async def chat_completion(self, prompt: str, model: str = "current-model") -> dict:
        """
        Example: Process a chat completion request.

        Shows:
        - Performance timing
        - Cache hit/miss logging
        - Debug messages at different levels
        """
        with PerformanceTimer("chat_completion", log_level=2) as timer:
            logger.info(f"Processing chat request for {model}")

            # Debug: Log the input at trace level
            debug(3, "Chat input", {
                "model": model,
                "prompt_length": len(prompt),
                "prompt_preview": prompt[:100] + "..." if len(prompt) > 100 else prompt
            })

            # Check cache
            cache_key = hash(prompt)

            if cache_key in self.prompt_cache:
                log_cache_hit("prompt", str(cache_key), {
                    "size_tokens": len(self.prompt_cache[cache_key]),
                    "age_seconds": 42  # Example
                })
            else:
                log_cache_miss("prompt", str(cache_key), "new_request")

            timer.checkpoint("cache_check_complete")

            # Simulate model loading
            await asyncio.sleep(0.1)
            logger.debug("Model loaded")
            timer.checkpoint("model_loaded")

            # Simulate inference
            await asyncio.sleep(0.05)
            logger.debug("Inference complete")
            timer.checkpoint("inference_complete")

            # Build response
            response = {
                "model": model,
                "content": "Example response from inference server"
            }

            logger.info("Chat request processed successfully")
            return response

    async def handle_error(self, error: Exception, request_data: dict) -> None:
        """
        Example: Error handling with debug file generation.

        Shows:
        - Writing error debug files
        - Logging errors with context
        """
        logger.error(f"Error processing request: {error}")

        # Write detailed debug info
        debug_file = write_error_debug_file(
            status_code=500,
            request_info={
                "method": "POST",
                "url": "/v1/chat/completions",
                "headers": {"content-type": "application/json"},
                "body": request_data
            },
            response_info={
                "statusCode": 500,
                "body": str(error)
            }
        )

        if debug_file:
            log_debug_error(
                "HTTP",
                500,
                debug_file,
                {"provider": "mlx", "model": "current"}
            )


# ============================================================================
# STEP 3: Conditional Debug Logging
# ============================================================================

def example_conditional_logging():
    """Show how to use conditional debug checks."""

    if is_debug_enabled():
        debug(1, "Debug mode is enabled, logging basic info")

    if is_verbose_debug_enabled():
        debug(2, "Verbose mode enabled, showing detailed info")
        # Load and show detailed configurations
        detailed_config = {
            "model_path": "/path/to/model",
            "cache_size": 1024,
            "num_layers": 24,
            "attention_heads": 8
        }
        debug(2, "Model configuration", detailed_config)


# ============================================================================
# STEP 4: Example Usage
# ============================================================================

async def main():
    """Run examples."""
    server = ExampleInferenceServer()

    # Example 1: Normal operation with timing and cache tracking
    print("\n=== Example 1: Normal Chat Completion ===")
    response = await server.chat_completion(
        "Hello, what is 2+2?",
        model="qwen2.5-7b"
    )
    print(f"Response: {response}")

    # Example 2: Repeated request (cache hit)
    print("\n=== Example 2: Cached Request ===")
    response = await server.chat_completion(
        "Hello, what is 2+2?",  # Same prompt
        model="qwen2.5-7b"
    )
    print(f"Response: {response}")

    # Example 3: Conditional logging
    print("\n=== Example 3: Conditional Debug ===")
    example_conditional_logging()

    # Example 4: Error handling
    print("\n=== Example 4: Error Handling ===")
    try:
        raise ValueError("Example error for demonstration")
    except Exception as e:
        await server.handle_error(e, {"prompt": "test"})


# ============================================================================
# STEP 5: Integration Points in mlx-server.py
# ============================================================================

"""
To integrate into mlx-server.py, add these at the top:

```python
# At imports
from scripts.utils_logging import (
    setup_logger,
    display_debug_startup,
    debug,
    log_cache_hit,
    log_cache_miss,
    PerformanceTimer
)

# Replace the logging.basicConfig with:
logger = setup_logger("mlx")
display_debug_startup()

# In your PromptCache class:
def get(self, key: str):
    if key in self.cache:
        log_cache_hit("prompt", key)
        return self.cache[key]
    else:
        log_cache_miss("prompt", key)
        return None

# In your chat completion endpoint:
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    with PerformanceTimer("chat_completion") as timer:
        # ... process request ...
        timer.checkpoint("model_loaded")
        # ... inference ...
        timer.checkpoint("inference_complete")
```
"""

if __name__ == "__main__":
    # Run with: ANYCLAUDE_DEBUG=2 python3 scripts/example_logging_integration.py
    asyncio.run(main())
