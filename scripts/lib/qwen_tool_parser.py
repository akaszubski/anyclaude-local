#!/usr/bin/env python3
"""
Qwen Tool Parser

Handles 9 format variations from Qwen2.5-Coder-7B model:
1. <tool_call>{"name": "func", "arguments": {...}}</tool_call>
2. <tools>[{"name": "func", "arguments": {...}}]</tools>
3. <function>{"name": "func", "arguments": {...}}</function>
4. <function-call>{"name": "func", "arguments": {...}}</function-call> (also <function_call>)
5. <{"name": "func", "arguments": {...}}>
6. <ToolName arg1="val1" arg2="val2"/> (tool name as XML tag with args as attributes)
7. <function name="func" arguments='{...}'/> (function tag with name/args attributes)
8. ```json\n{"name": "func", "arguments": {...}}\n``` (raw JSON in code block)
9. <response>{"name": "func", "arguments": {...}}</response>

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

        # Register all 9 Qwen format patterns
        # Use non-greedy matching by default
        self.patterns = {
            'tool_call': re.compile(r'<tool_call>(.*?)</tool_call>', re.DOTALL),
            'tools': re.compile(r'<tools>(.*?)</tools>', re.DOTALL),
            'function': re.compile(r'<function>(.*?)</function>', re.DOTALL),
            # Format 9: <response>JSON</response>
            'response': re.compile(r'<response>(.*?)</response>', re.DOTALL),
            # Matches both <function-call> and <function_call> (hyphen or underscore)
            'function_call': re.compile(r'<function[-_]call>(.*?)</function[-_]call>', re.DOTALL),
            'json_bracket': re.compile(r'<(\{[^>]*?\})>', re.DOTALL),
            # Format 6: <ToolName arg="value"/> - tool name as XML tag with attributes
            # Matches: <Read file_path="/tmp/test.txt"/> or <Bash command="ls"/>
            'tag_with_attrs': re.compile(
                r'<([A-Z][a-zA-Z]*)\s+([^>]+?)(?:/>|>\s*</\1>)',
                re.DOTALL
            ),
            # Format 7: <function name="func" arguments='{...}'/> - function tag with name/args attributes
            # Matches: <function name="Write" arguments='{"file_path": "..."}' />
            'function_attrs': re.compile(
                r'<function\s+name\s*=\s*["\']([^"\']+)["\']\s+arguments\s*=\s*["\'](.+?)["\']\s*/>',
                re.DOTALL
            ),
            # Format 8: Raw JSON tool call in markdown code block
            # Matches: ```json\n{"name": "Write", "arguments": {...}}\n```
            'raw_json_block': re.compile(
                r'```(?:json)?\s*(\{[^`]*?"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:[^`]*?\})\s*```',
                re.DOTALL
            )
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

            # Extract tool calls from all format types
            tool_calls = []

            # First, try raw_json_block on ORIGINAL response (before normalization strips code blocks)
            if 'raw_json_block' in self.patterns:
                for match_obj in self.patterns['raw_json_block'].finditer(response):
                    try:
                        self._validate_timeout(start_time)
                        match = match_obj.group(1)
                        parsed = self._parse_format(match, 'raw_json_block')
                        if parsed:
                            tool_calls.extend(parsed)
                    except json.JSONDecodeError:
                        continue
                    except ToolParseError:
                        raise

            # Normalize output for other patterns
            normalized = self._normalize_output(response)

            # Try each format pattern (skip raw_json_block, already processed)
            for format_name, pattern in self.patterns.items():
                if format_name == 'raw_json_block':
                    continue  # Already processed above
                # Use finditer for more control
                for match_obj in pattern.finditer(normalized):
                    try:
                        # Validate timeout before processing each match
                        self._validate_timeout(start_time)

                        # Handle tag_with_attrs specially (2 capture groups)
                        if format_name == 'tag_with_attrs':
                            tool_name = match_obj.group(1)  # e.g., "Bash"
                            attrs_str = match_obj.group(2)  # e.g., 'command="ls"'
                            parsed = self._parse_format(attrs_str, format_name, tool_name=tool_name)
                        elif format_name == 'function_attrs':
                            # Format 7: <function name="X" arguments='Y'/>
                            tool_name = match_obj.group(1)  # e.g., "Write"
                            args_json = match_obj.group(2)  # e.g., '{"file_path": "..."}'
                            parsed = self._parse_format(args_json, format_name, tool_name=tool_name)
                        else:
                            match = match_obj.group(1)
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

    def _parse_format(self, match: str, format_name: str, tool_name: str = None) -> List[Dict]:
        """
        Parse tool call from specific format

        Args:
            match: Matched content from regex
            format_name: Format type ('tool_call', 'tools', 'function', 'json_bracket', 'tag_with_attrs')
            tool_name: Tool name for 'tag_with_attrs' format

        Returns:
            List of parsed tool calls

        Raises:
            json.JSONDecodeError: If JSON is malformed
        """
        tool_calls = []

        # Strip whitespace
        match = match.strip()

        if format_name == 'tag_with_attrs':
            # Format 6: <ToolName arg="value"/> - parse XML attributes
            # tool_name is the tag name (e.g., "Read", "Bash")
            # match is the attributes string (e.g., 'command="ls /tmp"')
            arguments = self._parse_xml_attributes(match)
            if tool_name and arguments is not None:
                tool_calls.append({
                    'name': tool_name,
                    'arguments': arguments
                })

        elif format_name == 'function_attrs':
            # Format 7: <function name="X" arguments='Y'/>
            # tool_name is from the name attribute, match is the arguments JSON
            try:
                arguments = json.loads(match)
                if tool_name and isinstance(arguments, dict):
                    tool_calls.append({
                        'name': tool_name,
                        'arguments': arguments
                    })
            except json.JSONDecodeError:
                pass  # Skip malformed JSON

        elif format_name == 'tools':
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

    def _parse_xml_attributes(self, attrs_str: str) -> Optional[Dict]:
        """
        Parse XML attributes string into a dictionary

        Args:
            attrs_str: Attributes string like 'arg1="val1" arg2="val2"'

        Returns:
            Dictionary of attribute name-value pairs
        """
        arguments = {}

        # Match attributes: name="value" or name='value'
        attr_pattern = re.compile(r'(\w+)\s*=\s*["\']([^"\']*)["\']')

        for attr_match in attr_pattern.finditer(attrs_str):
            attr_name = attr_match.group(1)
            attr_value = attr_match.group(2)

            # Try to parse value as JSON for nested objects/arrays
            try:
                arguments[attr_name] = json.loads(attr_value)
            except json.JSONDecodeError:
                # Keep as string
                arguments[attr_name] = attr_value

        return arguments if arguments else None


__all__ = ['QwenToolParser', 'ToolParseError']
