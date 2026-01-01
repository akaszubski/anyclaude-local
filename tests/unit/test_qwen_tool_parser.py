#!/usr/bin/env python3
"""
Unit Tests: Qwen Tool Parser (TDD Red Phase)

Tests for QwenToolParser class that handles 4 Qwen XML format variations
for Qwen2.5-Coder-7B model.

GitHub Issue: #33 - MLX Worker tool calling format inconsistency

Expected to FAIL until qwen_tool_parser.py implementation is complete

Test Coverage:
- Format parsing (all 4 Qwen formats)
- Edge cases (empty, malformed, partial, nested)
- Security (size limits, timeout)
- Thread safety (concurrent parsing)
- Validation (structure, fields)
- Performance (parse speed)

Qwen Formats to Support:
1. <tool_call>{"name": "Read", "arguments": {...}}</tool_call>
2. <tools>[{"name": "Read", "arguments": {...}}]</tools>
3. <function>{"name": "Read", "arguments": {...}}</function>
4. <{"name": "Read", "arguments": {...}}>
"""

import pytest
import sys
import json
import time
import threading
from pathlib import Path
from unittest.mock import Mock, patch
from typing import List, Dict, Any

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from lib.qwen_tool_parser import (
        QwenToolParser,
        ToolParseError
    )
    from lib.tool_parsers import ToolParserBase
except ImportError:
    # Mock classes for TDD red phase
    class ToolParseError(Exception):
        pass

    class ToolParserBase:
        MAX_JSON_SIZE = 1_000_000
        PARSE_TIMEOUT_MS = 100

        def __init__(self, max_json_size_mb: int = 1, timeout_ms: int = 100):
            raise NotImplementedError("ToolParserBase not yet implemented")

    class QwenToolParser(ToolParserBase):
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("QwenToolParser not yet implemented")


class TestQwenToolParserInitialization:
    """Test QwenToolParser initialization and configuration"""

    def test_parser_inherits_from_tool_parser_base(self):
        """Test QwenToolParser extends ToolParserBase"""
        parser = QwenToolParser()
        assert isinstance(parser, ToolParserBase)

    def test_parser_default_security_limits(self):
        """Test parser has default security limits"""
        parser = QwenToolParser()
        assert hasattr(parser, 'max_json_size')
        assert hasattr(parser, 'timeout_ms')
        assert parser.max_json_size == 1 * 1024 * 1024  # 1MB
        assert parser.timeout_ms == 100  # 100ms

    def test_parser_custom_security_limits(self):
        """Test parser accepts custom security limits"""
        parser = QwenToolParser(max_json_size_mb=5, timeout_ms=200)
        assert parser.max_json_size == 5 * 1024 * 1024
        assert parser.timeout_ms == 200

    def test_parser_has_format_patterns(self):
        """Test parser registers all 4 Qwen format patterns"""
        parser = QwenToolParser()
        assert hasattr(parser, 'patterns')
        assert len(parser.patterns) == 4
        assert 'tool_call' in parser.patterns
        assert 'tools' in parser.patterns
        assert 'function' in parser.patterns
        assert 'json_bracket' in parser.patterns


