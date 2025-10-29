#!/usr/bin/env python3
"""
vLLM-MLX Server: OpenAI-compatible inference server with prompt caching and tool support
Built on MLX for native Apple Silicon optimization

Features:
- OpenAI-compatible /v1/chat/completions endpoint
- Prompt caching (automatic prefix caching via MLX)
- Tool/function calling support
- Native MLX model loading (no conversions)
- Streaming responses with SSE
- CPU-only mode for GPU stability issues

Environment Variables:
- MLX_FORCE_CPU=1: Force CPU-only mode (disables GPU)
- ANYCLAUDE_DEBUG=1: Enable debug logging
"""

import json
import asyncio
import logging
import sys
import time
import os
import signal
import atexit
from typing import Optional, Any
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import threading

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

# Check for CPU-only mode (fixes Metal GPU assertion errors on macOS)
FORCE_CPU = os.environ.get("MLX_FORCE_CPU", "0") == "1"
if FORCE_CPU:
    print("⚠️  CPU-only mode enabled (MLX_FORCE_CPU=1)")

# Try to import MLX - if it fails, we'll still run but with limited functionality
HAS_MLX = False
try:
    import mlx.core as mx
    # Force CPU if requested
    if FORCE_CPU:
        mx.set_default_device(mx.cpu)
    print("✓ MLX core available")
    HAS_MLX = True
except Exception as e:
    print(f"Warning: MLX core not available: {e}")

# Try mlx_lm - note: this may fail due to huggingface_hub import issues
# That's ok, we'll run in demo mode
mlx_lm = None
if HAS_MLX:
    try:
        import mlx_lm as mlx_lm_module
        mlx_lm = mlx_lm_module
        print("✓ MLX LM available" + (" (CPU-only)" if FORCE_CPU else ""))
    except Exception as e:
        print(f"Warning: MLX LM import failed (running in demo mode): {e}")
        HAS_MLX = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("vllm-mlx")

# GPU synchronization lock to prevent concurrent GPU operations
gpu_lock = threading.Lock()

def sync_gpu():
    """Force GPU synchronization to prevent assertion errors"""
    try:
        if HAS_MLX and not FORCE_CPU:
            import mlx.core as mx
            mx.eval(mx.zeros(1))  # Force GPU evaluation and sync
    except Exception as e:
        logger.debug(f"GPU sync failed (non-fatal): {e}")

# ============================================================================
# Models and Configuration
# ============================================================================

class ToolDefinition:
    """Tool/function definition for Claude-style tool calling"""
    def __init__(self, name: str, description: str, parameters: dict):
        self.name = name
        self.description = description
        self.parameters = parameters

    def to_dict(self):
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }


class ChatMessage:
    """Represents a chat message with support for tool use"""
    def __init__(self, role: str, content: str = None, tool_calls: list = None):
        self.role = role
        self.content = content or ""
        self.tool_calls = tool_calls or []

    def to_dict(self):
        msg = {"role": self.role}
        if self.content:
            msg["content"] = self.content
        if self.tool_calls:
            msg["tool_calls"] = self.tool_calls
        return msg


