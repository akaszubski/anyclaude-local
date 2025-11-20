#!/usr/bin/env python3
"""
Integration Tests: Parser Failover + Circuit Breaker

Tests for the complete parser failover system with circuit breaker protection.
Verifies that the system gracefully degrades through parser chain and protects
against cascading failures.

Expected to FAIL until implementation is complete (TDD Red Phase)

Test Coverage:
- OpenAI parser succeeds with valid format
- Fallback to commentary parser when OpenAI fails
- Fallback to text response when all parsers fail
- Circuit breaker protects parser execution
- Circuit breaker opens after repeated failures
- Circuit breaker recovers after timeout
"""

import unittest
import sys
import json
import time
import threading
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Optional, Dict, Any, List

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# These imports will fail until implementation is complete
try:
    from lib.tool_parsers import (
        OpenAIToolParser,
        CommentaryToolParser,
        FallbackParser,
        ParserRegistry
    )
    from lib.circuit_breaker import CircuitBreaker, CircuitBreakerState, CircuitBreakerError
except ImportError:
    # Mock for TDD red phase
    class OpenAIToolParser:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("OpenAIToolParser not yet implemented")

    class CommentaryToolParser:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("CommentaryToolParser not yet implemented")

    class FallbackParser:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("FallbackParser not yet implemented")

    class ParserRegistry:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("ParserRegistry not yet implemented")

    class CircuitBreakerState:
        CLOSED = "CLOSED"
        OPEN = "OPEN"
        HALF_OPEN = "HALF_OPEN"

    class CircuitBreaker:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("CircuitBreaker not yet implemented")

    class CircuitBreakerError(Exception):
        pass


class TestParserFailoverBasic(unittest.TestCase):
    """Test basic parser failover behavior"""

    def setUp(self):
        """Set up test fixtures"""
        self.registry = ParserRegistry()

        # Register parsers in priority order
        self.openai_parser = OpenAIToolParser()
        self.commentary_parser = CommentaryToolParser()
        self.fallback_parser = FallbackParser()

        self.registry.register(self.openai_parser, priority=10)
        self.registry.register(self.commentary_parser, priority=20)
        self.registry.register(self.fallback_parser, priority=30)

    def test_openai_parser_succeeds_with_valid_format(self):
        """Test OpenAI parser successfully parses valid OpenAI format"""
        openai_input = {
            "tool_calls": [
                {
                    "id": "call_abc123",
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "arguments": json.dumps({"file_path": "/tmp/test.txt"})
                    }
                }
            ]
        }

        result = self.registry.parse_with_fallback(json.dumps(openai_input))

        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['function']['name'], 'Read')

        # Verify metrics show OpenAI parser was used
        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['openai_successes'], 1)
        self.assertEqual(metrics['commentary_attempts'], 0)

    def test_fallback_to_commentary_when_openai_invalid(self):
        """Test falls back to commentary parser when OpenAI format invalid"""
        commentary_input = """
        Let me read that file.

        [TOOL_CALL]
        {
            "name": "Read",
            "arguments": {
                "file_path": "/tmp/test.txt"
            }
        }
        [/TOOL_CALL]
        """

        result = self.registry.parse_with_fallback(commentary_input)

        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'Read')

        # Verify metrics show commentary parser was used
        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['openai_attempts'], 1)
        self.assertEqual(metrics['openai_successes'], 0)
        self.assertEqual(metrics['commentary_successes'], 1)

    def test_fallback_to_text_when_all_parsers_fail(self):
        """Test falls back to text response when all parsers fail"""
        text_input = "This is just a plain text response with no tool calls."

        result = self.registry.parse_with_fallback(text_input)

        self.assertIsNotNone(result)
        self.assertEqual(result['type'], 'text')
        self.assertEqual(result['content'], text_input)

        # Verify metrics show fallback parser was used
        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['fallback_successes'], 1)

    def test_parser_chain_order_is_respected(self):
        """Test parsers are tried in priority order"""
        # Create input that could match multiple parsers
        # But should use highest priority (OpenAI) first
        openai_input = json.dumps({
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "arguments": "{}"
                    }
                }
            ]
        })

        result = self.registry.parse_with_fallback(openai_input)

        # Should use OpenAI parser (priority 10)
        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['openai_successes'], 1)


