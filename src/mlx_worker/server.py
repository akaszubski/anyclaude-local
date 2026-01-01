"""
MLX Worker FastAPI Server

Provides OpenAI-compatible chat completions endpoint and cluster health monitoring.
"""

import os
import re
import json
import time
import uuid
from typing import List, Dict, Any, Optional, Union
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Get model path from environment - this is the actual filesystem path
MLX_MODEL_PATH = os.environ.get("MLX_MODEL_PATH", "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit")

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
    """Chat message"""
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatCompletionRequest(BaseModel):
    """Chat completion request (OpenAI-compatible)"""
    model: str = Field("current-model", pattern="^[a-zA-Z0-9_-]+$")
    messages: List[ChatMessage]
    max_tokens: Optional[int] = Field(2048, ge=1, le=16384)
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(0.9, ge=0.0, le=1.0)
    stream: Optional[bool] = False
    tools: Optional[List[Dict[str, Any]]] = None


def parse_tool_calls(content: str) -> tuple[str, List[Dict[str, Any]]]:
    """
    Parse tool calls from model output.

    Qwen2.5 outputs tool calls in various XML formats:
    1. <tool_call>{"name": "func", "arguments": {...}}</tool_call>
    2. <tools>{"name": "func", "arguments": {...}}</tools>
    3. <function name="func" arguments='{...}'/>

    Returns:
        Tuple of (text_content, tool_calls)
    """
    tool_calls = []
    text_parts = []
    last_end = 0

    # Pattern 1: <tool_call> or <tools> with JSON body
    pattern1 = r'<(?:tool_call|tools)>\s*(.*?)\s*</(?:tool_call|tools)>'
    for match in re.finditer(pattern1, content, re.DOTALL):
        text_parts.append(content[last_end:match.start()])
        last_end = match.end()
        try:
            tool_json = json.loads(match.group(1))
            tool_calls.append({
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": tool_json.get("name", ""),
                    "arguments": json.dumps(tool_json.get("arguments", {}))
                }
            })
        except json.JSONDecodeError:
            text_parts.append(match.group(0))

    # Pattern 2: <function name="..." arguments='...'/>
    pattern2 = r'<function\s+name=["\']([^"\']+)["\']\s+arguments=["\'](.+?)["\']\s*/>'
    for match in re.finditer(pattern2, content, re.DOTALL):
        if match.start() >= last_end:
            text_parts.append(content[last_end:match.start()])
            last_end = match.end()
            try:
                args = json.loads(match.group(2))
                tool_calls.append({
                    "id": f"call_{uuid.uuid4().hex[:8]}",
                    "type": "function",
                    "function": {
                        "name": match.group(1),
                        "arguments": json.dumps(args)
                    }
                })
            except json.JSONDecodeError:
                text_parts.append(match.group(0))

    # Pattern 3: <{json}> format (another Qwen variation)
    pattern3 = r'<(\{[^>]+\})>'
    for match in re.finditer(pattern3, content, re.DOTALL):
        if match.start() >= last_end:
            text_parts.append(content[last_end:match.start()])
            last_end = match.end()
            try:
                tool_json = json.loads(match.group(1))
                tool_calls.append({
                    "id": f"call_{uuid.uuid4().hex[:8]}",
                    "type": "function",
                    "function": {
                        "name": tool_json.get("name", ""),
                        "arguments": json.dumps(tool_json.get("arguments", {}))
                    }
                })
            except json.JSONDecodeError:
                text_parts.append(match.group(0))

    # Add remaining text
    text_parts.append(content[last_end:])

    # Clean up markdown code blocks that might wrap tool calls
    final_text = "".join(text_parts).strip()
    final_text = re.sub(r'```(?:xml)?\s*```', '', final_text).strip()

    return final_text, tool_calls


class CacheWarmRequest(BaseModel):
    """Cache warming request"""
    system_prompt: str


# FastAPI app


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    print("MLX Worker Node starting...")
    yield
    # Shutdown
    print("MLX Worker Node shutting down...")


app = FastAPI(
    title="MLX Worker Node",
    version="1.0.0",
    lifespan=lifespan
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
        # Convert messages to dict format
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

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

                # Parse tool calls from response
                content, tool_calls = parse_tool_calls(raw_content)

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

    Yields:
        SSE-formatted events
    """
    completion_id = f"chatcmpl-{uuid.uuid4()}"
    created = int(time.time())

    try:
        for token in generate_stream(
            messages,
            model_path=MLX_MODEL_PATH,  # Use env var, not request.model
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            tools=request.tools,
        ):
            chunk = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": MLX_MODEL_PATH,
                "choices": [
                    {
                        "index": 0,
                        "delta": {
                            "content": token,
                        },
                        "finish_reason": None,
                    }
                ],
            }

            # Format as SSE
            import json
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
        import json
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
    """
    return {
        "object": "list",
        "data": [
            {
                "id": "current-model",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "mlx-worker",
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