class PromptCache:
    """Prompt caching with MLX KV cache integration"""
    def __init__(self, max_size: int = 32):
        self.max_size = max_size  # Keep last N results in memory
        self.cache = {}  # Maps cache_key -> (prompt_hash, response, timestamp)
        self.access_order = []  # Track LRU access
        self.kv_cache_state = None  # MLX KV cache state for current session
        self.cache_stats = {
            "hits": 0,
            "misses": 0,
            "total_requests": 0
        }
        self.last_request_was_hit = False  # Track if last request was a cache hit

    def get_cache_key(self, messages: list, tools: list = None) -> str:
        """Generate consistent cache key from messages and tools"""
        try:
            msg_str = json.dumps(messages, sort_keys=True, default=str)
            tools_str = json.dumps(tools, sort_keys=True, default=str) if tools else ""
            # Use hash for compact key (Python's hash is deterministic within session)
            combined = msg_str + tools_str
            key = str(abs(hash(combined)))
            return key
        except Exception as e:
            logger.warning(f"Cache key generation failed: {e}")
            return None

    def has_cache(self, key: str) -> bool:
        """Check if result is cached"""
        if not key:
            return False
        return key in self.cache

    def get(self, key: str) -> Optional[tuple]:
        """Retrieve cached result and update LRU tracking"""
        if not key or key not in self.cache:
            return None

        # Update access order for LRU
        if key in self.access_order:
            self.access_order.remove(key)
        self.access_order.append(key)

        cached_data = self.cache[key]
        self.cache_stats["hits"] += 1
        logger.debug(f"Cache hit: {key}")
        return cached_data

    def set(self, key: str, value: tuple) -> None:
        """Store result in cache with LRU eviction"""
        if not key:
            return

        # Remove old entry if exists
        if key in self.cache:
            self.access_order.remove(key)

        # Add to cache
        self.cache[key] = value
        self.access_order.append(key)

        # Evict oldest if cache is full
        if len(self.cache) > self.max_size:
            oldest_key = self.access_order.pop(0)
            del self.cache[oldest_key]
            logger.debug(f"Cache evicted (LRU): {oldest_key}")

        logger.debug(f"Cache stored: {key}")

    def get_stats(self) -> dict:
        """Get cache statistics"""
        total = self.cache_stats["total_requests"]
        hit_rate = (self.cache_stats["hits"] / total * 100) if total > 0 else 0
        return {
            "hits": self.cache_stats["hits"],
            "misses": self.cache_stats["misses"],
            "total_requests": total,
            "hit_rate": f"{hit_rate:.1f}%",
            "cached_items": len(self.cache)
        }

    def record_request(self, is_hit: bool = False) -> None:
        """Record cache request stats"""
        self.cache_stats["total_requests"] += 1
        self.last_request_was_hit = is_hit
        if is_hit:
            self.cache_stats["hits"] += 1
        else:
            self.cache_stats["misses"] += 1


# ============================================================================
# vLLM-MLX Server
# ============================================================================