class TestParserFailoverWithCircuitBreaker(unittest.TestCase):
    """Test parser failover with circuit breaker protection"""

    def setUp(self):
        """Set up test fixtures"""
        # Create registry with circuit breaker protection
        self.breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=2,  # 2 seconds for testing
            success_threshold=2
        )

        self.registry = ParserRegistry(circuit_breaker=self.breaker)

        # Register parsers
        self.openai_parser = OpenAIToolParser()
        self.commentary_parser = CommentaryToolParser()
        self.fallback_parser = FallbackParser()

        self.registry.register(self.openai_parser, priority=10)
        self.registry.register(self.commentary_parser, priority=20)
        self.registry.register(self.fallback_parser, priority=30)

    def test_circuit_breaker_protects_parser_execution(self):
        """Test circuit breaker wraps parser execution"""
        openai_input = json.dumps({
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"}
                }
            ]
        })

        # Parse should succeed
        result = self.registry.parse_with_fallback(openai_input)
        self.assertIsNotNone(result)

        # Circuit should still be CLOSED
        self.assertEqual(self.breaker.state, CircuitBreakerState.CLOSED)

    def test_circuit_breaker_opens_after_repeated_failures(self):
        """Test circuit breaker opens after repeated parser failures"""
        # Create a mock parser that always fails
        failing_parser = Mock()
        failing_parser.can_parse.return_value = True
        failing_parser.parse.side_effect = Exception("Parser explosion!")

        # Create new registry with failing parser
        registry = ParserRegistry(circuit_breaker=self.breaker)
        registry.register(failing_parser, priority=5)  # Higher priority than others

        # Trigger failures
        for i in range(3):
            with self.assertRaises(Exception):
                registry.parse_with_fallback("trigger failure")

        # Circuit should be OPEN
        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)

    def test_circuit_breaker_rejects_when_open(self):
        """Test circuit breaker rejects requests when OPEN"""
        # Create failing parser
        failing_parser = Mock()
        failing_parser.can_parse.return_value = True
        failing_parser.parse.side_effect = Exception("Parser explosion!")

        registry = ParserRegistry(circuit_breaker=self.breaker)
        registry.register(failing_parser, priority=5)

        # Trip the breaker
        for i in range(3):
            with self.assertRaises(Exception):
                registry.parse_with_fallback("trigger failure")

        # Now requests should be rejected immediately
        with self.assertRaises(CircuitBreakerError):
            registry.parse_with_fallback("should be rejected")

        # Parser should NOT have been called again
        self.assertEqual(failing_parser.parse.call_count, 3)

    def test_circuit_breaker_recovers_after_timeout(self):
        """Test circuit breaker transitions to HALF_OPEN and recovers"""
        # Create a parser that fails initially, then succeeds
        call_count = [0]

        def conditional_parse(text):
            call_count[0] += 1
            if call_count[0] <= 3:
                raise Exception("Initial failures")
            return [{"name": "Read", "arguments": {}}]

        failing_parser = Mock()
        failing_parser.can_parse.return_value = True
        failing_parser.parse.side_effect = conditional_parse

        registry = ParserRegistry(circuit_breaker=self.breaker)
        registry.register(failing_parser, priority=5)

        # Trip the breaker
        for i in range(3):
            with self.assertRaises(Exception):
                registry.parse_with_fallback("trigger failure")

        self.assertEqual(self.breaker.state, CircuitBreakerState.OPEN)

        # Wait for recovery timeout
        time.sleep(2.5)

        # Next request should transition to HALF_OPEN and succeed
        result = registry.parse_with_fallback("should succeed now")
        self.assertIsNotNone(result)

        # Should be in HALF_OPEN or CLOSED
        self.assertIn(self.breaker.state,
                     [CircuitBreakerState.HALF_OPEN, CircuitBreakerState.CLOSED])

        # One more success should close circuit
        result = registry.parse_with_fallback("another success")
        self.assertEqual(self.breaker.state, CircuitBreakerState.CLOSED)


class TestParserFailoverEdgeCases(unittest.TestCase):
    """Test edge cases in parser failover"""

    def setUp(self):
        """Set up test fixtures"""
        self.registry = ParserRegistry()

        self.openai_parser = OpenAIToolParser()
        self.commentary_parser = CommentaryToolParser()
        self.fallback_parser = FallbackParser()

        self.registry.register(self.openai_parser, priority=10)
        self.registry.register(self.commentary_parser, priority=20)
        self.registry.register(self.fallback_parser, priority=30)

    def test_handles_empty_input(self):
        """Test gracefully handles empty input"""
        result = self.registry.parse_with_fallback("")

        # Should fall back to text response
        self.assertEqual(result['type'], 'text')
        self.assertEqual(result['content'], '')

    def test_handles_none_input(self):
        """Test gracefully handles None input"""
        result = self.registry.parse_with_fallback(None)

        # Should fall back to text response
        self.assertIsNotNone(result)
        self.assertEqual(result['type'], 'text')

    def test_handles_malformed_json(self):
        """Test gracefully handles malformed JSON"""
        malformed = "{ this is not valid json at all }"

        result = self.registry.parse_with_fallback(malformed)

        # Should fall back to text response
        self.assertEqual(result['type'], 'text')

    def test_handles_mixed_format_input(self):
        """Test handles input with mixed formats"""
        # Input has both OpenAI structure AND commentary tags
        mixed_input = """
        {
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"}
                }
            ]
        }

        [TOOL_CALL]
        {"name": "Write", "arguments": {}}
        [/TOOL_CALL]
        """

        result = self.registry.parse_with_fallback(mixed_input)

        # Should parse with highest priority parser that can handle it
        self.assertIsNotNone(result)


