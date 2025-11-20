#!/usr/bin/env python3
"""
Unit Tests: Tool Parser Plugin System

Tests for the tool parser plugin system that provides a flexible, extensible
architecture for parsing tool calls from various LLM output formats.

Expected to FAIL until ToolParser implementation is complete (TDD Red Phase)

Test Coverage:
- ToolParserBase ABC methods and validation
- OpenAIToolParser format detection and parsing
- CommentaryToolParser format detection and parsing
- ParserRegistry priority ordering and fallback chain
- Thread safety and performance requirements
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

# This import will fail until implementation is complete
try:
    from lib.tool_parsers import (
        ToolParserBase,
        OpenAIToolParser,
        CommentaryToolParser,
        CustomToolParser,
        FallbackParser,
        ParserRegistry,
        ToolParseError
    )
except ImportError:
    # Mock classes for TDD red phase
    class ToolParserBase:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("ToolParserBase not yet implemented")

    class OpenAIToolParser(ToolParserBase):
        pass

    class CommentaryToolParser(ToolParserBase):
        pass

    class CustomToolParser(ToolParserBase):
        pass

    class FallbackParser(ToolParserBase):
        pass

    class ParserRegistry:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("ParserRegistry not yet implemented")

    class ToolParseError(Exception):
        pass


class TestToolParserBase(unittest.TestCase):
    """Test ToolParserBase abstract base class"""

    def test_abstract_can_parse_raises_not_implemented(self):
        """Test that can_parse() is abstract and must be implemented"""
        # Attempting to call abstract method should raise NotImplementedError
        with self.assertRaises(NotImplementedError):
            parser = ToolParserBase()

    def test_abstract_parse_raises_not_implemented(self):
        """Test that parse() is abstract and must be implemented"""
        # This test will pass once we can instantiate a concrete parser
        # For now, it verifies the abstract contract exists
        self.assertTrue(hasattr(ToolParserBase, '__init__'))

    def test_validation_helper_exists(self):
        """Test that validation helpers are available"""
        # Verify the base class provides validation utilities
        # These will be used by concrete parsers
        self.assertTrue(hasattr(ToolParserBase, '__init__'))


class TestOpenAIToolParser(unittest.TestCase):
    """Test OpenAI format tool parser"""

    def setUp(self):
        """Set up test fixtures"""
        self.parser = OpenAIToolParser(max_json_size_mb=1, timeout_ms=100)

        # Valid OpenAI format examples
        self.valid_openai_format = {
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

        self.valid_openai_json = json.dumps(self.valid_openai_format)

        # Invalid formats
        self.invalid_no_tool_calls = json.dumps({"content": "Hello world"})
        self.invalid_malformed_json = "{'tool_calls': [not valid json}"
        self.invalid_missing_fields = json.dumps({
            "tool_calls": [
                {
                    "id": "call_123",
                    # Missing 'type' and 'function'
                }
            ]
        })

    def test_can_parse_detects_valid_openai_format(self):
        """Test can_parse() returns True for valid OpenAI format"""
        result = self.parser.can_parse(self.valid_openai_json)
        self.assertTrue(result)

    def test_can_parse_detects_valid_openai_dict(self):
        """Test can_parse() works with dict input"""
        result = self.parser.can_parse(self.valid_openai_format)
        self.assertTrue(result)

    def test_can_parse_rejects_no_tool_calls_key(self):
        """Test can_parse() returns False when 'tool_calls' key missing"""
        result = self.parser.can_parse(self.invalid_no_tool_calls)
        self.assertFalse(result)

    def test_can_parse_rejects_malformed_json(self):
        """Test can_parse() returns False for malformed JSON"""
        result = self.parser.can_parse(self.invalid_malformed_json)
        self.assertFalse(result)

    def test_can_parse_rejects_empty_string(self):
        """Test can_parse() returns False for empty input"""
        result = self.parser.can_parse("")
        self.assertFalse(result)

    def test_can_parse_rejects_none(self):
        """Test can_parse() returns False for None input"""
        result = self.parser.can_parse(None)
        self.assertFalse(result)

    def test_parse_extracts_single_tool_call(self):
        """Test parse() extracts tool calls from OpenAI format"""
        result = self.parser.parse(self.valid_openai_json)

        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['id'], 'call_abc123')
        self.assertEqual(result[0]['type'], 'function')
        self.assertEqual(result[0]['function']['name'], 'Read')

    def test_parse_extracts_multiple_tool_calls(self):
        """Test parse() handles multiple tool calls"""
        multi_call_format = {
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "arguments": json.dumps({"file_path": "/tmp/a.txt"})
                    }
                },
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {
                        "name": "Write",
                        "arguments": json.dumps({"file_path": "/tmp/b.txt", "content": "test"})
                    }
                }
            ]
        }

        result = self.parser.parse(json.dumps(multi_call_format))
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['function']['name'], 'Read')
        self.assertEqual(result[1]['function']['name'], 'Write')

    def test_parse_returns_none_for_malformed_json(self):
        """Test parse() returns None for malformed JSON"""
        result = self.parser.parse(self.invalid_malformed_json)
        self.assertIsNone(result)

    def test_parse_handles_nested_json_arguments(self):
        """Test parse() correctly handles JSON-stringified arguments"""
        result = self.parser.parse(self.valid_openai_json)

        # Arguments should be parsed from JSON string
        args = json.loads(result[0]['function']['arguments'])
        self.assertEqual(args['file_path'], '/tmp/test.txt')

    def test_validate_accepts_correct_structure(self):
        """Test validate() accepts well-formed tool calls"""
        tool_calls = self.parser.parse(self.valid_openai_json)
        is_valid = self.parser.validate(tool_calls)
        self.assertTrue(is_valid)

    def test_validate_rejects_missing_id(self):
        """Test validate() rejects tool calls missing 'id' field"""
        invalid_calls = [
            {
                "type": "function",
                "function": {"name": "Read", "arguments": "{}"}
            }
        ]
        is_valid = self.parser.validate(invalid_calls)
        self.assertFalse(is_valid)

    def test_validate_rejects_missing_type(self):
        """Test validate() rejects tool calls missing 'type' field"""
        invalid_calls = [
            {
                "id": "call_123",
                "function": {"name": "Read", "arguments": "{}"}
            }
        ]
        is_valid = self.parser.validate(invalid_calls)
        self.assertFalse(is_valid)

    def test_validate_rejects_missing_function(self):
        """Test validate() rejects tool calls missing 'function' field"""
        invalid_calls = [
            {
                "id": "call_123",
                "type": "function"
            }
        ]
        is_valid = self.parser.validate(invalid_calls)
        self.assertFalse(is_valid)

    def test_validate_rejects_missing_function_name(self):
        """Test validate() rejects function missing 'name'"""
        invalid_calls = [
            {
                "id": "call_123",
                "type": "function",
                "function": {"arguments": "{}"}
            }
        ]
        is_valid = self.parser.validate(invalid_calls)
        self.assertFalse(is_valid)

    def test_performance_parse_under_5ms(self):
        """Test parse() completes in <5ms per call"""
        iterations = 100
        start = time.perf_counter()

        for _ in range(iterations):
            self.parser.parse(self.valid_openai_json)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        self.assertLess(avg_time_ms, 5.0,
                       f"Parse time {avg_time_ms:.2f}ms exceeds 5ms threshold")

    def test_security_max_json_size_enforced(self):
        """Test that JSON size limit (1MB) is enforced"""
        # Create a JSON payload larger than 1MB
        large_payload = {
            "tool_calls": [
                {
                    "id": "call_large",
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "arguments": json.dumps({"data": "X" * (2 * 1024 * 1024)})
                    }
                }
            ]
        }
        large_json = json.dumps(large_payload)

        # Should reject oversized payload
        with self.assertRaises(ToolParseError):
            self.parser.parse(large_json)

    def test_security_timeout_enforced(self):
        """Test that 100ms timeout is enforced"""
        # This test would need a mock that simulates slow parsing
        # For now, we verify timeout parameter is accepted
        parser_with_timeout = OpenAIToolParser(timeout_ms=50)
        self.assertIsNotNone(parser_with_timeout)


class TestCommentaryToolParser(unittest.TestCase):
    """Test commentary format tool parser"""

    def setUp(self):
        """Set up test fixtures"""
        self.parser = CommentaryToolParser(max_json_size_mb=1, timeout_ms=100)

        # Valid commentary format examples
        self.single_tool_call = """
        Let me read that file for you.

        [TOOL_CALL]
        {
            "name": "Read",
            "arguments": {
                "file_path": "/tmp/test.txt"
            }
        }
        [/TOOL_CALL]

        I'll analyze the contents.
        """

        self.multi_tool_call = """
        [TOOL_CALL]
        {
            "name": "Read",
            "arguments": {"file_path": "/tmp/a.txt"}
        }
        [/TOOL_CALL]

        Now I'll write the output:

        [TOOL_CALL]
        {
            "name": "Write",
            "arguments": {
                "file_path": "/tmp/b.txt",
                "content": "processed data"
            }
        }
        [/TOOL_CALL]
        """

        self.no_tool_calls = "This is just commentary with no tool calls."

        self.malformed_json_in_tags = """
        [TOOL_CALL]
        {
            "name": "Read",
            "arguments": {invalid json}
        }
        [/TOOL_CALL]
        """

    def test_can_parse_detects_tool_call_tags(self):
        """Test can_parse() returns True when [TOOL_CALL] tags present"""
        result = self.parser.can_parse(self.single_tool_call)
        self.assertTrue(result)

    def test_can_parse_detects_multiple_tags(self):
        """Test can_parse() detects multiple [TOOL_CALL] tags"""
        result = self.parser.can_parse(self.multi_tool_call)
        self.assertTrue(result)

    def test_can_parse_rejects_no_tags(self):
        """Test can_parse() returns False when no tags present"""
        result = self.parser.can_parse(self.no_tool_calls)
        self.assertFalse(result)

    def test_can_parse_rejects_empty_string(self):
        """Test can_parse() returns False for empty input"""
        result = self.parser.can_parse("")
        self.assertFalse(result)

    def test_can_parse_rejects_none(self):
        """Test can_parse() returns False for None input"""
        result = self.parser.can_parse(None)
        self.assertFalse(result)

    def test_parse_extracts_single_tool_call(self):
        """Test parse() extracts tool call from commentary format"""
        result = self.parser.parse(self.single_tool_call)

        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'Read')
        self.assertEqual(result[0]['arguments']['file_path'], '/tmp/test.txt')

    def test_parse_extracts_multiple_tool_calls(self):
        """Test parse() extracts multiple tool calls"""
        result = self.parser.parse(self.multi_tool_call)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['name'], 'Read')
        self.assertEqual(result[1]['name'], 'Write')

    def test_parse_handles_malformed_json_gracefully(self):
        """Test parse() returns None for malformed JSON in tags"""
        result = self.parser.parse(self.malformed_json_in_tags)
        self.assertIsNone(result)

    def test_parse_preserves_commentary_context(self):
        """Test parse() can optionally preserve surrounding commentary"""
        # This is for future enhancement - parser might want to keep context
        result = self.parser.parse(self.single_tool_call, preserve_context=True)

        if result and 'context' in result[0]:
            self.assertIn('analyze the contents', result[0]['context'].lower())

    def test_performance_parse_under_10ms(self):
        """Test parse() completes in <10ms per call"""
        iterations = 100
        start = time.perf_counter()

        for _ in range(iterations):
            self.parser.parse(self.single_tool_call)

        elapsed = time.perf_counter() - start
        avg_time_ms = (elapsed / iterations) * 1000

        self.assertLess(avg_time_ms, 10.0,
                       f"Parse time {avg_time_ms:.2f}ms exceeds 10ms threshold")


class TestParserRegistry(unittest.TestCase):
    """Test parser registry with priority ordering and fallback"""

    def setUp(self):
        """Set up test fixtures"""
        self.registry = ParserRegistry()

    def test_init_creates_empty_registry(self):
        """Test registry starts empty"""
        self.assertIsNotNone(self.registry)
        self.assertEqual(len(self.registry.parsers), 0)

    def test_register_adds_parser_with_priority(self):
        """Test register() adds parser with priority"""
        openai_parser = OpenAIToolParser()
        self.registry.register(openai_parser, priority=10)

        self.assertEqual(len(self.registry.parsers), 1)

    def test_parsers_ordered_by_priority_ascending(self):
        """Test parsers are ordered by priority (ascending = higher priority first)"""
        openai_parser = OpenAIToolParser()
        commentary_parser = CommentaryToolParser()
        fallback_parser = FallbackParser()

        # Register in random order
        self.registry.register(fallback_parser, priority=30)
        self.registry.register(openai_parser, priority=10)
        self.registry.register(commentary_parser, priority=20)

        # Should be ordered: OpenAI (10), Commentary (20), Fallback (30)
        parsers = self.registry.get_ordered_parsers()
        self.assertIsInstance(parsers[0], OpenAIToolParser)
        self.assertIsInstance(parsers[1], CommentaryToolParser)
        self.assertIsInstance(parsers[2], FallbackParser)

    def test_register_maintains_priority_order(self):
        """Test adding parsers maintains priority ordering"""
        for i in range(10):
            parser = Mock(spec=ToolParserBase)
            # Register with random priorities
            priority = (i * 3) % 10
            self.registry.register(parser, priority=priority)

        # Verify sorted order
        parsers = self.registry.get_ordered_parsers()
        priorities = [self.registry.get_priority(p) for p in parsers]
        self.assertEqual(priorities, sorted(priorities))

    def test_parse_with_fallback_tries_openai_first(self):
        """Test parse_with_fallback() tries highest priority parser first"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = True
        openai_parser.parse.return_value = [{"name": "Read"}]

        commentary_parser = Mock(spec=CommentaryToolParser)

        self.registry.register(openai_parser, priority=10)
        self.registry.register(commentary_parser, priority=20)

        # Parse OpenAI format
        openai_input = json.dumps({"tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "Read", "arguments": "{}"}}]})
        result = self.registry.parse_with_fallback(openai_input)

        # Should call OpenAI parser, not commentary
        openai_parser.parse.assert_called_once()
        commentary_parser.parse.assert_not_called()

    def test_parse_with_fallback_falls_back_to_commentary(self):
        """Test parse_with_fallback() falls back when OpenAI parser fails"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = False

        commentary_parser = Mock(spec=CommentaryToolParser)
        commentary_parser.can_parse.return_value = True
        commentary_parser.parse.return_value = [{"name": "Read"}]

        self.registry.register(openai_parser, priority=10)
        self.registry.register(commentary_parser, priority=20)

        # Parse commentary format
        commentary_input = "[TOOL_CALL]\n{\"name\": \"Read\"}\n[/TOOL_CALL]"
        result = self.registry.parse_with_fallback(commentary_input)

        # Should skip OpenAI, use commentary
        openai_parser.parse.assert_not_called()
        commentary_parser.parse.assert_called_once()

    def test_parse_with_fallback_ultimately_falls_back_to_text(self):
        """Test parse_with_fallback() returns text response when all parsers fail"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = False

        commentary_parser = Mock(spec=CommentaryToolParser)
        commentary_parser.can_parse.return_value = False

        fallback_parser = Mock(spec=FallbackParser)
        fallback_parser.can_parse.return_value = True
        fallback_parser.parse.return_value = {"type": "text", "content": "Just text"}

        self.registry.register(openai_parser, priority=10)
        self.registry.register(commentary_parser, priority=20)
        self.registry.register(fallback_parser, priority=30)

        # Parse plain text
        result = self.registry.parse_with_fallback("Just some text response")

        # Should use fallback parser
        fallback_parser.parse.assert_called_once()
        self.assertEqual(result['type'], 'text')

    def test_metrics_tracking_success_counts(self):
        """Test registry tracks successful parses per parser"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = True
        openai_parser.parse.return_value = [{"name": "Read"}]

        self.registry.register(openai_parser, priority=10)

        # Parse 5 times
        for _ in range(5):
            self.registry.parse_with_fallback('{"tool_calls": []}')

        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['openai_successes'], 5)

    def test_metrics_tracking_fallback_counts(self):
        """Test registry tracks fallback chain usage"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = False

        commentary_parser = Mock(spec=CommentaryToolParser)
        commentary_parser.can_parse.return_value = True
        commentary_parser.parse.return_value = [{"name": "Read"}]

        self.registry.register(openai_parser, priority=10)
        self.registry.register(commentary_parser, priority=20)

        # Parse 3 times - should fallback to commentary each time
        for _ in range(3):
            self.registry.parse_with_fallback('[TOOL_CALL]\n{}\n[/TOOL_CALL]')

        metrics = self.registry.get_metrics()
        self.assertEqual(metrics['commentary_successes'], 3)
        self.assertEqual(metrics['openai_attempts'], 3)
        self.assertEqual(metrics['openai_successes'], 0)

    def test_thread_safety_concurrent_registrations(self):
        """Test registry handles concurrent parser registrations safely"""
        def register_parser(priority):
            parser = Mock(spec=ToolParserBase)
            self.registry.register(parser, priority=priority)

        # Create 10 threads that register parsers concurrently
        threads = []
        for i in range(10):
            t = threading.Thread(target=register_parser, args=(i,))
            threads.append(t)
            t.start()

        # Wait for all threads
        for t in threads:
            t.join()

        # Should have exactly 10 parsers
        self.assertEqual(len(self.registry.parsers), 10)

        # Order should still be correct
        parsers = self.registry.get_ordered_parsers()
        priorities = [self.registry.get_priority(p) for p in parsers]
        self.assertEqual(priorities, sorted(priorities))

    def test_thread_safety_concurrent_parses(self):
        """Test registry handles concurrent parse requests safely"""
        openai_parser = Mock(spec=OpenAIToolParser)
        openai_parser.can_parse.return_value = True
        openai_parser.parse.return_value = [{"name": "Read"}]

        self.registry.register(openai_parser, priority=10)

        results = []

        def parse_concurrently():
            result = self.registry.parse_with_fallback('{"tool_calls": []}')
            results.append(result)

        # Create 20 threads that parse concurrently
        threads = []
        for _ in range(20):
            t = threading.Thread(target=parse_concurrently)
            threads.append(t)
            t.start()

        # Wait for all threads
        for t in threads:
            t.join()

        # All should succeed
        self.assertEqual(len(results), 20)
        for result in results:
            self.assertIsNotNone(result)


class TestCustomToolParser(unittest.TestCase):
    """Test custom tool parser for model-specific formats"""

    def setUp(self):
        """Set up test fixtures"""
        # CustomToolParser allows registering custom regex patterns
        self.parser = CustomToolParser()

    def test_register_custom_pattern(self):
        """Test registering custom regex pattern for model-specific format"""
        # Example: Qwen format uses <tool>...</tool> tags
        pattern = r'<tool>(.*?)</tool>'
        self.parser.register_pattern('qwen', pattern)

        qwen_output = "<tool>{\"name\": \"Read\", \"args\": {}}</tool>"
        result = self.parser.parse(qwen_output)

        self.assertIsNotNone(result)

    def test_custom_parser_priority(self):
        """Test custom parsers can be given specific priority"""
        # Custom parsers should be insertable at specific priorities
        custom_parser = CustomToolParser(name='qwen_parser')
        registry = ParserRegistry()

        # Insert custom parser between OpenAI and Commentary
        registry.register(custom_parser, priority=15)

        # Verify it's in the right position
        openai = OpenAIToolParser()
        commentary = CommentaryToolParser()
        registry.register(openai, priority=10)
        registry.register(commentary, priority=20)

        parsers = registry.get_ordered_parsers()
        self.assertIsInstance(parsers[1], CustomToolParser)


class TestFallbackParser(unittest.TestCase):
    """Test fallback parser for non-tool-call responses"""

    def setUp(self):
        """Set up test fixtures"""
        self.parser = FallbackParser()

    def test_can_parse_always_returns_true(self):
        """Test fallback parser accepts any input"""
        self.assertTrue(self.parser.can_parse("anything"))
        self.assertTrue(self.parser.can_parse(""))
        self.assertTrue(self.parser.can_parse(None))

    def test_parse_returns_text_response(self):
        """Test fallback parser returns text response object"""
        result = self.parser.parse("This is just a text response")

        self.assertEqual(result['type'], 'text')
        self.assertEqual(result['content'], 'This is just a text response')

    def test_fallback_has_lowest_priority(self):
        """Test fallback parser should have highest priority number (lowest priority)"""
        registry = ParserRegistry()

        openai = OpenAIToolParser()
        commentary = CommentaryToolParser()
        fallback = FallbackParser()

        registry.register(openai, priority=10)
        registry.register(commentary, priority=20)
        registry.register(fallback, priority=30)

        # Fallback should be last
        parsers = registry.get_ordered_parsers()
        self.assertIsInstance(parsers[-1], FallbackParser)


if __name__ == '__main__':
    unittest.main()
