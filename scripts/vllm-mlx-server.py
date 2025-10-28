#!/usr/bin/env python3
"""
Minimal vLLM-MLX Server: OpenAI-compatible inference server
Built on MLX for Apple Silicon
"""

import json
import asyncio
import logging
import sys
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

# MLX imports
try:
    import mlx_lm
    print("✓ MLX LM available")
    HAS_MLX = True
except Exception as e:
    print(f"Warning: MLX LM not available: {e}")
    HAS_MLX = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vllm-mlx")


class VLLMMLXServer:
    def __init__(self, model_path: str, port: int = 8081, host: str = "0.0.0.0"):
        self.model_path = model_path
        self.port = port
        self.host = host
        self.model = None
        self.tokenizer = None
        self.app = FastAPI(title="vLLM-MLX")
        self._setup_routes()

    def _setup_routes(self):
        @self.app.post("/v1/chat/completions")
        async def chat_completions(request: Request):
            try:
                body = await request.json()
                messages = body.get("messages", [])
                stream = body.get("stream", False)
                max_tokens = body.get("max_tokens", 512)

                # Build prompt
                prompt = ""
                for msg in messages:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    if role == "system":
                        prompt = f"{content}\n\n"
                    else:
                        prompt += f"{role}: {content}\n"

                if stream:
                    return StreamingResponse(
                        self._stream_generate(prompt, max_tokens),
                        media_type="text/event-stream"
                    )
                else:
                    response = await self._generate_response(prompt, max_tokens)
                    return JSONResponse(response)
            except Exception as e:
                logger.error(f"Error: {e}")
                return JSONResponse({"error": str(e)}, status_code=500)

        @self.app.get("/v1/models")
        async def list_models():
            return {
                "object": "list",
                "data": [{"id": Path(self.model_path).name, "object": "model"}]
            }

        @self.app.get("/health")
        async def health():
            return {
                "status": "healthy",
                "model_loaded": self.model is not None
            }

    async def load_model(self):
        if not HAS_MLX:
            logger.warning("MLX not available, running in demo mode")
            return True

        try:
            logger.info(f"Loading model: {self.model_path}")
            self.model, self.tokenizer = mlx_lm.load(self.model_path)
            logger.info(f"Model loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False

    async def _stream_generate(self, prompt: str, max_tokens: int):
        try:
            yield f'data: {{"choices":[{{"delta":{{"content":""}}}}]}}\n\n'

            if HAS_MLX and self.model:
                try:
                    text = mlx_lm.generate(
                        self.model,
                        self.tokenizer,
                        prompt,
                        max_tokens=max_tokens,
                        verbose=False
                    )
                    for char in str(text):
                        yield f'data: {{"choices":[{{"delta":{{"content":"{json.dumps(char)[1:-1]}"}}}}]}}\n\n'
                except Exception as e:
                    logger.warning(f"Generation failed: {e}")
                    text = "I received your message"
                    for char in text:
                        yield f'data: {{"choices":[{{"delta":{{"content":"{json.dumps(char)[1:-1]}"}}}}]}}\n\n'
            else:
                text = "Demo mode - no model loaded"
                for char in text:
                    yield f'data: {{"choices":[{{"delta":{{"content":"{json.dumps(char)[1:-1]}"}}}}]}}\n\n'

            yield 'data: [DONE]\n\n'
        except Exception as e:
            logger.error(f"Stream error: {e}")

    async def _generate_response(self, prompt: str, max_tokens: int) -> dict:
        try:
            if HAS_MLX and self.model:
                text = mlx_lm.generate(
                    self.model,
                    self.tokenizer,
                    prompt,
                    max_tokens=max_tokens,
                    verbose=False
                )
            else:
                text = "Demo mode response"

            return {
                "object": "text_completion",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": str(text)
                    },
                    "finish_reason": "stop"
                }]
            }
        except Exception as e:
            logger.error(f"Generation error: {e}")
            return {"error": str(e)}

    def run(self):
        logger.info(f"Starting server on {self.host}:{self.port}")
        asyncio.run(self.load_model())
        uvicorn.run(self.app, host=self.host, port=self.port)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="vLLM-MLX Server")
    parser.add_argument("--model", required=True, help="Path to MLX model")
    parser.add_argument("--port", type=int, default=8081, help="Port")
    parser.add_argument("--host", default="0.0.0.0", help="Host")

    args = parser.parse_args()

    if not Path(args.model).exists():
        print(f"Error: Model not found: {args.model}")
        sys.exit(1)

    server = VLLMMLXServer(args.model, args.port, args.host)
    server.run()
