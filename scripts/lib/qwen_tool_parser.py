#!/usr/bin/env python3
"""
Qwen Tool Parser

Handles 4 XML format variations from Qwen2.5-Coder-7B model:
1. <tool_call>{"name": "func", "arguments": {...}}</tool_call>
2. <tools>[{"name": "func", "arguments": {...}}]</tools>
3. <function>{"name": "func", "arguments": {...}}</function>
4. <{"name": "func", "arguments": {...}}>

GitHub Issue: #33 - MLX Worker tool calling format inconsistency

Security Features:
- 1MB JSON size limit
- 100ms parse timeout
- XXE prevention (json.loads only)
- Input normalization (strip markdown, normalize whitespace)
"""

import json
import re
import time
from typing import Optional, Dict, Any, List, Union
from .tool_parsers import ToolParserBase, ToolParseError


class QwenToolParser(ToolParserBase):
    """
    Parser for Qwen2.5-Coder-7B tool calling formats

    Supports 4 format variations with multi-phase parsing and fallback chain.
    """

    def __init__(self, max_json_size_mb: int = 1, timeout_ms: int = 100):
        """
        Initialize Qwen parser with security limits

        Args:
            max_json_size_mb: Maximum JSON size in megabytes
            timeout_ms: Maximum parse time in milliseconds
        """
        super().__init__(max_json_size_mb, timeout_ms)

        # Register all 4 Qwen format patterns
        # Use non-greedy matching by default
        self.patterns = {
            'tool_call': re.compile(r'<tool_call>(.*?)</tool_call>', re.DOTALL),
            'tools': re.compile(r'<tools>(.*?)</tools>', re.DOTALL),
            'function': re.compile(r'<function>(.*?)</function>', re.DOTALL),
            'json_bracket': re.compile(r'<(\{[^>]*?\})>', re.DOTALL)
        }

    def can_parse(self, response: Union[str, Dict, None]) -> bool:
        """
        Check if response contains any Qwen format patterns

        Args:
            response: LLM response (string or dict)

        Returns:
            True if any Qwen format pattern is detected
        """
        if response is None or response == "":
            return False

        if not isinstance(response, str):
            return False

        # Normalize response before checking
        normalized = self._normalize_output(response)

        # Check if any pattern matches
        for pattern in self.patterns.values():
            if pattern.search(normalized):
                return True

        return False

    def parse(self, response: Union[str, Dict, None], **kwargs) -> Optional[List[Dict]]:
        """
        Parse tool calls from Qwen format response

        Args:
            response: LLM response to parse
            **kwargs: Parser-specific options

        Returns:
            List of tool calls [{"name": str, "arguments": dict}], or None if parsing fails
        """
        start_time = time.perf_counter()

        try:
            if not isinstance(response, str):
                return None

            # Validate size
            self._validate_json_size(response)

            # Normalize output
            normalized = self._normalize_output(response)

            # Extract tool calls from all format types
            tool_calls = []

            # Try each format pattern
            for format_name, pattern in self.patterns.items():
                # Use finditer for more control
                for match_obj in pattern.finditer(normalized):
                    match = match_obj.group(1)

                    try:
                        # Validate timeout before processing each match
                        self._validate_timeout(start_time)

                        # Parse based on format
                        parsed = self._parse_format(match, format_name)
                        if parsed:
                            tool_calls.extend(parsed)

                    except json.JSONDecodeError:
                        # Skip malformed JSON blocks
                        # Try to find a better match by looking for the next closing tag
                        if format_name in ['tool_call', 'tools', 'function']:
                            # Try greedy match from this position
                            tag_name = format_name if format_name != 'tool_call' else 'tool_call'
                            greedy_pattern = re.compile(
                                rf'<{tag_name}>(.*)</{tag_name}>',
                                re.DOTALL
                            )
                            greedy_match = greedy_pattern.search(
                                normalized[match_obj.start():]
                            )
                            if greedy_match:
                                try:
                                    greedy_parsed = self._parse_format(
                                        greedy_match.group(1),
                                        format_name
                                    )
                                    if greedy_parsed:
                                        tool_calls.extend(greedy_parsed)
                                        continue
                                except json.JSONDecodeError:
                                    pass
                        # Skip this match
                        continue
                    except ToolParseError:
                        # Re-raise timeout/size errors
                        raise

            # Final timeout check
            self._validate_timeout(start_time)

            # Return empty list if no tool calls found (but format was detected)
            # Return None only if no valid format was detected
            if not tool_calls:
                # Check if any format was actually present
                for pattern in self.patterns.values():
                    if pattern.search(normalized):
                        # Format was present but empty - return empty list
                        return []
                # No format detected at all - return None
                return None

            # Validate structure
            if not self.validate(tool_calls):
                return None

            return tool_calls

        except ToolParseError:
            # Re-raise validation errors
            raise
        except (TypeError, AttributeError):
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """
        Validate extracted tool calls structure

        Args:
            tool_calls: List of tool calls to validate

        Returns:
            True if all tool calls have required fields
        """
        if not isinstance(tool_calls, list):
            return False

        for call in tool_calls:
            # Must be dict
            if not isinstance(call, dict):
                return False

            # Must have 'name' field
            if "name" not in call:
                return False

            # Must have 'arguments' field
            if "arguments" not in call:
                return False

            # Arguments must be dict
            if not isinstance(call["arguments"], dict):
                return False

        return True

    def _normalize_output(self, text: str) -> str:
        """
        Normalize model output before parsing

        Removes markdown code blocks, normalizes whitespace.

        Args:
            text: Raw model output

        Returns:
            Normalized text
        """
        # Strip markdown code blocks
        text = re.sub(r'```(?:xml|json)?\s*(.*?)\s*```', r'\1', text, flags=re.DOTALL)

        # Normalize whitespace (but preserve newlines in JSON)
        # Just strip leading/trailing whitespace per line
        lines = text.split('\n')
        lines = [line.strip() for line in lines]
        text = '\n'.join(lines)

        return text

    def _parse_format(self, match: str, format_name: str) -> List[Dict]:
        """
        Parse tool call from specific format

        Args:
            match: Matched content from regex
            format_name: Format type ('tool_call', 'tools', 'function', 'json_bracket')

        Returns:
            List of parsed tool calls

        Raises:
            json.JSONDecodeError: If JSON is malformed
        """
        tool_calls = []

        # Strip whitespace
        match = match.strip()

        if format_name == 'tools':
            # Format 2: <tools>[...]</tools> - array of tool calls
            tools_array = json.loads(match)

            # Handle both array and single object
            if isinstance(tools_array, list):
                for tool in tools_array:
                    if isinstance(tool, dict) and 'name' in tool:
                        tool_calls.append({
                            'name': tool['name'],
                            'arguments': tool.get('arguments', {})
                        })
            elif isinstance(tools_array, dict) and 'name' in tools_array:
                # Single tool in array format
                tool_calls.append({
                    'name': tools_array['name'],
                    'arguments': tools_array.get('arguments', {})
                })

        else:
            # Formats 1, 3, 4: Single tool call as JSON object
            tool_obj = json.loads(match)

            if isinstance(tool_obj, dict) and 'name' in tool_obj:
                tool_calls.append({
                    'name': tool_obj['name'],
                    'arguments': tool_obj.get('arguments', {})
                })

        return tool_calls


__all__ = ['QwenToolParser', 'ToolParseError']