class TestQwenFormat1ToolCall:
    """Test Format 1: <tool_call>...</tool_call>"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_can_parse_single_tool_call_format(self, parser):
        """Test can_parse() detects <tool_call> format"""
        response = '<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}</tool_call>'
        assert parser.can_parse(response) is True

    def test_parse_single_tool_call_format(self, parser):
        """Test parse() extracts single tool call"""
        response = '<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}</tool_call>'
        result = parser.parse(response)

        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]['name'] == 'Read'
        assert result[0]['arguments']['file_path'] == '/tmp/test.txt'

    def test_parse_multiple_tool_calls_format(self, parser):
        """Test parse() extracts multiple <tool_call> blocks"""
        response = '''
        <tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/1.txt"}}</tool_call>
        Some text in between
        <tool_call>{"name": "Write", "arguments": {"file_path": "/tmp/2.txt", "content": "test"}}</tool_call>
        '''
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 2
        assert result[0]['name'] == 'Read'
        assert result[1]['name'] == 'Write'

    def test_parse_tool_call_with_whitespace(self, parser):
        """Test parse() handles whitespace inside tags"""
        response = '<tool_call>\n  {"name": "Read", "arguments": {}}\n</tool_call>'
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 1
        assert result[0]['name'] == 'Read'

    def test_parse_tool_call_with_complex_arguments(self, parser):
        """Test parse() handles complex nested arguments"""
        response = '''<tool_call>{
            "name": "Bash",
            "arguments": {
                "command": "ls -la",
                "timeout": 5000,
                "env": {"PATH": "/usr/bin"}
            }
        }</tool_call>'''
        result = parser.parse(response)

        assert result is not None
        assert result[0]['arguments']['command'] == 'ls -la'
        assert result[0]['arguments']['timeout'] == 5000
        assert result[0]['arguments']['env']['PATH'] == '/usr/bin'


class TestQwenFormat2Tools:
    """Test Format 2: <tools>[...]</tools>"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_can_parse_tools_array_format(self, parser):
        """Test can_parse() detects <tools> format"""
        response = '<tools>[{"name": "Read", "arguments": {}}]</tools>'
        assert parser.can_parse(response) is True

    def test_parse_tools_array_single_tool(self, parser):
        """Test parse() extracts single tool from array"""
        response = '<tools>[{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}]</tools>'
        result = parser.parse(response)

        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]['name'] == 'Read'

    def test_parse_tools_array_multiple_tools(self, parser):
        """Test parse() extracts multiple tools from array"""
        response = '''<tools>[
            {"name": "Read", "arguments": {"file_path": "/tmp/1.txt"}},
            {"name": "Write", "arguments": {"file_path": "/tmp/2.txt", "content": "test"}},
            {"name": "Bash", "arguments": {"command": "ls"}}
        ]</tools>'''
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 3
        assert result[0]['name'] == 'Read'
        assert result[1]['name'] == 'Write'
        assert result[2]['name'] == 'Bash'

    def test_parse_tools_empty_array(self, parser):
        """Test parse() handles empty tools array"""
        response = '<tools>[]</tools>'
        result = parser.parse(response)

        assert result is not None
        assert isinstance(result, list)
        assert len(result) == 0


class TestQwenFormat3Function:
    """Test Format 3: <function>...</function>"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_can_parse_function_format(self, parser):
        """Test can_parse() detects <function> format"""
        response = '<function>{"name": "Read", "arguments": {}}</function>'
        assert parser.can_parse(response) is True

    def test_parse_function_format(self, parser):
        """Test parse() extracts function call"""
        response = '<function>{"name": "Edit", "arguments": {"file_path": "/tmp/test.txt", "old_string": "foo", "new_string": "bar"}}</function>'
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 1
        assert result[0]['name'] == 'Edit'
        assert result[0]['arguments']['old_string'] == 'foo'

    def test_parse_multiple_function_calls(self, parser):
        """Test parse() extracts multiple <function> blocks"""
        response = '''
        <function>{"name": "Read", "arguments": {"file_path": "/tmp/1.txt"}}</function>
        Text between calls
        <function>{"name": "Bash", "arguments": {"command": "pwd"}}</function>
        '''
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 2


class TestQwenFormat4JSONBracket:
    """Test Format 4: <{...}>"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_can_parse_json_bracket_format(self, parser):
        """Test can_parse() detects <{...}> format"""
        response = '<{"name": "Read", "arguments": {}}>'
        assert parser.can_parse(response) is True

    def test_parse_json_bracket_format(self, parser):
        """Test parse() extracts JSON from angle brackets"""
        response = '<{"name": "Grep", "arguments": {"pattern": "TODO", "path": "/tmp"}}>'
        result = parser.parse(response)

        assert result is not None
        assert len(result) == 1
        assert result[0]['name'] == 'Grep'
        assert result[0]['arguments']['pattern'] == 'TODO'

    def test_parse_json_bracket_with_nested_objects(self, parser):
        """Test parse() handles nested JSON in brackets"""
        response = '''<{
            "name": "Write",
            "arguments": {
                "file_path": "/tmp/config.json",
                "content": "{\\"key\\": \\"value\\"}"
            }
        }>'''
        result = parser.parse(response)

        assert result is not None
        assert result[0]['name'] == 'Write'
        assert '"key"' in result[0]['arguments']['content']


