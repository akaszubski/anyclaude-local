#!/usr/bin/env python3
"""
Tool Parser Plugin System

Provides a flexible, extensible architecture for parsing tool calls from various
LLM output formats with fallback chains and performance monitoring.

Classes:
    - ToolParserBase: Abstract base class for all parsers
    - OpenAIToolParser: Parses OpenAI tool_calls format
    - CommentaryToolParser: Parses [TOOL_CALL]...[/TOOL_CALL] tags
    - CustomToolParser: Extensible parser for model-specific formats
    - FallbackParser: Final fallback that returns text responses
    - ParserRegistry: Manages parser priority and fallback chain
"""

import json
import re
import time
import threading
from typing import Optional, Dict, Any, List, Union


class ToolParseError(Exception):
    """Raised when tool parsing fails due to validation errors"""
    pass


class ToolParserBase:
    """
    Abstract base class for tool parsers

    All concrete parsers must implement:
    - can_parse(): Detect if this parser can handle the input
    - parse(): Extract tool calls from input
    - validate(): Verify extracted tool calls are well-formed
    """

    # Security limits
    MAX_JSON_SIZE = 1_000_000  # 1MB
    PARSE_TIMEOUT_MS = 100  # 100ms

    def __init__(self, max_json_size_mb: int = 1, timeout_ms: int = 100):
        """
        Initialize parser with security limits

        Args:
            max_json_size_mb: Maximum JSON size in megabytes
            timeout_ms: Maximum parse time in milliseconds
        """
        # Prevent direct instantiation of abstract base class
        if self.__class__ == ToolParserBase:
            raise NotImplementedError("ToolParserBase is abstract and cannot be instantiated directly")

        self.max_json_size = max_json_size_mb * 1024 * 1024
        self.timeout_ms = timeout_ms

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """
        Check if this parser can handle the response

        Args:
            response: LLM response (string or dict)

        Returns:
            True if this parser can handle the response
        """
        raise NotImplementedError("Subclasses must implement can_parse()")

    def parse(self, response: Union[str, Dict, None], **kwargs) -> Optional[Union[List[Dict], Dict]]:
        """
        Parse tool calls from response

        Args:
            response: LLM response to parse
            **kwargs: Parser-specific options

        Returns:
            List of tool calls, or None if parsing fails
        """
        raise NotImplementedError("Subclasses must implement parse()")

    def validate(self, tool_calls: List[Dict]) -> bool:
        """
        Validate extracted tool calls

        Args:
            tool_calls: List of tool calls to validate

        Returns:
            True if all tool calls are valid
        """
        raise NotImplementedError("Subclasses must implement validate()")

    def _validate_json_size(self, text: str) -> None:
        """
        Validate JSON size doesn't exceed limit

        Args:
            text: JSON text to validate

        Raises:
            ToolParseError: If size exceeds limit
        """
        if len(text.encode('utf-8')) > self.max_json_size:
            raise ToolParseError(
                f"JSON size exceeds limit: {len(text)} bytes > {self.max_json_size} bytes"
            )

    def _validate_timeout(self, start_time: float) -> None:
        """
        Validate parse hasn't exceeded timeout

        Args:
            start_time: Parse start time from time.perf_counter()

        Raises:
            ToolParseError: If timeout exceeded
        """
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        if elapsed_ms > self.timeout_ms:
            raise ToolParseError(
                f"Parse timeout exceeded: {elapsed_ms:.1f}ms > {self.timeout_ms}ms"
            )


