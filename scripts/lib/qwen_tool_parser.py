#!/usr/bin/env python3
"""
Qwen Tool Parser

Handles 13 format variations from local models (Qwen, Phi-4, Gemma, etc.):
1. <tool_call>{"name": "func", "arguments": {...}}</tool_call>
2. <tools>[{"name": "func", "arguments": {...}}]</tools>
3. <function>{"name": "func", "arguments": {...}}</function>
4. <function-call>{"name": "func", "arguments": {...}}</function-call> (also <function_call>)
5. <{"name": "func", "arguments": {...}}>
6. <ToolName arg1="val1" arg2="val2"/> (tool name as XML tag with args as attributes)
7. <function name="func" arguments='{...}'/> (function tag with name/args attributes)
8. ```json\n{"name": "func", "arguments": {...}}\n``` (raw JSON in code block)
9. <response>{"name": "func", "arguments": {...}}</response>
10. {"name": "func", "arguments": {...}} (bare JSON tool call - no wrapper)
11. <function=ToolName><parameter=key>value (Qwen3-Coder equality-sign format)
12. functools[{"name": "func", "arguments": {...}}] (Phi-4 functools format)
13. <start_function_call>call:func{key:value}<end_function_call> (FunctionGemma format)

GitHub Issue: #33 - MLX Worker tool calling format inconsistency
GitHub Issue: #40 - Add additional model tool calling formats (Phi-4, Qwen2.5, Gemma)

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

        # Register all 13 format patterns
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
            ),
            # Format 10: Bare JSON tool call (no wrapper)
            # Matches: {"name": "Glob", "arguments": {"pattern": "*.md"}}
            # Must be at start of line or after whitespace, and have both name and arguments
            'bare_json': re.compile(
                r'(?:^|\s)(\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*\}\s*\})',
                re.DOTALL | re.MULTILINE
            ),
            # Format 11: Qwen3-Coder equality-sign format
            # Matches: <function=Read><parameter=file_path>/path/to/file
            # Can have multiple <parameter=key>value pairs
            'function_equals': re.compile(
                r'<function=([A-Za-z][A-Za-z0-9_]*)>(.*?)(?=<function=|$)',
                re.DOTALL
            ),
            # Format 12: Phi-4 functools format
            # Matches: functools[{"name": "Read", "arguments": {"file_path": "/tmp/test.txt"}}]
            # Also matches array: functools[{...}, {...}]
            'phi4_functools': re.compile(
                r'functools\s*\[(.*?)\]',
                re.DOTALL
            ),
            # Format 13: FunctionGemma start/end_function_call format
            # Matches: <start_function_call>call:Read{file_path:/tmp/test.txt}<end_function_call>
            # Key-value pairs use colon separator, values may contain <escape>...</escape>
            'gemma_function_call': re.compile(
                r'<start_function_call>call:([A-Za-z_][A-Za-z0-9_]*)\{(.*?)\}<end_function_call>',
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

        # Check raw_json_block on ORIGINAL response first (before normalization strips ```)
        if 'raw_json_block' in self.patterns:
            if self.patterns['raw_json_block'].search(response):
                return True

        # Normalize response before checking other patterns
        normalized = self._normalize_output(response)

        # Check if any pattern matches (on normalized text)
        for name, pattern in self.patterns.items():
            if name == 'raw_json_block':
                continue  # Already checked above
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
                        elif format_name == 'function_equals':
                            # Format 11: <function=Read><parameter=file_path>/path
                            tool_name = match_obj.group(1)  # e.g., "Read"
                            params_str = match_obj.group(2)  # e.g., "<parameter=file_path>/path"
                            parsed = self._parse_format(params_str, format_name, tool_name=tool_name)
                        elif format_name == 'gemma_function_call':
                            # Format 13: <start_function_call>call:Read{file_path:/tmp}<end_function_call>
                            tool_name = match_obj.group(1)  # e.g., "Read"
                            args_str = match_obj.group(2)  # e.g., "file_path:/tmp"
                            parsed = self._parse_format(args_str, format_name, tool_name=tool_name)
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

            # Deduplicate tool calls (same name + same arguments = duplicate)
            tool_calls = self._deduplicate_tool_calls(tool_calls)

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

        elif format_name == 'function_equals':
            # Format 11: <function=Read><parameter=file_path>/path/to/file
            # Parse <parameter=key>value pairs from match
            arguments = self._parse_parameter_tags(match)
            if tool_name and arguments:
                tool_calls.append({
                    'name': tool_name,
                    'arguments': arguments
                })

        elif format_name == 'phi4_functools':
            # Format 12: functools[{"name": "func", "arguments": {...}}]
            # Parse JSON array or object inside functools[]
            try:
                # Try parsing as JSON array first
                content = json.loads(f'[{match}]') if not match.startswith('[') else json.loads(match)
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and 'name' in item:
                            tool_calls.append({
                                'name': item['name'],
                                'arguments': item.get('arguments', {})
                            })
                elif isinstance(content, dict) and 'name' in content:
                    tool_calls.append({
                        'name': content['name'],
                        'arguments': content.get('arguments', {})
                    })
            except json.JSONDecodeError:
                pass  # Skip malformed JSON

        elif format_name == 'gemma_function_call':
            # Format 13: <start_function_call>call:func{key:value}<end_function_call>
            # Parse key:value pairs from the arguments string
            arguments = self._parse_gemma_args(match)
            if tool_name:
                tool_calls.append({
                    'name': tool_name,
                    'arguments': arguments if arguments else {}
                })

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

    def _parse_parameter_tags(self, params_str: str) -> Optional[Dict]:
        """
        Parse <parameter=key>value format into a dictionary

        Args:
            params_str: String containing <parameter=key>value pairs

        Returns:
            Dictionary of parameter name-value pairs
        """
        arguments = {}

        # Match <parameter=key>value pattern
        # Value extends until next <parameter= or end of string
        param_pattern = re.compile(
            r'<parameter=([^>]+)>([^<]*)',
            re.DOTALL
        )

        for match in param_pattern.finditer(params_str):
            key = match.group(1).strip()
            value = match.group(2).strip()

            # Try to parse value as JSON for nested objects/arrays
            try:
                arguments[key] = json.loads(value)
            except json.JSONDecodeError:
                # Keep as string
                arguments[key] = value

        return arguments if arguments else None

    def _parse_gemma_args(self, args_str: str) -> Optional[Dict]:
        """
        Parse FunctionGemma key:value format into a dictionary

        FunctionGemma format uses colon-separated key:value pairs.
        Values may contain <escape>...</escape> wrappers for special content.

        Args:
            args_str: String containing key:value pairs like "file_path:/tmp/test.txt"

        Returns:
            Dictionary of argument name-value pairs

        Examples:
            Input: "file_path:/tmp/test.txt"
            Output: {"file_path": "/tmp/test.txt"}

            Input: "pattern:<escape>*.py</escape>"
            Output: {"pattern": "*.py"}
        """
        if not args_str:
            return {}

        arguments = {}

        # First, handle escape tags - replace <escape>content</escape> with just content
        args_str = re.sub(r'<escape>(.*?)</escape>', r'\1', args_str)

        # Find all key:value pairs
        # Pattern: key is word chars at start or after space, followed by colon, value until next key or end
        # Use findall with a pattern that captures key and value
        pattern = re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*):([^:]*?)(?=\s+[a-zA-Z_][a-zA-Z0-9_]*:|$)')

        for match in pattern.finditer(args_str):
            key = match.group(1).strip()
            value = match.group(2).strip()

            # Try to parse value as JSON for nested objects/arrays/numbers
            try:
                arguments[key] = json.loads(value)
            except json.JSONDecodeError:
                # Keep as string
                arguments[key] = value

        return arguments if arguments else {}

    def _deduplicate_tool_calls(self, tool_calls: List[Dict]) -> List[Dict]:
        """
        Remove duplicate tool calls (same name + same arguments)

        Multiple patterns may match the same tool call JSON, causing duplicates.
        This method removes them while preserving order.

        Args:
            tool_calls: List of parsed tool calls

        Returns:
            Deduplicated list of tool calls
        """
        seen = set()
        unique_calls = []

        for call in tool_calls:
            # Create a hashable key from name + sorted arguments
            name = call.get('name', '')
            args = call.get('arguments', {})
            # Convert args to sorted tuple of items for hashing
            args_key = tuple(sorted(
                (k, json.dumps(v, sort_keys=True) if isinstance(v, (dict, list)) else str(v))
                for k, v in args.items()
            ))
            key = (name, args_key)

            if key not in seen:
                seen.add(key)
                unique_calls.append(call)

        return unique_calls


__all__ = ['QwenToolParser', 'ToolParseError']