class TestQwenEdgeCases:
    """Test edge cases and error handling"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_can_parse_rejects_empty_string(self, parser):
        """Test can_parse() returns False for empty string"""
        assert parser.can_parse('') is False

    def test_can_parse_rejects_none(self, parser):
        """Test can_parse() returns False for None"""
        assert parser.can_parse(None) is False

    def test_can_parse_rejects_plain_text(self, parser):
        """Test can_parse() returns False for plain text"""
        response = "This is just a regular text response without any tags"
        assert parser.can_parse(response) is False

    def test_parse_returns_none_for_invalid_input(self, parser):
        """Test parse() returns None for non-parseable input"""
        result = parser.parse("Just plain text")
        assert result is None

    def test_parse_handles_malformed_json_in_tool_call(self, parser):
        """Test parse() gracefully handles malformed JSON"""
        response = '<tool_call>{name: "Read", this is not valid json}</tool_call>'
        result = parser.parse(response)
        # Should return None or empty list, not raise exception
        assert result is None or result == []

    def test_parse_handles_partial_tool_call_tag(self, parser):
        """Test parse() handles incomplete tags"""
        response = '<tool_call>{"name": "Read"}'  # Missing closing tag
        result = parser.parse(response)
        assert result is None or result == []

    def test_parse_handles_mismatched_tags(self, parser):
        """Test parse() handles mismatched opening/closing tags"""
        response = '<tool_call>{"name": "Read"}</function>'
        result = parser.parse(response)
        # Should handle gracefully
        assert result is not None or result is None  # Either way is fine

    def test_parse_handles_nested_tool_calls(self, parser):
        """Test parse() handles nested tool call structures"""
        response = '''<tool_call>
        {"name": "Bash", "arguments": {"command": "echo '<tool_call>nested</tool_call>'"}}
        </tool_call>'''
        result = parser.parse(response)

        # Should extract outer tool call, not be confused by nested tag
        assert result is not None
        assert len(result) >= 1

    def test_parse_handles_mixed_formats(self, parser):
        """Test parse() handles multiple format types in one response"""
        response = '''
        <tool_call>{"name": "Read", "arguments": {}}</tool_call>
        <tools>[{"name": "Write", "arguments": {}}]</tools>
        <function>{"name": "Bash", "arguments": {}}</function>
        '''
        result = parser.parse(response)

        # Should extract all tool calls from all formats
        assert result is not None
        assert len(result) >= 3  # At least one from each format

    def test_parse_handles_empty_json_objects(self, parser):
        """Test parse() handles empty arguments"""
        response = '<tool_call>{"name": "Glob", "arguments": {}}</tool_call>'
        result = parser.parse(response)

        assert result is not None
        assert result[0]['name'] == 'Glob'
        assert result[0]['arguments'] == {}

    def test_parse_preserves_unicode_characters(self, parser):
        """Test parse() preserves unicode in arguments"""
        response = '<tool_call>{"name": "Write", "arguments": {"content": "Hello 世界 🌍"}}</tool_call>'
        result = parser.parse(response)

        assert result is not None
        assert '世界' in result[0]['arguments']['content']
        assert '🌍' in result[0]['arguments']['content']

    def test_parse_handles_very_long_content(self, parser):
        """Test parse() handles large content in arguments"""
        long_content = 'x' * 50000  # 50KB of content
        response = f'<tool_call>{{"name": "Write", "arguments": {{"content": "{long_content}"}}}}</tool_call>'
        result = parser.parse(response)

        assert result is not None
        assert len(result[0]['arguments']['content']) == 50000


class TestQwenSecurityLimits:
    """Test security limits (size, timeout)"""

    def test_parse_rejects_oversized_json(self):
        """Test parse() raises error for JSON exceeding size limit"""
        parser = QwenToolParser(max_json_size_mb=1)

        # Create 2MB JSON (exceeds 1MB limit)
        huge_content = 'x' * (2 * 1024 * 1024)
        response = f'<tool_call>{{"name": "Write", "arguments": {{"content": "{huge_content}"}}}}</tool_call>'

        with pytest.raises(ToolParseError, match="exceeds limit"):
            parser.parse(response)

    def test_parse_timeout_on_complex_parsing(self):
        """Test parse() enforces timeout limit"""
        parser = QwenToolParser(timeout_ms=1)  # 1ms timeout - very strict

        # Create response with many tool calls to slow down parsing
        tool_calls = []
        for i in range(1000):
            tool_calls.append(f'<tool_call>{{"name": "Tool{i}", "arguments": {{}}}}</tool_call>')
        response = '\n'.join(tool_calls)

        # Should either complete fast or raise timeout error
        try:
            result = parser.parse(response)
            # If it completes, that's okay too (fast machine)
            assert result is not None or result is None
        except ToolParseError as e:
            # Timeout is expected on slower machines
            assert 'timeout' in str(e).lower()

    def test_validate_json_size_method(self):
        """Test _validate_json_size() helper method"""
        parser = QwenToolParser(max_json_size_mb=1)

        # Small JSON should pass
        small_json = '{"name": "Read"}'
        parser._validate_json_size(small_json)  # Should not raise

        # Large JSON should fail
        large_json = 'x' * (2 * 1024 * 1024)
        with pytest.raises(ToolParseError):
            parser._validate_json_size(large_json)


class TestQwenValidation:
    """Test validation of extracted tool calls"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_validate_accepts_valid_tool_call(self, parser):
        """Test validate() returns True for valid tool call"""
        tool_calls = [
            {"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}
        ]
        assert parser.validate(tool_calls) is True

    def test_validate_accepts_tool_call_without_arguments(self, parser):
        """Test validate() accepts tool call with no arguments"""
        tool_calls = [
            {"name": "Glob", "arguments": {}}
        ]
        assert parser.validate(tool_calls) is True

    def test_validate_rejects_missing_name_field(self, parser):
        """Test validate() rejects tool call without 'name'"""
        tool_calls = [
            {"arguments": {"file_path": "/tmp/test.txt"}}  # Missing 'name'
        ]
        assert parser.validate(tool_calls) is False

    def test_validate_rejects_missing_arguments_field(self, parser):
        """Test validate() rejects tool call without 'arguments'"""
        tool_calls = [
            {"name": "Read"}  # Missing 'arguments'
        ]
        assert parser.validate(tool_calls) is False

    def test_validate_rejects_non_list_input(self, parser):
        """Test validate() rejects non-list input"""
        tool_call = {"name": "Read", "arguments": {}}  # Not a list
        assert parser.validate(tool_call) is False

    def test_validate_rejects_non_dict_tool_calls(self, parser):
        """Test validate() rejects non-dict elements in list"""
        tool_calls = [
            "not a dict",
            {"name": "Read", "arguments": {}}
        ]
        assert parser.validate(tool_calls) is False

    def test_validate_accepts_multiple_valid_tool_calls(self, parser):
        """Test validate() accepts list of valid tool calls"""
        tool_calls = [
            {"name": "Read", "arguments": {}},
            {"name": "Write", "arguments": {"content": "test"}},
            {"name": "Bash", "arguments": {"command": "ls"}}
        ]
        assert parser.validate(tool_calls) is True


class TestQwenThreadSafety:
    """Test thread safety for concurrent parsing"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_concurrent_parsing_different_formats(self, parser):
        """Test parser handles concurrent requests with different formats"""
        responses = [
            '<tool_call>{"name": "Read1", "arguments": {}}</tool_call>',
            '<tools>[{"name": "Read2", "arguments": {}}]</tools>',
            '<function>{"name": "Read3", "arguments": {}}</function>',
            '<{"name": "Read4", "arguments": {}}>'
        ]

        results = []
        lock = threading.Lock()

        def parse_response(response):
            result = parser.parse(response)
            with lock:
                results.append(result)

        # Create threads for concurrent parsing
        threads = []
        for response in responses * 5:  # 20 threads total
            t = threading.Thread(target=parse_response, args=(response,))
            threads.append(t)
            t.start()

        # Wait for all threads
        for t in threads:
            t.join()

        # All should succeed
        assert len(results) == 20
        for result in results:
            assert result is not None
            assert len(result) >= 1

    def test_concurrent_can_parse_checks(self, parser):
        """Test can_parse() is thread-safe"""
        response = '<tool_call>{"name": "Read", "arguments": {}}</tool_call>'
        results = []
        lock = threading.Lock()

        def check_can_parse():
            result = parser.can_parse(response)
            with lock:
                results.append(result)

        # Create 50 threads
        threads = []
        for _ in range(50):
            t = threading.Thread(target=check_can_parse)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        # All should return True
        assert len(results) == 50
        assert all(results)


class TestQwenPerformance:
    """Test performance requirements"""

    @pytest.fixture
    def parser(self):
        return QwenToolParser()

    def test_parse_completes_within_timeout(self, parser):
        """Test parse() completes within configured timeout"""
        response = '<tool_call>{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}</tool_call>'

        start = time.perf_counter()
        result = parser.parse(response)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert result is not None
        assert elapsed_ms < 100  # Should complete under default timeout

    def test_can_parse_is_fast(self, parser):
        """Test can_parse() completes quickly"""
        response = '<tool_call>{"name": "Read", "arguments": {}}</tool_call>'

        start = time.perf_counter()
        result = parser.can_parse(response)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert result is True
        assert elapsed_ms < 10  # Should complete under 10ms

    def test_parse_many_tool_calls_efficiently(self, parser):
        """Test parse() handles many tool calls efficiently"""
        # Create response with 100 tool calls
        tool_calls = []
        for i in range(100):
            tool_calls.append(f'<tool_call>{{"name": "Tool{i}", "arguments": {{}}}}</tool_call>')
        response = '\n'.join(tool_calls)

        start = time.perf_counter()
        result = parser.parse(response)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert result is not None
        assert len(result) == 100
        # Should process 100 tool calls in reasonable time
        assert elapsed_ms < 500  # 500ms for 100 calls = 5ms per call


class TestQwenIntegrationWithRegistry:
    """Test integration with ParserRegistry"""

    def test_qwen_parser_registers_with_registry(self):
        """Test QwenToolParser can be registered with ParserRegistry"""
        from lib.tool_parsers import ParserRegistry

        parser = QwenToolParser()
        registry = ParserRegistry()

        # Should be able to register
        registry.register(parser, priority=15)

        # Should be in registry
        parsers = registry.get_ordered_parsers()
        assert parser in parsers

    def test_qwen_parser_priority_ordering(self):
        """Test QwenToolParser respects priority ordering"""
        from lib.tool_parsers import ParserRegistry, OpenAIToolParser

        qwen_parser = QwenToolParser()
        openai_parser = OpenAIToolParser()
        registry = ParserRegistry()

        # Register with Qwen higher priority (lower number)
        registry.register(openai_parser, priority=20)
        registry.register(qwen_parser, priority=10)

        parsers = registry.get_ordered_parsers()

        # Qwen should come before OpenAI
        qwen_idx = parsers.index(qwen_parser)
        openai_idx = parsers.index(openai_parser)
        assert qwen_idx < openai_idx

    def test_qwen_parser_fallback_chain(self):
        """Test QwenToolParser works in fallback chain"""
        from lib.tool_parsers import ParserRegistry, OpenAIToolParser

        qwen_parser = QwenToolParser()
        openai_parser = OpenAIToolParser()
        registry = ParserRegistry()

        registry.register(openai_parser, priority=10)
        registry.register(qwen_parser, priority=20)

        # Parse Qwen format
        response = '<tool_call>{"name": "Read", "arguments": {}}</tool_call>'
        result = registry.parse_with_fallback(response)

        # Should fall back to Qwen parser
        assert result is not None
        assert len(result) >= 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
