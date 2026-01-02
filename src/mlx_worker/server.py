"""
MLX Worker FastAPI Server

Provides OpenAI-compatible chat completions endpoint and cluster health monitoring.
"""

import os
import re
import json
import sys
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Get model path from environment - this is the actual filesystem path
MLX_MODEL_PATH = os.environ.get("MLX_MODEL_PATH", "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit")

# Special tokens to strip from model output (Qwen, Llama, etc.)
SPECIAL_TOKENS_TO_STRIP = [
    # Qwen tokens
    "<|im_end|>",
    "<|im_start|>",
    "<|endoftext|>",
    "<|end|>",
    # Generic EOS token
    "</s>",
    # Llama 3.x tokens
    "<|begin_of_text|>",
    "<|eot_id|>",
    "<|start_header_id|>",
    "<|end_header_id|>",
    # Reasoning/thinking tokens (Issue #46)
    "<think>",
    "</think>",
    "<reasoning>",
    "</reasoning>",
    "<thinking>",
    "</thinking>",
    "<thought>",
    "</thought>",
    "<reflection>",
    "</reflection>",
    "<|thinking>",
    "</|thinking>",
    "<output>",
    "</output>",
]

def strip_special_tokens(text: str) -> str:
    """
    Strip special tokens from model output.

    For reasoning tags directly adjacent to tool_call tags, removes content.
    Otherwise, preserves content and only removes tag markers.
    """
    # First pass: Remove reasoning content when directly before tool_call (no whitespace)
    # This handles cases like: <think>...</think><tool_call>
    reasoning_before_tool_patterns = [
        r'<think>.*?</think>(?=<tool_call>)',
        r'<reasoning>.*?</reasoning>(?=<tool_call>)',
        r'<thinking>.*?</thinking>(?=<tool_call>)',
        r'<thought>.*?</thought>(?=<tool_call>)',
        r'<reflection>.*?</reflection>(?=<tool_call>)',
        r'<\|thinking>.*?</\|thinking>(?=<tool_call>)',
    ]

    for pattern in reasoning_before_tool_patterns:
        text = re.sub(pattern, '', text, flags=re.DOTALL)

    # Second pass: Remove remaining tags but preserve content
    for token in SPECIAL_TOKENS_TO_STRIP:
        text = text.replace(token, "")

    return text

def get_model_context_length() -> int:
    """
    Read max context length from model's config.json.

    Looks for 'max_position_embeddings' in the model config.
    Falls back to 32768 if not found.
    """
    config_path = Path(MLX_MODEL_PATH).expanduser() / "config.json"
    try:
        if config_path.exists():
            with open(config_path) as f:
                config = json.load(f)
                return config.get("max_position_embeddings", 32768)
    except Exception as e:
        print(f"Warning: Could not read model config: {e}")
    return 32768  # Conservative default

# Cache the context length at startup
MODEL_CONTEXT_LENGTH = get_model_context_length()

# Add scripts directory to path for tool parsers
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# Import tool parsers
from lib.qwen_tool_parser import QwenToolParser
from lib.tool_parsers import ParserRegistry, OpenAIToolParser, FallbackParser

from .inference import generate_stream, InferenceError
from .cache import (
    get_cache_state,
    warm_cache,
    clear_cache,
    compute_prompt_hash,
    CacheError,
)
from .health import (
    get_node_health,
    get_metrics,
    record_request,
    increment_requests_in_flight,
    decrement_requests_in_flight,
    record_cache_hit,
    record_cache_miss,
)


# Pydantic models for request/response validation


class ChatMessage(BaseModel):
    """Chat message - handles both string and array content formats"""
    role: str = Field(..., pattern="^(system|user|assistant|tool)$")
    content: Optional[Union[str, List[Dict[str, Any]]]] = None  # String OR array of content blocks
    tool_call_id: Optional[str] = None  # For tool role messages
    tool_calls: Optional[List[Dict[str, Any]]] = None  # For assistant messages with tool calls
    name: Optional[str] = None  # For function/tool responses

    def get_text_content(self) -> str:
        """Extract text content from string or array format."""
        if self.content is None:
            return ""
        if isinstance(self.content, str):
            return self.content
        # Array format: [{"type": "text", "text": "..."}, ...]
        text_parts = []
        for block in self.content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        return "\n".join(text_parts)


class ChatCompletionRequest(BaseModel):
    """Chat completion request (OpenAI-compatible)"""
    model: str = Field("current-model")  # Allow any model name (claude-sonnet-4-20250514, etc.)
    messages: List[ChatMessage]
    max_tokens: Optional[int] = Field(2048, ge=1, le=32768)  # Increased for larger contexts
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(0.9, ge=0.0, le=1.0)
    stream: Optional[bool] = False
    tools: Optional[List[Dict[str, Any]]] = None
    tool_choice: Optional[Any] = None  # Allow tool_choice parameter