class TestParserFailoverConcurrency(unittest.TestCase):
    """Test parser failover under concurrent load"""

    def setUp(self):
        """Set up test fixtures"""
        self.breaker = CircuitBreaker(
            failure_threshold=10,
            recovery_timeout=2,
            success_threshold=3
        )

        self.registry = ParserRegistry(circuit_breaker=self.breaker)

        self.openai_parser = OpenAIToolParser()
        self.commentary_parser = CommentaryToolParser()
        self.fallback_parser = FallbackParser()

        self.registry.register(self.openai_parser, priority=10)
        self.registry.register(self.commentary_parser, priority=20)
        self.registry.register(self.fallback_parser, priority=30)

    def test_concurrent_parsing_is_thread_safe(self):
        """Test concurrent parse requests don't corrupt state"""
        results = []

        openai_input = json.dumps({
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"}
                }
            ]
        })

        def concurrent_parse():
            result = self.registry.parse_with_fallback(openai_input)
            results.append(result)

        # Create 50 threads
        threads = []
        for _ in range(50):
            t = threading.Thread(target=concurrent_parse)
            threads.append(t)
            t.start()

        # Wait for all
        for t in threads:
            t.join()

        # All should succeed
        self.assertEqual(len(results), 50)
        for result in results:
            self.assertIsNotNone(result)

        # Metrics should be accurate
        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['openai_successes'], 50)

    def test_concurrent_mixed_formats(self):
        """Test concurrent requests with different formats"""
        results = []

        inputs = [
            json.dumps({"tool_calls": [{"id": "1", "type": "function", "function": {"name": "Read", "arguments": "{}"}}]}),
            "[TOOL_CALL]\n{\"name\": \"Write\"}\n[/TOOL_CALL]",
            "Just plain text",
        ]

        def concurrent_parse(input_text):
            result = self.registry.parse_with_fallback(input_text)
            results.append(result)

        # Create threads for each input type
        threads = []
        for _ in range(10):
            for input_text in inputs:
                t = threading.Thread(target=concurrent_parse, args=(input_text,))
                threads.append(t)
                t.start()

        # Wait for all
        for t in threads:
            t.join()

        # All 30 should succeed (10 iterations × 3 input types)
        self.assertEqual(len(results), 30)

        # Verify different parsers were used
        metrics = self.registry.get_metrics()
        self.assertGreater(metrics['openai_successes'], 0)
        self.assertGreater(metrics['commentary_successes'], 0)
        self.assertGreater(metrics['fallback_successes'], 0)


class TestParserFailoverPerformance(unittest.TestCase):
    """Test performance characteristics of parser failover"""

    def setUp(self):
        """Set up test fixtures"""
        self.registry = ParserRegistry()

        self.openai_parser = OpenAIToolParser()
        self.commentary_parser = CommentaryToolParser()
        self.fallback_parser = FallbackParser()

        self.registry.register(self.openai_parser, priority=10)
        self.registry.register(self.commentary_parser, priority=20)
        self.registry.register(self.fallback_parser, priority=30)

    def test_successful_parse_is_fast(self):
        """Test successful parsing completes quickly"""
        openai_input = json.dumps({
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"}
                }
            ]
        })

        iterations = 100
        start = time.perf_counter()

        for _ in range(iterations):
            self.registry.parse_with_fallback(openai_input)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        # Should be fast (under 10ms per parse)
        self.assertLess(avg_time_ms, 10.0,
                       f"Parse time {avg_time_ms:.2f}ms exceeds 10ms threshold")

    def test_fallback_chain_overhead_is_reasonable(self):
        """Test fallback through entire chain doesn't add excessive overhead"""
        text_input = "Just plain text that requires full fallback chain"

        iterations = 100
        start = time.perf_counter()

        for _ in range(iterations):
            self.registry.parse_with_fallback(text_input)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        # Should still be fast even with full fallback chain (under 15ms)
        self.assertLess(avg_time_ms, 15.0,
                       f"Fallback time {avg_time_ms:.2f}ms exceeds 15ms threshold")


if __name__ == '__main__':
    unittest.main()