class OpenAIToolParser(ToolParserBase):
    """
    Parser for OpenAI tool_calls format

    Expected format:
    {
        "tool_calls": [
            {
                "id": "call_abc123",
                "type": "function",
                "function": {
                    "name": "Read",
                    "arguments": "{\"file_path\": \"/tmp/test.txt\"}"
                }
            }
        ]
    }
    """

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """Check if response contains OpenAI tool_calls structure"""
        if response is None or response == "":
            return False

        try:
            # Handle dict or string input
            if isinstance(response, str):
                data = json.loads(response)
            else:
                data = response

            # Check for tool_calls key
            return "tool_calls" in data and isinstance(data["tool_calls"], list)
        except (json.JSONDecodeError, TypeError, AttributeError):
            return False

    def parse(self, response: Union[str, Dict, None], **kwargs) -> Optional[List[Dict]]:
        """Extract tool calls from OpenAI format"""
        start_time = time.perf_counter()

        try:
            # Validate size if string
            if isinstance(response, str):
                self._validate_json_size(response)
                data = json.loads(response)
            else:
                data = response

            # Extract tool_calls
            if "tool_calls" not in data:
                return None

            tool_calls = data["tool_calls"]

            # Validate timeout
            self._validate_timeout(start_time)

            # Validate structure
            if not self.validate(tool_calls):
                return None

            return tool_calls

        except ToolParseError:
            # Re-raise validation errors
            raise
        except (json.JSONDecodeError, TypeError):
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Validate OpenAI tool call structure"""
        if not isinstance(tool_calls, list):
            return False

        for call in tool_calls:
            # Required fields
            if not isinstance(call, dict):
                return False
            if "id" not in call:
                return False
            if "type" not in call:
                return False
            if "function" not in call:
                return False

            # Validate function structure
            func = call["function"]
            if not isinstance(func, dict):
                return False
            if "name" not in func:
                return False

        return True


class CommentaryToolParser(ToolParserBase):
    """
    Parser for commentary format with [TOOL_CALL] tags

    Expected format:
    Let me read that file.

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

    TOOL_CALL_PATTERN = re.compile(r'\[TOOL_CALL\](.*?)\[/TOOL_CALL\]', re.DOTALL)

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """Check if response contains [TOOL_CALL] tags"""
        if response is None or response == "":
            return False

        if not isinstance(response, str):
            return False

        return '[TOOL_CALL]' in response and '[/TOOL_CALL]' in response

    def parse(self, response: Union[str, Dict, None], preserve_context: bool = False, **kwargs) -> Optional[List[Dict]]:
        """Extract tool calls from commentary format"""
        start_time = time.perf_counter()

        try:
            if not isinstance(response, str):
                return None

            # Validate size
            self._validate_json_size(response)

            # Extract all [TOOL_CALL] blocks
            matches = self.TOOL_CALL_PATTERN.findall(response)

            if not matches:
                return None

            tool_calls = []
            for match in matches:
                try:
                    # Parse JSON from tool call block
                    tool_call = json.loads(match.strip())

                    # Optionally preserve context
                    if preserve_context:
                        # Find surrounding text
                        pattern = re.compile(
                            r'(.*?)\[TOOL_CALL\].*?\[/TOOL_CALL\](.*?)(?=\[TOOL_CALL\]|$)',
                            re.DOTALL
                        )
                        context_match = pattern.search(response)
                        if context_match:
                            tool_call['context'] = (
                                context_match.group(1).strip() + ' ' +
                                context_match.group(2).strip()
                            ).strip()

                    tool_calls.append(tool_call)
                except json.JSONDecodeError:
                    # Skip malformed tool calls
                    continue

            # Validate timeout
            self._validate_timeout(start_time)

            # Return None if all tool calls were malformed
            return tool_calls if tool_calls else None

        except (ToolParseError, TypeError):
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Validate commentary tool call structure"""
        if not isinstance(tool_calls, list):
            return False

        for call in tool_calls:
            if not isinstance(call, dict):
                return False
            # Commentary format requires at minimum a 'name' field
            if "name" not in call:
                return False

        return True


class CustomToolParser(ToolParserBase):
    """
    Extensible parser for model-specific formats

    Allows registering custom regex patterns for different models.
    Example: Qwen format uses <tool>...</tool> tags
    """

    def __init__(self, name: str = "custom", max_json_size_mb: int = 1, timeout_ms: int = 100):
        """
        Initialize custom parser

        Args:
            name: Parser name for identification
            max_json_size_mb: Maximum JSON size
            timeout_ms: Parse timeout
        """
        super().__init__(max_json_size_mb, timeout_ms)
        self.name = name
        self.patterns = {}  # model_name -> regex pattern

    def register_pattern(self, model_name: str, pattern: str) -> None:
        """
        Register custom pattern for model

        Args:
            model_name: Model identifier
            pattern: Regex pattern to extract tool calls
        """
        self.patterns[model_name] = re.compile(pattern, re.DOTALL)

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """Check if any registered pattern matches"""
        if response is None or not isinstance(response, str):
            return False

        # Check if any pattern matches
        for pattern in self.patterns.values():
            if pattern.search(response):
                return True

        return False

    def parse(self, response: Union[str, Dict, None], **kwargs) -> Optional[List[Dict]]:
        """Extract tool calls using registered patterns"""
        start_time = time.perf_counter()

        try:
            if not isinstance(response, str):
                return None

            # Validate size
            self._validate_json_size(response)

            # Try each pattern
            for pattern in self.patterns.values():
                matches = pattern.findall(response)
                if matches:
                    tool_calls = []
                    for match in matches:
                        try:
                            tool_call = json.loads(match.strip())
                            tool_calls.append(tool_call)
                        except json.JSONDecodeError:
                            continue

                    if tool_calls:
                        self._validate_timeout(start_time)
                        return tool_calls

            return None

        except (ToolParseError, TypeError):
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Validate custom tool call structure"""
        if not isinstance(tool_calls, list):
            return False

        for call in tool_calls:
            if not isinstance(call, dict):
                return False

        return True


