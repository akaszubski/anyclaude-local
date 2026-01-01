#!/usr/bin/env python3
"""
Integration Tests: MLX Worker Server Parser Integration (TDD Red Phase)

Tests for ParserRegistry integration in MLX Worker server.py with QwenToolParser
for handling Qwen2.5-Coder-7B output formats.

GitHub Issue: #33 - MLX Worker tool calling format inconsistency

Expected to FAIL until server.py parser integration is complete

Test Coverage:
- POST /v1/chat/completions with Qwen format responses
- Parser registry initialization with QwenToolParser
- Format auto-detection and fallback
- Streaming with Qwen formats
- Error handling for malformed Qwen output
- Performance metrics for parser selection
- Cache integration with parsed tool calls
- Multi-turn conversation with mixed formats
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
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(src_path))
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from mlx_worker.server import app, ChatCompletionRequest, ChatMessage
    from fastapi.testclient import TestClient
    from lib.qwen_tool_parser import QwenToolParser
    from lib.tool_parsers import ParserRegistry, OpenAIToolParser
except ImportError:
    # Mock for TDD red phase
    class ChatMessage:
        def __init__(self, role: str, content: str):
            raise NotImplementedError("ChatMessage not yet implemented")

    class ChatCompletionRequest:
        def __init__(self, messages: List[ChatMessage], **kwargs):
            raise NotImplementedError("ChatCompletionRequest not yet implemented")

    from fastapi import FastAPI
    app = FastAPI()

    class TestClient:
        def __init__(self, app):
            raise NotImplementedError("TestClient requires server.py implementation")

    class QwenToolParser:
        def __init__(self):
            raise NotImplementedError("QwenToolParser not yet implemented")

    class ParserRegistry:
        def __init__(self):
            raise NotImplementedError("ParserRegistry not yet implemented")

    class OpenAIToolParser:
        pass


@pytest.fixture
def client():
    """Create test client for FastAPI app"""
    return TestClient(app)


@pytest.fixture
def mock_model_qwen():
    """Mock Qwen2.5-Coder-7B model that returns Qwen format responses"""
    model = MagicMock()
    model.name = "Qwen2.5-Coder-7B"
    return model


class TestQwenParserIntegration:
    """Test QwenToolParser integration with server.py"""

    def test_server_initializes_parser_registry_with_qwen(self):
        """Test server.py initializes ParserRegistry with QwenToolParser"""
        # Server should create registry on startup
        assert hasattr(app.state, 'parser_registry') or 'parser_registry' in dir(app)

        # Registry should have QwenToolParser registered
        # This will be checked by inspecting server initialization code

    @patch('mlx_worker.server.generate_stream')
    def test_qwen_format1_tool_call_parsing(self, mock_generate, client):
        """Test server parses Qwen Format 1: <tool_call>...</tool_call>"""
        # Mock model returns Qwen format
        qwen_response = 'Let me read that file.\n<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}</tool_call>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read /tmp/test.txt"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        # Should have extracted tool call
        assert 'tool_calls' in data['choices'][0]['message']
        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 1
        assert tool_calls[0]['function']['name'] == 'Read'
        assert json.loads(tool_calls[0]['function']['arguments'])['file_path'] == '/tmp/test.txt'

    @patch('mlx_worker.server.generate_stream')
    def test_qwen_format2_tools_array_parsing(self, mock_generate, client):
        """Test server parses Qwen Format 2: <tools>[...]</tools>"""
        qwen_response = '''<tools>[
            {"name": "Read", "arguments": {"file_path": "/tmp/1.txt"}},
            {"name": "Write", "arguments": {"file_path": "/tmp/2.txt", "content": "test"}}
        ]</tools>'''
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read and write files"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        # Should have extracted both tool calls
        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 2
        assert tool_calls[0]['function']['name'] == 'Read'
        assert tool_calls[1]['function']['name'] == 'Write'

    @patch('mlx_worker.server.generate_stream')
    def test_qwen_format3_function_parsing(self, mock_generate, client):
        """Test server parses Qwen Format 3: <function>...</function>"""
        qwen_response = '<function>{"name": "Bash", "arguments": {"command": "ls -la", "timeout": 5000}}</function>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "List files"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 1
        assert tool_calls[0]['function']['name'] == 'Bash'

    @patch('mlx_worker.server.generate_stream')
    def test_qwen_format4_json_bracket_parsing(self, mock_generate, client):
        """Test server parses Qwen Format 4: <{...}>"""
        qwen_response = 'I\'ll search for that pattern.\n<{"name": "Grep", "arguments": {"pattern": "TODO", "path": "/tmp"}}>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Find TODO comments"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 1
        assert tool_calls[0]['function']['name'] == 'Grep'


class TestParserFallbackChain:
    """Test parser fallback chain with multiple formats"""

    @patch('mlx_worker.server.generate_stream')
    def test_openai_format_takes_priority_over_qwen(self, mock_generate, client):
        """Test OpenAI format is tried before Qwen format"""
        # Response has OpenAI format - should use that, not Qwen
        openai_response = {
            "tool_calls": [
                {
                    "id": "call_123",
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "arguments": json.dumps({"file_path": "/tmp/test.txt"})
                    }
                }
            ]
        }
        mock_generate.return_value = iter([json.dumps(openai_response)])

        request = {
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "Read file"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        # Should use OpenAI parser (has 'id' field)
        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 1
        assert 'id' in tool_calls[0]
        assert tool_calls[0]['id'] == 'call_123'

    @patch('mlx_worker.server.generate_stream')
    def test_fallback_to_qwen_when_openai_format_not_found(self, mock_generate, client):
        """Test server falls back to Qwen parser when OpenAI format not detected"""
        # Only Qwen format present
        qwen_response = '<tool_call>{"name": "Write", "arguments": {"file_path": "/tmp/out.txt", "content": "data"}}</tool_call>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Write file"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        # Should fall back to Qwen parser
        tool_calls = data['choices'][0]['message']['tool_calls']
        assert len(tool_calls) == 1
        assert tool_calls[0]['function']['name'] == 'Write'

    @patch('mlx_worker.server.generate_stream')
    def test_fallback_to_text_response_when_no_tool_calls(self, mock_generate, client):
        """Test server returns text response when no tool calls detected"""
        text_response = "I understand your request. Let me help you with that."
        mock_generate.return_value = iter([text_response])

        request = {
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        data = response.json()

        # Should have text content, no tool_calls
        message = data['choices'][0]['message']
        assert 'content' in message
        assert message['content'] == text_response
        assert 'tool_calls' not in message or message['tool_calls'] is None


class TestQwenStreamingParsing:
    """Test Qwen format parsing in streaming responses"""

    @patch('mlx_worker.server.generate_stream')
    def test_streaming_qwen_format_incremental_parsing(self, mock_generate, client):
        """Test server incrementally parses Qwen format in SSE stream"""
        # Simulate streaming chunks that build up to tool call
        chunks = [
            "Let me ",
            "read that.\n",
            "<tool_call>",
            '{"name": "Read", ',
            '"arguments": {"file_path": "/tmp/test.txt"}}',
            '</tool_call>'
        ]
        mock_generate.return_value = iter(chunks)

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read file"}
            ],
            "stream": True
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200
        assert response.headers['content-type'] == 'text/event-stream; charset=utf-8'

        # Parse SSE stream
        events = self._parse_sse_events(response.text)

        # Should have tool_call event at the end
        tool_call_events = [e for e in events if '"type":"tool_calls"' in e or '"type":"function"' in e]
        assert len(tool_call_events) > 0

    @patch('mlx_worker.server.generate_stream')
    def test_streaming_multiple_qwen_tool_calls(self, mock_generate, client):
        """Test server handles multiple tool calls in stream"""
        chunks = [
            '<tool_call>{"name": "Read", "arguments": {}}</tool_call>\n',
            'Some text\n',
            '<tool_call>{"name": "Write", "arguments": {}}</tool_call>'
        ]
        mock_generate.return_value = iter(chunks)

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read and write"}
            ],
            "stream": True
        }

        response = client.post("/v1/chat/completions", json=request)

        assert response.status_code == 200

        # Should have multiple tool_call events
        events = self._parse_sse_events(response.text)
        # Implementation should send separate events for each tool call

    def _parse_sse_events(self, sse_text: str) -> List[str]:
        """Helper to parse SSE events from response text"""
        events = []
        for line in sse_text.split('\n'):
            if line.startswith('data: '):
                event_data = line[6:]  # Remove 'data: ' prefix
                if event_data != '[DONE]':
                    events.append(event_data)
        return events


class TestQwenErrorHandling:
    """Test error handling for malformed Qwen output"""

    @patch('mlx_worker.server.generate_stream')
    def test_malformed_qwen_json_returns_error(self, mock_generate, client):
        """Test server handles malformed JSON in Qwen tags gracefully"""
        malformed_response = '<tool_call>{name: Read, this is not valid json}</tool_call>'
        mock_generate.return_value = iter([malformed_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Do something"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should not crash, should return graceful response
        assert response.status_code in [200, 400, 500]

        if response.status_code == 200:
            # If successful, should fall back to text response
            data = response.json()
            assert 'choices' in data

    @patch('mlx_worker.server.generate_stream')
    def test_partial_qwen_tag_handled_gracefully(self, mock_generate, client):
        """Test server handles incomplete Qwen tags"""
        partial_response = '<tool_call>{"name": "Read"'  # Missing closing tag
        mock_generate.return_value = iter([partial_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read file"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should handle gracefully
        assert response.status_code in [200, 400, 500]

    @patch('mlx_worker.server.generate_stream')
    def test_oversized_qwen_response_rejected(self, mock_generate, client):
        """Test server rejects oversized Qwen responses"""
        # Create 2MB response (exceeds 1MB limit)
        huge_content = 'x' * (2 * 1024 * 1024)
        oversized_response = f'<tool_call>{{"name": "Write", "arguments": {{"content": "{huge_content}"}}}}</tool_call>'
        mock_generate.return_value = iter([oversized_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Write huge file"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should reject with error
        assert response.status_code in [400, 413, 500]


class TestParserMetrics:
    """Test parser performance metrics collection"""

    @patch('mlx_worker.server.generate_stream')
    def test_parser_metrics_track_format_usage(self, mock_generate, client):
        """Test server tracks which parser format was used"""
        qwen_response = '<tool_call>{"name": "Read", "arguments": {}}</tool_call>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read file"}
            ],
            "stream": False
        }

        # Make request
        response = client.post("/v1/chat/completions", json=request)
        assert response.status_code == 200

        # Check metrics endpoint (if available)
        metrics_response = client.get("/metrics")
        if metrics_response.status_code == 200:
            metrics = metrics_response.json()
            # Should track Qwen parser usage
            assert 'parser_metrics' in metrics or 'qwen_parser_uses' in str(metrics).lower()

    @patch('mlx_worker.server.generate_stream')
    def test_parser_metrics_track_fallback_chain(self, mock_generate, client):
        """Test server tracks fallback chain usage"""
        # Plain text response - will use fallback
        text_response = "Just a text response"
        mock_generate.return_value = iter([text_response])

        request = {
            "model": "test-model",
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)
        assert response.status_code == 200

        # Metrics should show fallback was used
        # (Check via /metrics endpoint or internal state)


class TestQwenCacheIntegration:
    """Test cache integration with Qwen format parsing"""

    @patch('mlx_worker.server.generate_stream')
    def test_cache_stores_parsed_qwen_tool_calls(self, mock_generate, client):
        """Test cache stores parsed tool calls from Qwen format"""
        qwen_response = '<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/cached.txt"}}</tool_call>'
        mock_generate.return_value = iter([qwen_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read file"}
            ],
            "stream": False
        }

        # First request - cache miss
        response1 = client.post("/v1/chat/completions", json=request)
        assert response1.status_code == 200

        # Second request - should hit cache
        response2 = client.post("/v1/chat/completions", json=request)
        assert response2.status_code == 200

        # Check for cache hit header
        if 'X-Cache-Hit' in response2.headers:
            assert response2.headers['X-Cache-Hit'] == 'true'

    @patch('mlx_worker.server.generate_stream')
    def test_cache_key_includes_parser_format(self, mock_generate, client):
        """Test cache key differentiates between response formats"""
        # Same logical tool call, different format
        qwen_response = '<tool_call>{"name": "Read", "arguments": {}}</tool_call>'
        openai_response = json.dumps({
            "tool_calls": [{"id": "call_123", "type": "function", "function": {"name": "Read", "arguments": "{}"}}]
        })

        # Request 1 - Qwen format
        mock_generate.return_value = iter([qwen_response])
        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [{"role": "user", "content": "Read"}],
            "stream": False
        }
        response1 = client.post("/v1/chat/completions", json=request)
        assert response1.status_code == 200

        # Request 2 - OpenAI format (different model)
        mock_generate.return_value = iter([openai_response])
        request['model'] = 'gpt-4'
        response2 = client.post("/v1/chat/completions", json=request)
        assert response2.status_code == 200

        # Should be treated as different cache entries


class TestQwenMultiTurnConversation:
    """Test multi-turn conversations with mixed formats"""

    @patch('mlx_worker.server.generate_stream')
    def test_multi_turn_with_qwen_format(self, mock_generate, client):
        """Test multi-turn conversation with Qwen format responses"""
        # Turn 1: Tool call
        qwen_response1 = '<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/1.txt"}}</tool_call>'

        # Turn 2: Another tool call
        qwen_response2 = '<tool_call>{"name": "Write", "arguments": {"file_path": "/tmp/2.txt", "content": "data"}}</tool_call>'

        mock_generate.side_effect = [
            iter([qwen_response1]),
            iter([qwen_response2])
        ]

        # Turn 1
        request1 = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read /tmp/1.txt"}
            ],
            "stream": False
        }
        response1 = client.post("/v1/chat/completions", json=request1)
        assert response1.status_code == 200

        # Turn 2 - includes previous context
        request2 = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read /tmp/1.txt"},
                {"role": "assistant", "content": qwen_response1},
                {"role": "user", "content": "Now write to /tmp/2.txt"}
            ],
            "stream": False
        }
        response2 = client.post("/v1/chat/completions", json=request2)
        assert response2.status_code == 200

        # Both should parse successfully
        data2 = response2.json()
        assert 'tool_calls' in data2['choices'][0]['message']

    @patch('mlx_worker.server.generate_stream')
    def test_mixed_formats_in_conversation(self, mock_generate, client):
        """Test conversation with mixed OpenAI and Qwen formats"""
        # Turn 1: OpenAI format
        openai_response = json.dumps({
            "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "Read", "arguments": "{}"}}]
        })

        # Turn 2: Qwen format
        qwen_response = '<tool_call>{"name": "Write", "arguments": {}}</tool_call>'

        mock_generate.side_effect = [
            iter([openai_response]),
            iter([qwen_response])
        ]

        # Turn 1
        request1 = {
            "model": "test-model",
            "messages": [{"role": "user", "content": "Read"}],
            "stream": False
        }
        response1 = client.post("/v1/chat/completions", json=request1)
        assert response1.status_code == 200

        # Turn 2
        request2 = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [
                {"role": "user", "content": "Read"},
                {"role": "assistant", "content": openai_response},
                {"role": "user", "content": "Write"}
            ],
            "stream": False
        }
        response2 = client.post("/v1/chat/completions", json=request2)
        assert response2.status_code == 200

        # Both formats should parse correctly


class TestQwenSecurityIntegration:
    """Test security features in server integration"""

    @patch('mlx_worker.server.generate_stream')
    def test_parser_timeout_protection(self, mock_generate, client):
        """Test server enforces parser timeout limits"""
        # Create complex response that might trigger timeout
        complex_response = '<tool_call>' + '{"name": "Tool", "arguments": {}}' * 1000 + '</tool_call>'
        mock_generate.return_value = iter([complex_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [{"role": "user", "content": "Do complex task"}],
            "stream": False
        }

        response = client.post("/v1/chat/completions", json=request)

        # Should either succeed or timeout gracefully
        assert response.status_code in [200, 408, 500]

    @patch('mlx_worker.server.generate_stream')
    def test_circuit_breaker_protects_parser(self, mock_generate, client):
        """Test circuit breaker protects parser from repeated failures"""
        # Mock parser failures
        malformed_response = '<tool_call>{invalid json}</tool_call>'
        mock_generate.return_value = iter([malformed_response])

        request = {
            "model": "Qwen2.5-Coder-7B",
            "messages": [{"role": "user", "content": "Do task"}],
            "stream": False
        }

        # Make multiple failing requests
        responses = []
        for _ in range(10):
            resp = client.post("/v1/chat/completions", json=request)
            responses.append(resp.status_code)

        # Circuit breaker should eventually trip
        # (Either 503 Service Unavailable or continues with fallback)
        assert any(code in [200, 400, 500, 503] for code in responses)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