# Initialize parser registry with priority-ordered parsers
def _init_parser_registry() -> ParserRegistry:
    """
    Initialize ParserRegistry with Qwen, OpenAI, and Fallback parsers

    Priority order:
    1. OpenAIToolParser (priority 20) - Standard OpenAI format
    2. QwenToolParser (priority 10) - Qwen2.5-Coder XML formats
    3. FallbackParser (priority 100) - Plain text fallback

    Returns:
        Configured ParserRegistry instance
    """
    registry = ParserRegistry()

    # Register parsers in priority order (lower = higher priority)
    registry.register(QwenToolParser(), priority=10)  # Highest priority for Qwen
    registry.register(OpenAIToolParser(), priority=20)  # Standard OpenAI format
    registry.register(FallbackParser(), priority=100)  # Last resort

    return registry


# Global parser registry
_parser_registry = _init_parser_registry()


def parse_tool_calls_with_registry(content: str) -> tuple[str, List[Dict[str, Any]]]:
    """
    Parse tool calls using ParserRegistry fallback chain

    Args:
        content: Raw model output

    Returns:
        Tuple of (text_content, tool_calls in OpenAI format)
    """
    # Use parser registry to parse response
    parsed = _parser_registry.parse_with_fallback(content)

    # Handle different return types
    if parsed is None:
        # No tool calls found
        return content, []

    if isinstance(parsed, dict):
        # FallbackParser returned text response
        if parsed.get('type') == 'text':
            return parsed.get('content', content), []
        # Unknown dict format
        return content, []

    if isinstance(parsed, list):
        # Tool calls found - convert to OpenAI format
        tool_calls = []
        text_parts = []

        for call in parsed:
            # Convert Qwen format to OpenAI format
            tool_calls.append({
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": call.get("name", ""),
                    "arguments": json.dumps(call.get("arguments", {}))
                }
            })

        # Return empty text since tool calls were extracted
        # (text extraction logic could be added if needed)
        return "", tool_calls

    # Unknown return type
    return content, []


class CacheWarmRequest(BaseModel):
    """Cache warming request"""
    system_prompt: str


# FastAPI app


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    print("MLX Worker Node starting...")

    # Make parser registry available in app state for testing
    app.state.parser_registry = _parser_registry

    yield
    # Shutdown
    print("MLX Worker Node shutting down...")


app = FastAPI(
    title="MLX Worker Node",
    version="1.0.0",
    lifespan=lifespan
)


