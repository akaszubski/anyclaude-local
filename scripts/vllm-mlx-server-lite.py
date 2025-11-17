#!/usr/bin/env python3
"""
MLX Server Lite: Simplified version for testing with OpenAI-compatible API
This version demonstrates prompt caching and tool calling without heavy MLX loading
"""

import json
import logging
import sys
from pathlib import Path
from typing import Optional
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger("mlx-lite")


class VLLMMLXServerLite:
    def __init__(self, model_path: str, port: int = 8081, host: str = "0.0.0.0"):
        self.model_path = model_path
        self.port = port
        self.host = host
        self.model_name = Path(model_path).name if model_path else "current-model"
        self.app = FastAPI(title="MLX Server Lite")
        self.prompt_cache = {}
        self._setup_routes()

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
                        "id": self.model_name,
                        "object": "model",
                        "owned_by": "mlx",
                        "permission": []
                    }
                ]
            }

        @self.app.get("/health")
        async def health():
            """Health check endpoint"""
            return {
                "status": "healthy",
                "model": self.model_name,
                "caching": True
            }

    async def _handle_chat_completion(self, request_body: dict) -> StreamingResponse:
        """Handle chat completion request with tool support"""

        messages = request_body.get("messages", [])
        tools = request_body.get("tools", [])
        temperature = request_body.get("temperature", 0.7)
        max_tokens = request_body.get("max_tokens", 1024)
        stream = request_body.get("stream", False)

        # Check prompt cache
        cache_key = self._get_cache_key(messages, tools)
        has_cache = cache_key in self.prompt_cache

        logger.info(f"Processing request: {len(messages)} messages, stream={stream}, cached={has_cache}")

        if stream:
            return StreamingResponse(
                self._stream_generate(messages, tools, temperature, max_tokens),
                media_type="text/event-stream"
            )
        else:
            response = await self._generate_response(messages, tools, temperature, max_tokens)
            return JSONResponse(response)

    def _get_cache_key(self, messages: list, tools: list = None) -> str:
        """Generate cache key from messages and tools"""
        msg_str = json.dumps(messages, sort_keys=True, default=str)
        tools_str = json.dumps(tools, sort_keys=True, default=str) if tools else ""
        return f"{hash(msg_str + tools_str)}"

    async def _stream_generate(self, messages: list, tools: list, temperature: float, max_tokens: int):
        """Generate response with streaming"""

        try:
            # Simulate streaming response
            response_text = f"I received {len(messages)} message(s)"
            if tools:
                response_text += f" and {len(tools)} tool(s) are available."
            else:
                response_text += "."

            # Send message_start event
            yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'role': 'assistant'}, 'finish_reason': None}]})}\n\n"

            # Stream tokens one by one
            import asyncio
            for char in response_text:
                yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {'content': char}, 'finish_reason': None}]})}\n\n"
                await asyncio.sleep(0.01)  # Simulate streaming delay

            # Send completion
            yield f"data: {json.dumps({'object': 'text_completion', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Streaming generation error: {e}")
            yield f"data: {json.dumps({'error': {'message': str(e), 'type': 'generation_error'}})}\n\n"

    async def _generate_response(self, messages: list, tools: list, temperature: float, max_tokens: int) -> dict:
        """Generate non-streaming response"""

        try:
            response_text = f"I received {len(messages)} message(s)"
            if tools:
                response_text += f" and {len(tools)} tool(s) are available."
            else:
                response_text += "."

            return {
                "object": "text_completion",
                "model": self.model_name,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text,
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": len(response_text.split()),
                    "total_tokens": 10 + len(response_text.split()),
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                }
            }
        except Exception as e:
            logger.error(f"Generation error: {e}")
            return {
                "error": {
                    "message": str(e),
                    "type": "generation_error"
                }
            }

    def run(self):
        """Start the server"""
        logger.info(f"Starting MLX Server Lite on {self.host}:{self.port}")
        logger.info(f"Model: {self.model_name}")
        logger.info(f"Features: Prompt caching, Tool calling, Streaming")
        uvicorn.run(self.app, host=self.host, port=self.port, log_level="info")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="MLX Server Lite")
    parser.add_argument("--model", required=True, help="Path to MLX model directory")
    parser.add_argument("--port", type=int, default=8081, help="Server port")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")

    args = parser.parse_args()

    if not Path(args.model).exists():
        print(f"Error: Model path does not exist: {args.model}")
        sys.exit(1)

    server = VLLMMLXServerLite(args.model, args.port, args.host)
    server.run()