class FallbackParser(ToolParserBase):
    """
    Fallback parser that returns text responses

    Always succeeds and returns the response as plain text.
    Used as last resort when all other parsers fail.
    """

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """Always returns True - accepts any input"""
        return True

    def parse(self, response: Union[str, Dict, None], **kwargs) -> Dict:
        """Return response as text content"""
        # Convert to string if needed
        if response is None:
            content = ""
        elif isinstance(response, dict):
            content = json.dumps(response)
        else:
            content = str(response)

        return {
            "type": "text",
            "content": content
        }

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Always returns True"""
        return True


class ParserRegistry:
    """
    Registry for managing parser priority and fallback chain

    Maintains parsers in priority order (ascending = higher priority first).
    Provides fallback chain execution and metrics tracking.
    """

    def __init__(self, circuit_breaker=None):
        """
        Initialize parser registry

        Args:
            circuit_breaker: Optional CircuitBreaker for protection
        """
        self.parsers = []  # List of (parser, priority) tuples
        self.priorities = {}  # parser -> priority mapping
        self.metrics = {
            'openai_attempts': 0,
            'openai_successes': 0,
            'commentary_attempts': 0,
            'commentary_successes': 0,
            'custom_attempts': 0,
            'custom_successes': 0,
            'fallback_attempts': 0,
            'fallback_successes': 0,
            'unknown_attempts': 0,
            'unknown_successes': 0,
        }
        self.lock = threading.Lock()
        self.circuit_breaker = circuit_breaker

    def register(self, parser: ToolParserBase, priority: int = 50) -> None:
        """
        Register parser with priority

        Args:
            parser: Parser instance to register
            priority: Priority level (lower = higher priority)
        """
        with self.lock:
            self.parsers.append((parser, priority))
            self.priorities[parser] = priority
            # Sort by priority (ascending)
            self.parsers.sort(key=lambda x: x[1])

    def get_ordered_parsers(self) -> List[ToolParserBase]:
        """Get parsers in priority order"""
        with self.lock:
            return [parser for parser, _ in self.parsers]

    def get_priority(self, parser: ToolParserBase) -> int:
        """Get priority for parser"""
        with self.lock:
            return self.priorities.get(parser, 999)

    def parse_with_fallback(self, response: Union[str, Dict, None]) -> Optional[Union[List[Dict], Dict]]:
        """
        Parse response using fallback chain

        Tries parsers in priority order until one succeeds.

        Args:
            response: LLM response to parse

        Returns:
            Parsed tool calls or text response
        """
        def _parse():
            parsers = self.get_ordered_parsers()

            for parser in parsers:
                # Get parser type for metrics
                parser_type = self._get_parser_type(parser)

                # Track attempt (even if can_parse returns False)
                with self.lock:
                    self.metrics[f'{parser_type}_attempts'] += 1

                # Check if parser can handle this response
                if not parser.can_parse(response):
                    continue

                # Try to parse
                result = parser.parse(response)

                if result is not None:
                    # Track success
                    with self.lock:
                        self.metrics[f'{parser_type}_successes'] += 1
                    return result

                # If result is None, try next parser

            # No parser succeeded
            return None

        # Use circuit breaker if available
        if self.circuit_breaker:
            try:
                return self.circuit_breaker.call(_parse)
            except Exception:
                # Circuit breaker rejected or failed
                raise
        else:
            return _parse()

    def get_metrics(self) -> Dict[str, int]:
        """Get parser performance metrics"""
        with self.lock:
            return self.metrics.copy()

    def _get_parser_type(self, parser: ToolParserBase) -> str:
        """Get parser type name for metrics"""
        if isinstance(parser, OpenAIToolParser):
            return 'openai'
        elif isinstance(parser, CommentaryToolParser):
            return 'commentary'
        elif isinstance(parser, CustomToolParser):
            return 'custom'
        elif isinstance(parser, FallbackParser):
            return 'fallback'
        else:
            return 'unknown'
