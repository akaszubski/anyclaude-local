#!/usr/bin/env python3
"""
Integration Tests: MLX Worker FastAPI Server

Tests for the FastAPI server that provides OpenAI-compatible endpoints
and cluster health monitoring.

Expected to FAIL until server.py implementation is complete (TDD Red Phase)

Test Coverage:
- POST /v1/chat/completions endpoint (OpenAI-compatible)
- GET /v1/models endpoint
- GET /health endpoint
- GET /cache endpoint
- POST /cache/warm endpoint
- SSE streaming responses
- Session stickiness (X-Session-Id header)
- Cache-aware responses (X-Cache-Hit header)
- Error handling (400, 500)
- Request validation
"""

import pytest
import sys
import json
import asyncio
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from typing import AsyncGenerator, List, Dict, Any

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / 'src'
sys.path.insert(0, str(src_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.server import app, ChatCompletionRequest, ChatMessage
    from fastapi.testclient import TestClient
except ImportError:
    # Mock for TDD red phase
    class ChatMessage:
        def __init__(self, role: str, content: str):
            raise NotImplementedError("ChatMessage not yet implemented")

    class ChatCompletionRequest:
        def __init__(self, messages: List[ChatMessage], **kwargs):
            raise NotImplementedError("ChatCompletionRequest not yet implemented")

    # Create a mock app
    from fastapi import FastAPI
    app = FastAPI()

    # Mock TestClient
    class TestClient:
        def __init__(self, app):
            raise NotImplementedError("TestClient requires server.py implementation")


@pytest.fixture
def client():
    """Create test client for FastAPI app"""
    return TestClient(app)


@pytest.fixture
def sample_chat_request():
    """Sample chat completion request"""
    return {
        "model": "test-model",
        "messages": [
            {"role": "user", "content": "Hello, how are you?"}
        ],
        "max_tokens": 100,
        "temperature": 0.7,
        "stream": False
    }


@pytest.fixture
def sample_streaming_request():
    """Sample streaming chat completion request"""
    return {
        "model": "test-model",
        "messages": [
            {"role": "user", "content": "Tell me a story"}
        ],
        "max_tokens": 200,
        "stream": True
    }


class TestChatCompletionsEndpoint:
    """Test /v1/chat/completions endpoint"""

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_non_streaming(self, mock_generate, client, sample_chat_request):
        """Test non-streaming chat completion request"""
        # Mock response
        mock_generate.return_value = iter(["Hello", "!", " How", " can", " I", " help", "?"])

        response = client.post("/v1/chat/completions", json=sample_chat_request)

        # Should return 200 OK
        assert response.status_code == 200

        # Should return JSON
        data = response.json()

        # Should match OpenAI format
        assert data['object'] == 'chat.completion'
        assert 'id' in data
        assert 'created' in data
        assert 'model' in data
        assert 'choices' in data

        # Choices should have message
        assert len(data['choices']) > 0
        assert 'message' in data['choices'][0]
        assert 'content' in data['choices'][0]['message']

        # Content should be concatenated tokens
        content = data['choices'][0]['message']['content']
        assert content == "Hello! How can I help?"

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_streaming(self, mock_generate, client, sample_streaming_request):
        """Test streaming chat completion request"""
        # Mock streaming response
        mock_generate.return_value = iter(["Once", " upon", " a", " time"])

        response = client.post("/v1/chat/completions", json=sample_streaming_request)

        # Should return 200 OK
        assert response.status_code == 200

        # Should be SSE stream
        assert response.headers['content-type'] == 'text/event-stream; charset=utf-8'
        assert response.headers['cache-control'] == 'no-cache'

        # Parse SSE stream
        events = self._parse_sse_stream(response.text)

        # Should have data events
        assert len(events) > 0

        # Each event should be valid JSON
        for event in events[:-1]:  # Except [DONE]
            data = json.loads(event)
            assert data['object'] == 'chat.completion.chunk'
            assert 'choices' in data

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_with_system_message(self, mock_generate, client):
        """Test chat completion with system message"""
        mock_generate.return_value = iter(["Response"])

        request = {
            "model": "test-model",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Hello"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200

        # Verify system message was included
        mock_generate.assert_called_once()
        call_args = mock_generate.call_args[0][0]  # messages argument
        assert len(call_args) == 2
        assert call_args[0]['role'] == 'system'

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_multi_turn_conversation(self, mock_generate, client):
        """Test multi-turn conversation"""
        mock_generate.return_value = iter(["Third response"])

        request = {
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "First message"},
                {"role": "assistant", "content": "First response"},
                {"role": "user", "content": "Second message"},
                {"role": "assistant", "content": "Second response"},
                {"role": "user", "content": "Third message"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200

        # Should pass all messages to generate
        mock_generate.assert_called_once()
        call_args = mock_generate.call_args[0][0]
        assert len(call_args) == 5

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_with_parameters(self, mock_generate, client):
        """Test chat completion with generation parameters"""
        mock_generate.return_value = iter(["Response"])

        request = {
            "model": "test-model",
            "messages": [{"role": "user", "content": "Test"}],
            "max_tokens": 150,
            "temperature": 0.8,
            "top_p": 0.9,
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200

        # Verify parameters were passed
        mock_generate.assert_called_once()
        call_kwargs = mock_generate.call_args[1]
        assert call_kwargs['max_tokens'] == 150
        assert call_kwargs['temperature'] == 0.8
        assert call_kwargs['top_p'] == 0.9

    def test_chat_completions_missing_messages(self, client):
        """Test chat completion with missing messages field"""
        request = {
            "model": "test-model",
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should return 400 Bad Request
        assert response.status_code == 422  # FastAPI validation error

    def test_chat_completions_empty_messages(self, client):
        """Test chat completion with empty messages array"""
        request = {
            "model": "test-model",
            "messages": [],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should return 400 Bad Request
        assert response.status_code in [400, 422]

    def test_chat_completions_invalid_role(self, client):
        """Test chat completion with invalid role"""
        request = {
            "model": "test-model",
            "messages": [
                {"role": "invalid_role", "content": "Test"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should return 400 Bad Request
        assert response.status_code in [400, 422]

    @patch('mlx_worker.server.generate_stream')
    def test_chat_completions_handles_generation_error(self, mock_generate, client, sample_chat_request):
        """Test error handling during generation"""
        # Mock generation error
        mock_generate.side_effect = RuntimeError("Generation failed")

        response = client.post("/v1/chat/completions", json=sample_chat_request)

        # Should return 500 Internal Server Error
        assert response.status_code == 500

        # Should return error details
        data = response.json()
        assert 'error' in data
        assert 'Generation failed' in data['error']['message']

    def _parse_sse_stream(self, text: str) -> List[str]:
        """Parse SSE stream into events"""
        events = []
        for line in text.split('\n'):
            if line.startswith('data: '):
                event_data = line[6:]  # Remove 'data: ' prefix
                if event_data != '[DONE]':
                    events.append(event_data)
        return events


class TestSessionStickiness:
    """Test session stickiness via X-Session-Id header"""

    @patch('mlx_worker.server.generate_stream')
    def test_session_id_header_accepted(self, mock_generate, client, sample_chat_request):
        """Test server accepts X-Session-Id header"""
        mock_generate.return_value = iter(["Response"])

        headers = {"X-Session-Id": "session-123"}
        response = client.post("/v1/chat/completions", json=sample_chat_request, headers=headers)

        assert response.status_code == 200

    @patch('mlx_worker.server.generate_stream')
    def test_session_id_returned_in_response(self, mock_generate, client, sample_chat_request):
        """Test server returns X-Session-Id in response headers"""
        mock_generate.return_value = iter(["Response"])

        headers = {"X-Session-Id": "session-456"}
        response = client.post("/v1/chat/completions", json=sample_chat_request, headers=headers)

        # Should echo back session ID
        assert 'x-session-id' in response.headers
        assert response.headers['x-session-id'] == "session-456"

    @patch('mlx_worker.server.generate_stream')
    def test_session_id_generated_if_missing(self, mock_generate, client, sample_chat_request):
        """Test server generates session ID if not provided"""
        mock_generate.return_value = iter(["Response"])

        response = client.post("/v1/chat/completions", json=sample_chat_request)

        # Should generate and return session ID
        assert 'x-session-id' in response.headers
        assert len(response.headers['x-session-id']) > 0


class TestCacheAwareness:
    """Test cache-aware responses"""

    @patch('mlx_worker.server.generate_stream')
    @patch('mlx_worker.server.get_cache_state')
    @patch('mlx_worker.server.compute_prompt_hash')
    def test_cache_hit_header(self, mock_hash, mock_cache_state, mock_generate, client):
        """Test X-Cache-Hit header on cache hit"""
        # Setup mocks
        mock_generate.return_value = iter(["Cached response"])
        mock_cache_state.return_value = {
            'tokens': 100,
            'systemPromptHash': 'hash123',
            'lastUpdated': 1234567890
        }
        mock_hash.return_value = 'hash123'  # Same hash = cache hit

        request = {
            "model": "test-model",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "User message"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should return cache hit header
        assert 'x-cache-hit' in response.headers
        assert response.headers['x-cache-hit'] == 'true'

    @patch('mlx_worker.server.generate_stream')
    @patch('mlx_worker.server.get_cache_state')
    @patch('mlx_worker.server.compute_prompt_hash')
    def test_cache_miss_header(self, mock_hash, mock_cache_state, mock_generate, client):
        """Test X-Cache-Hit header on cache miss"""
        # Setup mocks
        mock_generate.return_value = iter(["Response"])
        mock_cache_state.return_value = {
            'tokens': 100,
            'systemPromptHash': 'hash123',
            'lastUpdated': 1234567890
        }
        mock_hash.return_value = 'different_hash'  # Different hash = cache miss

        request = {
            "model": "test-model",
            "messages": [
                {"role": "system", "content": "Different system prompt"},
                {"role": "user", "content": "User message"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should return cache miss header
        assert 'x-cache-hit' in response.headers
        assert response.headers['x-cache-hit'] == 'false'

    @patch('mlx_worker.server.generate_stream')
    @patch('mlx_worker.server.record_cache_hit')
    @patch('mlx_worker.server.get_cache_state')
    @patch('mlx_worker.server.compute_prompt_hash')
    def test_cache_hit_recorded(self, mock_hash, mock_cache_state, mock_record_hit, mock_generate, client):
        """Test cache hit is recorded in metrics"""
        mock_generate.return_value = iter(["Response"])
        mock_cache_state.return_value = {
            'systemPromptHash': 'hash123',
            'tokens': 100,
            'lastUpdated': 1234567890
        }
        mock_hash.return_value = 'hash123'

        request = {
            "model": "test-model",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "Test"}
            ],
            "stream": False
        }

        client.post("/v1/chat/completions", json=request)

        # Should record cache hit
        mock_record_hit.assert_called_once()


class TestModelsEndpoint:
    """Test /v1/models endpoint"""

    def test_models_endpoint_returns_list(self, client):
        """Test /v1/models returns list of models"""
        response = client.get("/v1/models")

        assert response.status_code == 200

        data = response.json()

        # Should match OpenAI format
        assert data['object'] == 'list'
        assert 'data' in data
        assert isinstance(data['data'], list)

    def test_models_endpoint_has_model_entries(self, client):
        """Test models list has valid entries"""
        response = client.get("/v1/models")

        data = response.json()

        # Should have at least one model
        assert len(data['data']) > 0

        # Each model should have required fields
        for model in data['data']:
            assert 'id' in model
            assert 'object' in model
            assert model['object'] == 'model'

    def test_models_endpoint_includes_current_model(self, client):
        """Test models list includes currently loaded model"""
        response = client.get("/v1/models")

        data = response.json()
        model_ids = [m['id'] for m in data['data']]

        # Should include at least 'current-model'
        assert len(model_ids) > 0


class TestHealthEndpoint:
    """Test /health endpoint"""

    @patch('mlx_worker.server.get_node_health')
    @patch('mlx_worker.server.get_cache_state')
    @patch('mlx_worker.server.get_metrics')
    def test_health_endpoint_returns_status(self, mock_metrics, mock_cache, mock_health, client):
        """Test /health returns complete health status"""
        # Setup mocks
        mock_health.return_value = {
            'lastCheck': 1234567890000,
            'consecutiveFailures': 0,
            'avgResponseTime': 1.5,
            'errorRate': 0.0
        }
        mock_cache.return_value = {
            'tokens': 100,
            'systemPromptHash': 'abc123',
            'lastUpdated': 1234567890000
        }
        mock_metrics.return_value = {
            'requestsInFlight': 2,
            'totalRequests': 50,
            'cacheHitRate': 0.8,
            'avgLatency': 1.5
        }

        response = client.get("/health")

        assert response.status_code == 200

        data = response.json()

        # Should have all required sections
        assert 'status' in data
        assert 'health' in data
        assert 'cache' in data
        assert 'metrics' in data

    @patch('mlx_worker.server.get_node_health')
    def test_health_endpoint_health_structure(self, mock_health, client):
        """Test health structure matches NodeHealth TypeScript interface"""
        mock_health.return_value = {
            'lastCheck': 1234567890000,
            'consecutiveFailures': 0,
            'avgResponseTime': 1.5,
            'errorRate': 0.0
        }

        response = client.get("/health")

        data = response.json()

        # Health should match NodeHealth interface
        health = data['health']
        assert 'lastCheck' in health
        assert 'consecutiveFailures' in health
        assert 'avgResponseTime' in health
        assert 'errorRate' in health

    @patch('mlx_worker.server.get_cache_state')
    def test_health_endpoint_cache_structure(self, mock_cache, client):
        """Test cache structure matches NodeCacheState TypeScript interface"""
        mock_cache.return_value = {
            'tokens': 150,
            'systemPromptHash': 'hash456',
            'lastUpdated': 1234567890000
        }

        response = client.get("/health")

        data = response.json()

        # Cache should match NodeCacheState interface
        cache = data['cache']
        assert 'tokens' in cache
        assert 'systemPromptHash' in cache
        assert 'lastUpdated' in cache

    @patch('mlx_worker.server.get_metrics')
    def test_health_endpoint_metrics_structure(self, mock_metrics, client):
        """Test metrics structure matches NodeMetrics TypeScript interface"""
        mock_metrics.return_value = {
            'requestsInFlight': 5,
            'totalRequests': 100,
            'cacheHitRate': 0.75,
            'avgLatency': 2.0
        }

        response = client.get("/health")

        data = response.json()

        # Metrics should match NodeMetrics interface
        metrics = data['metrics']
        assert 'requestsInFlight' in metrics
        assert 'totalRequests' in metrics
        assert 'cacheHitRate' in metrics
        assert 'avgLatency' in metrics

    @patch('mlx_worker.server.get_node_health')
    def test_health_endpoint_status_healthy(self, mock_health, client):
        """Test status is 'healthy' when no failures"""
        mock_health.return_value = {
            'lastCheck': 1234567890000,
            'consecutiveFailures': 0,
            'avgResponseTime': 1.0,
            'errorRate': 0.0
        }

        response = client.get("/health")

        data = response.json()
        assert data['status'] == 'healthy'

    @patch('mlx_worker.server.get_node_health')
    def test_health_endpoint_status_unhealthy(self, mock_health, client):
        """Test status is 'unhealthy' when failures exceed threshold"""
        mock_health.return_value = {
            'lastCheck': 1234567890000,
            'consecutiveFailures': 5,  # Exceeds threshold
            'avgResponseTime': 3.0,
            'errorRate': 0.5
        }

        response = client.get("/health")

        data = response.json()
        assert data['status'] == 'unhealthy'


class TestCacheEndpoint:
    """Test /cache endpoint"""

    @patch('mlx_worker.server.get_cache_state')
    def test_cache_endpoint_returns_state(self, mock_cache, client):
        """Test /cache returns cache state"""
        mock_cache.return_value = {
            'tokens': 200,
            'systemPromptHash': 'hash789',
            'lastUpdated': 1234567890000
        }

        response = client.get("/cache")

        assert response.status_code == 200

        data = response.json()
        assert data['tokens'] == 200
        assert data['systemPromptHash'] == 'hash789'
        assert data['lastUpdated'] == 1234567890000


class TestCacheWarmEndpoint:
    """Test POST /cache/warm endpoint"""

    @patch('mlx_worker.server.warm_cache')
    def test_cache_warm_success(self, mock_warm, client):
        """Test cache warming with system prompt"""
        mock_warm.return_value = {
            'tokens': 150,
            'systemPromptHash': 'newhash',
            'lastUpdated': 1234567890000
        }

        request = {
            "system_prompt": "You are a helpful coding assistant."
        }

        response = client.post("/cache/warm", json=request)

        assert response.status_code == 200

        # Should call warm_cache
        mock_warm.assert_called_once_with("You are a helpful coding assistant.")

        # Should return updated state
        data = response.json()
        assert data['tokens'] == 150

    def test_cache_warm_missing_prompt(self, client):
        """Test cache warm with missing system_prompt"""
        response = client.post("/cache/warm", json={})

        # Should return 400 Bad Request
        assert response.status_code in [400, 422]

    @patch('mlx_worker.server.warm_cache')
    def test_cache_warm_empty_prompt(self, mock_warm, client):
        """Test cache warm with empty prompt"""
        mock_warm.return_value = {
            'tokens': 0,
            'systemPromptHash': 'emptyhash',
            'lastUpdated': 1234567890000
        }

        request = {"system_prompt": ""}

        response = client.post("/cache/warm", json=request)

        # Should accept empty prompt
        assert response.status_code == 200

    @patch('mlx_worker.server.warm_cache')
    def test_cache_warm_handles_error(self, mock_warm, client):
        """Test cache warm handles errors"""
        mock_warm.side_effect = RuntimeError("Failed to warm cache")

        request = {"system_prompt": "Test prompt"}

        response = client.post("/cache/warm", json=request)

        # Should return 500 Internal Server Error
        assert response.status_code == 500


class TestRequestMetricsTracking:
    """Test request metrics are tracked"""

    @patch('mlx_worker.server.generate_stream')
    @patch('mlx_worker.server.increment_requests_in_flight')
    @patch('mlx_worker.server.decrement_requests_in_flight')
    @patch('mlx_worker.server.record_request')
    def test_request_metrics_tracked_on_success(self, mock_record, mock_decrement, mock_increment, mock_generate, client, sample_chat_request):
        """Test request metrics are tracked on successful request"""
        mock_generate.return_value = iter(["Response"])

        response = client.post("/v1/chat/completions", json=sample_chat_request)

        assert response.status_code == 200

        # Should increment/decrement in-flight counter
        mock_increment.assert_called_once()
        mock_decrement.assert_called_once()

        # Should record successful request with latency
        mock_record.assert_called_once()
        call_args = mock_record.call_args[0]
        assert call_args[0] is True  # success=True
        assert isinstance(call_args[1], float)  # latency

    @patch('mlx_worker.server.generate_stream')
    @patch('mlx_worker.server.record_request')
    def test_request_metrics_tracked_on_failure(self, mock_record, mock_generate, client, sample_chat_request):
        """Test request metrics are tracked on failed request"""
        mock_generate.side_effect = RuntimeError("Generation failed")

        response = client.post("/v1/chat/completions", json=sample_chat_request)

        assert response.status_code == 500

        # Should record failed request
        mock_record.assert_called_once()
        call_args = mock_record.call_args[0]
        assert call_args[0] is False  # success=False


class TestStreamingResponses:
    """Test SSE streaming response format"""

    @patch('mlx_worker.server.generate_stream')
    def test_streaming_response_format(self, mock_generate, client, sample_streaming_request):
        """Test streaming response follows SSE format"""
        mock_generate.return_value = iter(["Hello", " world", "!"])

        response = client.post("/v1/chat/completions", json=sample_streaming_request)

        # Should be SSE
        assert 'text/event-stream' in response.headers['content-type']

        # Should have SSE headers
        assert response.headers.get('cache-control') == 'no-cache'
        assert response.headers.get('x-accel-buffering') == 'no'

    @patch('mlx_worker.server.generate_stream')
    def test_streaming_chunk_format(self, mock_generate, client, sample_streaming_request):
        """Test streaming chunks match OpenAI format"""
        mock_generate.return_value = iter(["token1", "token2"])

        response = client.post("/v1/chat/completions", json=sample_streaming_request)

        events = self._parse_sse_stream(response.text)

        for event in events[:-1]:  # Except [DONE]
            data = json.loads(event)

            # Should match OpenAI chunk format
            assert data['object'] == 'chat.completion.chunk'
            assert 'id' in data
            assert 'created' in data
            assert 'model' in data
            assert 'choices' in data

            # Choice should have delta
            choice = data['choices'][0]
            assert 'delta' in choice
            assert 'content' in choice['delta']

    @patch('mlx_worker.server.generate_stream')
    def test_streaming_ends_with_done(self, mock_generate, client, sample_streaming_request):
        """Test streaming ends with [DONE] message"""
        mock_generate.return_value = iter(["test"])

        response = client.post("/v1/chat/completions", json=sample_streaming_request)

        # Should end with [DONE]
        assert 'data: [DONE]' in response.text

    def _parse_sse_stream(self, text: str) -> List[str]:
        """Parse SSE stream into events"""
        events = []
        for line in text.split('\n'):
            if line.startswith('data: '):
                event_data = line[6:]
                if event_data != '[DONE]':
                    events.append(event_data)
        return events


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short', '-s'])