# Add validation error handler to log what's failing
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors with full details for debugging."""
    print(f"[VALIDATION ERROR] {exc.errors()}")
    # Also try to log the raw body
    try:
        body = await request.body()
        print(f"[VALIDATION ERROR] Request body (first 2000 chars): {body[:2000]}")
    except Exception:
        pass
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


# Endpoints


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    x_session_id: Optional[str] = Header(None),
):
    """
    OpenAI-compatible chat completions endpoint.

    Supports streaming and non-streaming responses.
    """
    start_time = time.time()

    # Generate or use provided session ID
    session_id = x_session_id or str(uuid.uuid4())

    # Track request
    increment_requests_in_flight()

    try:
        # Convert messages to dict format, extracting text from array content
        messages = [{"role": msg.role, "content": msg.get_text_content()} for msg in request.messages]

        # Check for cache hit (if system message present)
        cache_hit = False
        if messages and messages[0].get('role') == 'system':
            system_prompt = messages[0]['content']
            prompt_hash = compute_prompt_hash(system_prompt)
            cache_state = get_cache_state()

            if cache_state['systemPromptHash'] == prompt_hash:
                cache_hit = True
                record_cache_hit()
            else:
                record_cache_miss()
        else:
            record_cache_miss()

        # Generate response
        if request.stream:
            # Streaming response
            return StreamingResponse(
                _stream_response(messages, request, session_id, cache_hit, start_time),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                    "X-Session-Id": session_id,
                    "X-Cache-Hit": "true" if cache_hit else "false",
                }
            )
        else:
            # Non-streaming response
            tokens = []
            try:
                for token in generate_stream(
                    messages,
                    model_path=MLX_MODEL_PATH,  # Use env var, not request.model
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    top_p=request.top_p,
                    tools=request.tools,
                ):
                    tokens.append(token)

                raw_content = "".join(tokens)

                # Strip special tokens from output
                raw_content = strip_special_tokens(raw_content)

                # Parse tool calls from response using registry
                content, tool_calls = parse_tool_calls_with_registry(raw_content)

                # Record success
                latency = (time.time() - start_time) * 1000
                record_request(success=True, latency=latency)

                # Build message with optional tool_calls
                message = {
                    "role": "assistant",
                    "content": content if content else None,
                }
                if tool_calls:
                    message["tool_calls"] = tool_calls

                return JSONResponse(
                    content={
                        "id": f"chatcmpl-{uuid.uuid4()}",
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": request.model,
                        "choices": [
                            {
                                "index": 0,
                                "message": message,
                                "finish_reason": "tool_calls" if tool_calls else "stop",
                            }
                        ],
                    },
                    headers={
                        "X-Session-Id": session_id,
                        "X-Cache-Hit": "true" if cache_hit else "false",
                    }
                )

            except Exception as e:
                # Record failure
                latency = (time.time() - start_time) * 1000
                record_request(success=False, latency=latency)
                raise

    except ValueError as e:
        latency = (time.time() - start_time) * 1000
        record_request(success=False, latency=latency)
        raise HTTPException(status_code=400, detail=str(e))

    except InferenceError as e:
        latency = (time.time() - start_time) * 1000
        record_request(success=False, latency=latency)
        raise HTTPException(
            status_code=500,
            detail={"error": {"message": str(e), "type": "inference_error"}}
        )

    except Exception as e:
        latency = (time.time() - start_time) * 1000
        record_request(success=False, latency=latency)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        decrement_requests_in_flight()


async def _stream_response(
    messages: List[Dict[str, str]],
    request: ChatCompletionRequest,
    session_id: str,
    cache_hit: bool,
    start_time: float,
):
    """
    Generate streaming SSE response.

    For tool calls: buffers tokens, parses tool calls, emits proper format.
    For regular content: streams tokens as they arrive.

    Yields:
        SSE-formatted events
    """
    import json

    completion_id = f"chatcmpl-{uuid.uuid4()}"
    created = int(time.time())

    try:
        # If tools are provided, buffer tokens to detect tool calls
        if request.tools:
            tokens = []
            for token in generate_stream(
                messages,
                model_path=MLX_MODEL_PATH,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                tools=request.tools,
            ):
                tokens.append(token)

            raw_content = "".join(tokens)

            # Strip special tokens from output
            raw_content = strip_special_tokens(raw_content)

            # Parse tool calls from response
            content, tool_calls = parse_tool_calls_with_registry(raw_content)

            if tool_calls:
                # Emit tool calls in OpenAI streaming format
                for idx, tc in enumerate(tool_calls):
                    tool_chunk = {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": MLX_MODEL_PATH,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "tool_calls": [
                                        {
                                            "index": idx,
                                            "id": tc["id"],
                                            "type": "function",
                                            "function": {
                                                "name": tc["function"]["name"],
                                                "arguments": tc["function"]["arguments"],
                                            },
                                        }
                                    ],
                                },
                                "finish_reason": None,
                            }
                        ],
                    }
                    yield f"data: {json.dumps(tool_chunk)}\n\n"

                # Send final chunk with tool_calls finish reason
                final_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": request.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "tool_calls",
                        }
                    ],
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
            else:
                # No tool calls, emit buffered content as chunks
                if content:
                    chunk = {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": MLX_MODEL_PATH,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": content},
                                "finish_reason": None,
                            }
                        ],
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"

                # Send final chunk
                final_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": request.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop",
                        }
                    ],
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
        else:
            # No tools - stream tokens directly for responsiveness
            for token in generate_stream(
                messages,
                model_path=MLX_MODEL_PATH,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                tools=request.tools,
            ):
                # Strip special tokens from output
                clean_token = strip_special_tokens(token)
                if not clean_token:
                    continue  # Skip empty tokens after stripping

                chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": MLX_MODEL_PATH,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": clean_token},
                            "finish_reason": None,
                        }
                    ],
                }
                yield f"data: {json.dumps(chunk)}\n\n"

            # Send final chunk
            final_chunk = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }
                ],
            }
            yield f"data: {json.dumps(final_chunk)}\n\n"

        yield "data: [DONE]\n\n"

        # Record success
        latency = (time.time() - start_time) * 1000
        record_request(success=True, latency=latency)

    except Exception as e:
        # Record failure
        latency = (time.time() - start_time) * 1000
        record_request(success=False, latency=latency)

        # Send error event
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "inference_error",
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"


@app.get("/v1/models")
async def list_models():
    """
    List available models (OpenAI-compatible).

    Extended with context_length for proxy auto-detection.
    """
    return {
        "object": "list",
        "data": [
            {
                "id": "current-model",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "mlx-worker",
                "context_length": MODEL_CONTEXT_LENGTH,  # From model config.json
                "model_path": MLX_MODEL_PATH,
            }
        ],
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns combined health, cache, and metrics information.
    """
    health = get_node_health()
    cache = get_cache_state()
    metrics = get_metrics()

    # Determine status based on health metrics
    status = "healthy"

    if health['consecutiveFailures'] >= 5:
        status = "unhealthy"
    elif health['errorRate'] > 0.5:
        status = "unhealthy"
    elif health['consecutiveFailures'] >= 2:
        status = "degraded"

    return {
        "status": status,
        "health": health,
        "cache": cache,
        "metrics": metrics,
    }


@app.get("/cache")
async def get_cache():
    """
    Get current cache state.
    """
    return get_cache_state()


@app.post("/cache/warm")
async def warm_cache_endpoint(request: CacheWarmRequest):
    """
    Warm cache with system prompt.
    """
    try:
        result = warm_cache(request.system_prompt)
        return {
            "success": True,
            "hash": result['systemPromptHash'],
            **result
        }
    except CacheError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Main entry point


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8081,
        log_level="info"
    )
