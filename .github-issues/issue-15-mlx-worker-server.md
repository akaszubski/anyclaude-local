## Summary

Create the MLX worker node server that runs on each Mac in the cluster.

## Background

Each Mac in the cluster needs to run a server that handles inference requests, manages KV cache, and reports health status.

## Requirements

### Endpoints

- GET /v1/models - List available models (OpenAI compatible)
- POST /v1/chat/completions - Inference with streaming (OpenAI compatible)
- GET /v1/cluster/health - Health status for coordinator
- GET /v1/cluster/cache - Current KV cache state
- POST /v1/cluster/cache/warm - Pre-warm cache with system prompt

### MLX Integration

- Load model using mlx-lm
- Enable prompt caching
- PagedAttention for memory efficiency (if available)
- Report cache state to coordinator

### Cache Management

Track and report:

- System prompt hash and token count
- Tools hash and token count
- Cache capacity and usage
- Cache hit rate

### Configuration

- --port: Server port (default 8081)
- --model: Model to load
- --max-cache-size: Maximum KV cache size in GB

## File Location

New directory: src/mlx-worker/

- server.py - Main FastAPI/Starlette server
- inference.py - MLX inference logic
- cache.py - KV cache management
- health.py - Health reporting

## Language

Python (MLX is Python-native)

## Dependencies

- mlx >= 0.30.1
- mlx-lm >= 0.30.0
- fastapi or starlette
- uvicorn

## Acceptance Criteria

- [ ] OpenAI-compatible /v1/chat/completions
- [ ] Streaming responses work correctly
- [ ] Cache state reported accurately
- [ ] Health endpoint returns valid status
- [ ] Cache warmup populates KV cache
- [ ] Graceful shutdown
- [ ] Configurable via CLI args
- [ ] Integration tests with TypeScript proxy

## Labels

phase-2, cluster, mlx, python, worker