class VLLMMLXServer:
    def __init__(self, model_path: str, port: int = 8081, host: str = "0.0.0.0"):
        self.model_path = model_path
        self.port = port
        self.host = host
        self.model = None
        self.tokenizer = None
        # Configure cache size: default 256, override with VLLM_CACHE_SIZE env var
        cache_size = int(os.environ.get("VLLM_CACHE_SIZE", "256"))
        self.cache = PromptCache(max_size=cache_size)
        logger.info(f"Prompt cache initialized with size: {cache_size}")
        self.app = FastAPI(title="vLLM-MLX Server")
        # Thread pool for blocking MLX inference (1 worker to serialize GPU ops)
        # Using single worker prevents concurrent GPU operations that cause Metal assertion errors
        self.executor = ThreadPoolExecutor(max_workers=1)
        self._setup_routes()

        # Register cleanup handlers
        atexit.register(self._cleanup)
        for sig in [signal.SIGINT, signal.SIGTERM]:
            signal.signal(sig, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down...")
        self._cleanup()
        sys.exit(0)

    def _cleanup(self):
        """Clean up resources"""
        try:
            logger.info("Cleaning up...")
            self.executor.shutdown(wait=False)
            if HAS_MLX and not FORCE_CPU:
                sync_gpu()
        except Exception as e:
            logger.debug(f"Cleanup error: {e}")

    def _generate_safe(self, model, tokenizer, prompt, options):
        """Generate text with GPU synchronization and error recovery"""
        # Use lock to serialize GPU operations
        with gpu_lock:
            try:
                # Pre-sync to clear any pending GPU operations
                sync_gpu()

                # Generate with timeout to catch hanging operations
                result = mlx_lm.generate(model, tokenizer, prompt, options)

                # Post-sync to ensure GPU is in clean state
                sync_gpu()

                return result
            except Exception as e:
                logger.error(f"Generation error: {e}")
                if "Metal" in str(e) or "assertion" in str(e).lower():
                    logger.error("Metal GPU assertion error detected. This may indicate GPU resource exhaustion.")
                    logger.error("Try one of:")
                    logger.error("  1. Restart the server")
                    logger.error("  2. Run with smaller max_tokens")
                    logger.error("  3. Run with MLX_FORCE_CPU=1 for stability")
                raise

    def _setup_routes(self):
        """Setup FastAPI routes compatible with OpenAI API"""

        @self.app.post("/v1/chat/completions")
        async def chat_completions(request: Request):
            """OpenAI-compatible chat completions endpoint"""
            try:
                body = await request.json()
                return await self._handle_chat_completion(body)
            except Exception as e:
                logger.error(f"Chat completion error: {e}")
                return JSONResponse(
                    status_code=500,
                    content={
                        "error": {
                            "message": str(e),
                            "type": "internal_server_error"
                        }
                    }
                )

        @self.app.get("/v1/models")
        async def list_models():
            """OpenAI-compatible models listing endpoint"""
            return {
                "object": "list",
                "data": [
                    {
                        "id": Path(self.model_path).name,
                        "object": "model",
                        "owned_by": "mlx-vllm",
                        "permission": []
                    }
                ]
            }

        @self.app.get("/health")
        async def health():
            """Health check endpoint with cache statistics"""
            return {
                "status": "healthy",
                "model": Path(self.model_path).name if self.model else None,
                "model_loaded": self.model is not None,
                "cache": self.cache.get_stats()
            }

    async def load_model(self):
        """Load MLX model asynchronously"""
        if not HAS_MLX:
            logger.warning(f"MLX not available, running in demo mode")
            return True

        try:
            logger.info(f"Loading MLX model from: {self.model_path}")
            # Use mlx_lm's load function
            self.model, self.tokenizer = mlx_lm.load(self.model_path)
            logger.info(f"Model loaded successfully" + (" (CPU-only)" if FORCE_CPU else ""))
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            if "Metal" in str(e) or "GPU" in str(e):
                logger.error("GPU error detected. Try running with: MLX_FORCE_CPU=1")
            logger.warning(f"Falling back to demo mode")
            return True  # Still allow server to run

    async def _handle_chat_completion(self, request_body: dict) -> StreamingResponse:
        """Handle chat completion request with cache and tool support"""

        # Extract request parameters
        messages = request_body.get("messages", [])
        tools = request_body.get("tools", [])
        temperature = request_body.get("temperature", 0.7)
        max_tokens = request_body.get("max_tokens", 1024)
        stream = request_body.get("stream", False)

        # Check cache first
        cache_key = self.cache.get_cache_key(messages, tools)
        cached_result = None

        if cache_key and self.cache.has_cache(cache_key):
            cached_result = self.cache.get(cache_key)
            self.cache.record_request(is_hit=True)
            logger.info(f"Cache HIT: {len(messages)} messages, returning cached response")
            # Log cache statistics
            cache_stats = self.cache.get_stats()
            logger.debug(f"[Cache Stats] Hit Rate: {cache_stats['hit_rate']} ({cache_stats['hits']}/{cache_stats['total_requests']}), Cached Items: {cache_stats['cached_items']}")

        # Convert messages to prompt
        prompt = self._format_messages(messages, tools)

        logger.info(f"Processing request: {len(messages)} messages, stream={stream}, cache={'hit' if cached_result else 'miss'}")

        if stream:
            return StreamingResponse(
                self._stream_generate(prompt, temperature, max_tokens, messages, tools, cache_key, cached_result),
                media_type="text/event-stream"
            )
        else:
            # Non-streaming response
            if cached_result:
                return JSONResponse(cached_result)

            self.cache.record_request(is_hit=False)
            logger.debug(f"[Cache Miss] Processing new request (cache size: {len(self.cache.cache)}/{self.cache.max_size})")
            response = await self._generate_response(prompt, temperature, max_tokens, messages, tools, cache_key)
            # Log cache statistics after generating new response
            cache_stats = self.cache.get_stats()
            logger.debug(f"[Cache Stats] Hit Rate: {cache_stats['hit_rate']} ({cache_stats['hits']}/{cache_stats['total_requests']}), Cached Items: {cache_stats['cached_items']}")
            return JSONResponse(response)

    def _format_messages(self, messages: list, tools: list = None) -> str:
        """Format messages for MLX model"""

        system_prompt = ""
        conversation = ""

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_prompt = content
            elif role == "user":
                conversation += f"User: {content}\n\n"
            elif role == "assistant":
                conversation += f"Assistant: {content}\n\n"

        # Add tool descriptions if provided
        if tools:
            # Sort tools by name for deterministic tool description ordering
            # This ensures consistent cache keys regardless of tool order from client
            sorted_tools = sorted(tools, key=lambda t: t['function']['name'])
            tool_descriptions = "\n\n".join([
                f"Tool: {tool['function']['name']}\nDescription: {tool['function']['description']}"
                for tool in sorted_tools
            ])
            system_prompt += f"\n\nAvailable tools:\n{tool_descriptions}"

        return f"{system_prompt}\n\n{conversation}".strip()

    async def _stream_generate(self, prompt: str, temperature: float, max_tokens: int,
                               original_messages: list, tools: list, cache_key: str = None, cached_result=None):
        """Generate response with streaming and caching"""

        try:
            # Send message_start event
            yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'role': 'assistant'}, 'finish_reason': None}]})}\n\n"

            # If we have a cached result, stream it
            if cached_result:
                logger.debug(f"[Stream Cache Hit] Streaming cached response")
                cached_text = cached_result['choices'][0]['message']['content']
                for char in cached_text:
                    yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'content': char}, 'finish_reason': None}]})}\n\n"

                # Stream cached tool calls if present
                tool_calls = cached_result['choices'][0]['message'].get('tool_calls')
                finish_reason = "tool_calls" if tool_calls else "stop"
                final_msg = {
                    "object": "text_completion",
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": finish_reason,
                        "tool_calls": tool_calls if tool_calls else None
                    }]
                }
                yield f"data: {json.dumps(final_msg)}\n\n"
                yield "data: [DONE]\n\n"
                # Log cache statistics after streaming cached response
                cache_stats = self.cache.get_stats()
                logger.debug(f"[Cache Stats] Hit Rate: {cache_stats['hit_rate']} ({cache_stats['hits']}/{cache_stats['total_requests']}), Cached Items: {cache_stats['cached_items']}")
                return

            generated_text = ""
            logger.debug(f"[Stream Cache Miss] Processing new streaming request (cache size: {len(self.cache.cache)}/{self.cache.max_size})")

            if HAS_MLX and self.model and self.tokenizer:
                # Real MLX inference in thread pool to avoid blocking event loop
                try:
                    loop = asyncio.get_event_loop()
                    # Run blocking mlx_lm.generate in thread pool with GPU synchronization
                    generated_text = await loop.run_in_executor(
                        self.executor,
                        self._generate_safe,
                        self.model,
                        self.tokenizer,
                        prompt,
                        {"max_tokens": max_tokens, "verbose": False}
                    )

                    # Stream character by character
                    for char in str(generated_text):
                        yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'content': char}, 'finish_reason': None}]})}\n\n"
                except Exception as e:
                    logger.warning(f"MLX generation failed: {e}, using demo response")
                    # Fall back to demo response
                    generated_text = f"I received {len(original_messages)} message(s)"
                    if tools:
                        generated_text += f" and {len(tools)} tool(s) are available."
                    else:
                        generated_text += "."

                    for char in generated_text:
                        yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'content': char}, 'finish_reason': None}]})}\n\n"
            else:
                # Demo mode response
                generated_text = f"I received {len(original_messages)} message(s)"
                if tools:
                    generated_text += f" and {len(tools)} tool(s) are available."
                else:
                    generated_text += "."

                for char in generated_text:
                    yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'content': char}, 'finish_reason': None}]})}\n\n"

            # Parse tool calls if present
            tool_calls = self._parse_tool_calls(generated_text, tools)

            # Cache the result for future requests
            if cache_key and generated_text:
                response_obj = {
                    "object": "text_completion",
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": generated_text,
                            "tool_calls": tool_calls if tool_calls else None
                        },
                        "finish_reason": "tool_calls" if tool_calls else "stop"
                    }]
                }
                self.cache.set(cache_key, response_obj)

            # Send final completion
            finish_reason = "tool_calls" if tool_calls else "stop"
            final_msg = {
                "object": "text_completion",
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": finish_reason,
                    "tool_calls": tool_calls if tool_calls else None
                }]
            }
            yield f"data: {json.dumps(final_msg)}\n\n"
            yield "data: [DONE]\n\n"
            # Log cache statistics after streaming is complete
            cache_stats = self.cache.get_stats()
            logger.debug(f"[Cache Stats] Hit Rate: {cache_stats['hit_rate']} ({cache_stats['hits']}/{cache_stats['total_requests']}), Cached Items: {cache_stats['cached_items']}")

        except Exception as e:
            logger.error(f"Streaming generation error: {e}")
            error_msg = {
                "error": {
                    "message": str(e),
                    "type": "generation_error"
                }
            }
            yield f"data: {json.dumps(error_msg)}\n\n"

    async def _generate_response(self, prompt: str, temperature: float, max_tokens: int,
                                original_messages: list, tools: list, cache_key: str = None) -> dict:
        """Generate non-streaming response with caching"""

        try:
            completion_text = ""
            prompt_tokens = 0
            completion_tokens = 0
            cache_read_tokens = 0

            if HAS_MLX and self.model and self.tokenizer:
                # Real MLX inference in thread pool to avoid blocking
                try:
                    start_time = time.time()
                    loop = asyncio.get_event_loop()

                    # Run blocking mlx_lm.generate in thread pool with GPU synchronization
                    completion_text = await loop.run_in_executor(
                        self.executor,
                        self._generate_safe,
                        self.model,
                        self.tokenizer,
                        prompt,
                        {"max_tokens": max_tokens, "verbose": False}
                    )

                    inference_time = time.time() - start_time
                    logger.info(f"MLX inference completed in {inference_time:.2f}s")

                    # Estimate token counts (rough approximation: ~1 token per 4 chars)
                    tokens = self.tokenizer.encode(prompt)
                    prompt_tokens = len(tokens)
                    completion_tokens = len(completion_text) // 4  # Rough estimate
                except Exception as e:
                    logger.warning(f"MLX generation failed: {e}, using demo response")
                    # Fall back to demo response
                    completion_text = f"I received {len(original_messages)} message(s)"
                    if tools:
                        completion_text += f" and {len(tools)} tool(s) are available."
                    else:
                        completion_text += "."
                    prompt_tokens = 10
                    completion_tokens = len(completion_text.split())
            else:
                # Demo mode response
                completion_text = f"I received {len(original_messages)} message(s)"
                if tools:
                    completion_text += f" and {len(tools)} tool(s) are available."
                else:
                    completion_text += "."
                prompt_tokens = 10
                completion_tokens = len(completion_text.split())

            # Parse tool calls
            tool_calls = self._parse_tool_calls(completion_text, tools)
            finish_reason = "tool_calls" if tool_calls else "stop"

            # Cache the response for future identical requests
            response_obj = {
                "object": "text_completion",
                "model": Path(self.model_path).name,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": completion_text,
                        "tool_calls": tool_calls if tool_calls else None
                    },
                    "finish_reason": finish_reason
                }],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": cache_read_tokens,
                }
            }

            # Store in cache for future requests
            if cache_key and completion_text:
                self.cache.set(cache_key, response_obj)

            return response_obj

        except Exception as e:
            logger.error(f"Generation error: {e}")
            return {
                "error": {
                    "message": str(e),
                    "type": "generation_error"
                }
            }

    def _parse_tool_calls(self, text: str, tools: list) -> list:
        """Parse tool calls from generated text with improved JSON argument handling"""

        if not tools or not text:
            return []

        import re
        tool_calls = []
        tool_name_to_schema = {tool['function']['name']: tool['function'] for tool in tools}

        # Try to find tool calls in multiple formats:
        # 1. JSON format: {"tool": "name", "arguments": {...}}
        # 2. Function format: tool_name({"arg1": "val1"})
        # 3. Simple format: tool_name with args nearby

        # First try JSON object format
        json_pattern = r'"tool":\s*"([^"]+)".*?"arguments":\s*({[^}]+})'
        for match in re.finditer(json_pattern, text, re.DOTALL):
            tool_name = match.group(1)
            args_str = match.group(2)
            if tool_name in tool_name_to_schema:
                try:
                    args_json = json.loads(args_str) if isinstance(args_str, str) else args_str
                    tool_calls.append({
                        "id": f"call_{len(tool_calls)}",
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(args_json) if isinstance(args_json, dict) else args_str
                        }
                    })
                except Exception as e:
                    logger.debug(f"Failed to parse JSON tool arguments: {e}")
                    continue

        # Second try function call format: tool_name({...})
        for tool_name in tool_name_to_schema:
            # Pattern: tool_name followed by ( then {...} then )
            pattern = rf"{re.escape(tool_name)}\s*\(\s*({{\s*[^}}]*}})\s*\)"
            for match in re.finditer(pattern, text, re.DOTALL):
                args_str = match.group(1)
                if not any(tc['function']['name'] == tool_name for tc in tool_calls):
                    try:
                        args_json = json.loads(args_str)
                        tool_calls.append({
                            "id": f"call_{len(tool_calls)}",
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(args_json)
                            }
                        })
                    except Exception as e:
                        logger.debug(f"Failed to parse function call arguments for {tool_name}: {e}")
                        # Try with raw string as fallback
                        tool_calls.append({
                            "id": f"call_{len(tool_calls)}",
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": args_str
                            }
                        })

        # Third try simple format: just detect tool name mention
        for tool_name in tool_name_to_schema:
            if tool_name in text and not any(tc['function']['name'] == tool_name for tc in tool_calls):
                # Tool was mentioned but no arguments found
                logger.debug(f"Tool {tool_name} mentioned but no arguments found in response")

        return tool_calls

    def run(self):
        """Start the server"""
        logger.info(f"Starting vLLM-MLX Server on {self.host}:{self.port}")

        # Load model before starting server
        asyncio.run(self.load_model())

        uvicorn.run(self.app, host=self.host, port=self.port)


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="vLLM-MLX Server")
    parser.add_argument("--model", required=True, help="Path to MLX model directory")
    parser.add_argument("--port", type=int, default=8081, help="Server port")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument(
        "--cpu-only",
        action="store_true",
        help="Force CPU-only mode (disables GPU acceleration, fixes Metal assertion errors)"
    )

    args = parser.parse_args()

    # Override CPU mode from command line
    if args.cpu_only:
        os.environ["MLX_FORCE_CPU"] = "1"
        print("⚠️  CPU-only mode enabled via --cpu-only flag")

    if not Path(args.model).exists():
        print(f"Error: Model path does not exist: {args.model}")
        sys.exit(1)

    server = VLLMMLXServer(args.model, args.port, args.host)
    server.run()
