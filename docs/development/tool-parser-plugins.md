# Tool Parser Plugin System

A guide to extending the tool parser plugin system with custom parsers for new model formats.

## Overview

The tool parser system provides an extensible, plugin-based architecture for parsing tool calls from various LLM output formats. This allows adding support for new model formats without modifying core code.

**Key concepts**:

- **Parser Registry**: Central registry managing parser priority and fallback chains
- **Parser Interface**: Abstract base class defining the parser contract
- **Priority System**: Determines order of fallback attempts
- **Fallback Chain**: Automatic cascade through parsers until one succeeds

## Architecture

### Parser Hierarchy

```
ToolParserBase (abstract)
├── OpenAIToolParser          (priority: 100) - OpenAI tool_calls format
├── CommentaryToolParser      (priority: 50)  - [TOOL_CALL]...[/TOOL_CALL] tags
├── CustomToolParser          (priority: 25)  - Extensible custom formats
└── FallbackParser            (priority: 1)   - Final fallback (text response)

ParserRegistry
├── Manages parser instances
├── Orders by priority (highest first)
└── Implements fallback chain logic
```

### How It Works

1. **Registration**: Parsers register with the registry and specify priority
2. **Detection**: Registry checks each parser in priority order with `can_parse()`
3. **Parsing**: First parser that matches extracts tool calls with `parse()`
4. **Validation**: Parser validates extracted tool calls with `validate()`
5. **Fallback**: If parsing fails, tries next parser in priority order

## Creating a Custom Parser

### Step 1: Define Your Parser Class

Create a new file `scripts/lib/my_model_parser.py`:

```python
from lib.tool_parsers import ToolParserBase, parser_registry

class MyModelParser(ToolParserBase):
    """Parser for my custom model format"""

    def can_parse(self, response: str, model_name: str = None) -> bool:
        """Detect if this parser can handle the response"""
        # Check for your model's characteristic format
        if model_name == "my-model" and "<TOOL>" in response:
            return True
        return False

    def parse(self, response: str, **kwargs) -> Optional[List[Dict]]:
        """Extract tool calls from response"""
        try:
            # Your parsing logic here
            tool_calls = self._extract_tools(response)

            # Validate before returning
            if self.validate(tool_calls):
                return tool_calls
            return None
        except Exception as e:
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Verify tool calls are well-formed"""
        if not isinstance(tool_calls, list):
            return False

        for tool_call in tool_calls:
            if not isinstance(tool_call, dict):
                return False
            # Add your validation logic

        return True

    def _extract_tools(self, response: str) -> List[Dict]:
        """Internal: Extract tool calls from your format"""
        # Implementation specific to your model's format
        pass
```

### Step 2: Set Priority

Priority determines fallback order. Higher priority = checked first:

```python
# Default priorities:
# - OpenAI (100): Most common, check first
# - Commentary (50): Many models support this
# - Custom (25): Model-specific formats
# - Fallback (1): Last resort

class MyModelParser(ToolParserBase):
    priority = 35  # Check after commentary, before custom
```

**Priority Guidelines**:

- `90-100`: Use if format is very reliable (multiple models support it)
- `50-80`: Standard format shared by several models
- `25-50`: Model-specific format
- `10-24`: Rare or experimental format
- `1-10`: Fallback parsers (should return something useful)

### Step 3: Register with Registry

```python
# Option 1: Manual registration
from lib.tool_parsers import parser_registry

parser = MyModelParser()
parser_registry.register(parser, priority=35)

# Option 2: Automatic registration (via import in main.ts)
# Just import your parser, registration happens automatically

# Option 3: Decorator pattern (planned for v3.0)
# @parser_registry.register(priority=35)
# class MyModelParser(ToolParserBase):
#     ...
```

## Example: Adding Support for DeepSeek Model

Suppose DeepSeek outputs tools in a special XML format:

```xml
<tool_calls>
  <call id="1">
    <name>read_file</name>
    <arguments>{"path": "/path/to/file"}</arguments>
  </call>
</tool_calls>
```

Create `scripts/lib/deepseek_parser.py`:

```python
import json
import xml.etree.ElementTree as ET
from typing import Optional, List, Dict
from lib.tool_parsers import ToolParserBase, parser_registry

class DeepSeekParser(ToolParserBase):
    """Parser for DeepSeek model XML tool call format"""

    def can_parse(self, response: str, model_name: str = None) -> bool:
        """Check if response contains DeepSeek tool XML"""
        return "<tool_calls>" in response and "</tool_calls>" in response

    def parse(self, response: str, **kwargs) -> Optional[List[Dict]]:
        """Extract tools from DeepSeek XML format"""
        try:
            # Validate input size
            self._validate_json_size(response)

            # Find XML block
            start = response.find("<tool_calls>")
            end = response.find("</tool_calls>") + len("</tool_calls>")

            if start == -1 or end == -1:
                return None

            xml_str = response[start:end]
            root = ET.fromstring(xml_str)

            tool_calls = []
            for call in root.findall(".//call"):
                tool_id = call.get("id", "")
                name = call.findtext("name", "")
                args_str = call.findtext("arguments", "{}")

                try:
                    arguments = json.loads(args_str)
                except json.JSONDecodeError:
                    continue

                tool_calls.append({
                    "id": tool_id,
                    "type": "tool_use",
                    "name": name,
                    "input": arguments
                })

            if self.validate(tool_calls):
                return tool_calls
            return None

        except Exception:
            return None

    def validate(self, tool_calls: List[Dict]) -> bool:
        """Validate DeepSeek tool format"""
        if not isinstance(tool_calls, list):
            return False

        for tool in tool_calls:
            if not isinstance(tool, dict):
                return False
            if not all(k in tool for k in ["name", "input"]):
                return False
            if not isinstance(tool.get("input"), dict):
                return False

        return True


# Register with registry
parser_registry.register(DeepSeekParser(), priority=35)
```

Then import in your main code:

```python
# In scripts/main.py or wherever you initialize parsers
from lib.deepseek_parser import DeepSeekParser

# Parser automatically registers on import
# or explicitly register:
# deepseek_parser = DeepSeekParser()
# parser_registry.register(deepseek_parser, priority=35)
```

## Best Practices

### 1. Input Validation

Always validate input size to prevent DoS:

```python
def parse(self, response: str, **kwargs) -> Optional[List[Dict]]:
    try:
        # Validate size (prevents 1GB+ JSON DoS)
        self._validate_json_size(response)  # Checks 1MB limit

        # Validate timeout (prevents infinite loops)
        start_time = time.time()

        # Your parsing logic here...

        # Check timeout
        self._validate_timeout(start_time)  # Checks 100ms limit

    except Exception:
        return None
```

### 2. Graceful Degradation

Return `None` on any error, never raise exceptions:

```python
def parse(self, response: str, **kwargs) -> Optional[List[Dict]]:
    try:
        # Parsing logic
        return tool_calls
    except json.JSONDecodeError:
        # Log but don't raise
        return None
    except Exception:
        # Catch-all for any parsing errors
        return None
```

### 3. Type Consistency

Always return consistent types:

```python
# Good: List[Dict] or None
def parse(self, response: str) -> Optional[List[Dict]]:
    return [{"name": "tool1", "input": {}}]
    # or return None

# Avoid: Returning different types
def parse(self, response: str):
    if success:
        return [{"tool": "call"}]
    else:
        return False  # Inconsistent!
```

### 4. Performance

Aim for <10ms parse time:

```python
import time

def parse(self, response: str) -> Optional[List[Dict]]:
    start = time.time()

    # Your parsing logic here

    elapsed = (time.time() - start) * 1000  # Convert to ms
    if elapsed > 100:
        # Log warning if parsing too slow
        print(f"Warning: {self.__class__.__name__} took {elapsed:.1f}ms")

    return tool_calls
```

### 5. Priority Selection

Choose priority carefully:

```python
# Priority by characteristics of your format:

# If format is shared by multiple models:
priority = 60  # High priority

# If format is model-specific:
priority = 35  # Medium priority

# If format is experimental/rare:
priority = 15  # Low priority

# Only as absolute last resort:
priority = 1   # Fallback level
```

## Testing Your Parser

### Unit Tests

Create `tests/unit/test_my_model_parser.py`:

```python
import unittest
from lib.my_model_parser import MyModelParser

class TestMyModelParser(unittest.TestCase):
    def setUp(self):
        self.parser = MyModelParser()

    def test_can_parse_valid_format(self):
        """Should detect valid format"""
        response = "<TOOL>some_tool</TOOL>"
        self.assertTrue(self.parser.can_parse(response))

    def test_parse_single_tool(self):
        """Should extract single tool"""
        response = '<TOOL>{"name": "read", "input": {"path": "/x"}}</TOOL>'
        result = self.parser.parse(response)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "read")

    def test_parse_multiple_tools(self):
        """Should extract multiple tools"""
        # Test data
        pass

    def test_invalid_json_rejects(self):
        """Should reject invalid JSON"""
        response = '<TOOL>{"invalid: json}</TOOL>'
        result = self.parser.parse(response)
        self.assertIsNone(result)

    def test_validates_output(self):
        """Should validate before returning"""
        # Test validation logic
        pass
```

### Integration Tests

Test with circuit breaker:

```python
from lib.circuit_breaker import CircuitBreaker
from lib.tool_parsers import parser_registry

def test_parser_with_circuit_breaker():
    """Test parser works with circuit breaker"""
    breaker = CircuitBreaker()

    def parse_with_breaker(response):
        return breaker.call(
            parser_registry.parse_with_fallback,
            response
        )

    response = '<TOOL>{"name": "read", "input": {}}</TOOL>'
    result = parse_with_breaker(response)
    assert result is not None
```

## Monitoring

### Performance Metrics

Monitor parser overhead:

```python
import time
from lib.tool_parsers import parser_registry

response = "..."

start = time.time()
result = parser_registry.parse_with_fallback(response)
elapsed = (time.time() - start) * 1000  # ms

print(f"Parser overhead: {elapsed:.2f}ms")
# Target: <10ms
```

### Debugging

Enable debug logging:

```python
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("tool_parsers")

# Parser logs which one succeeded
result = parser_registry.parse_with_fallback(response)
```

## Migration Guide

### From Hardcoded Parsers

If you have hardcoded parser logic:

```python
# Before: Hardcoded if/elif chain
def parse_tool_call(response):
    if "<TOOL>" in response:
        return parse_commentary(response)
    elif "tool_calls" in response:
        return parse_openai(response)
    else:
        return parse_custom(response)
```

Convert to plugin system:

```python
# After: Use parser registry
from lib.tool_parsers import parser_registry

def parse_tool_call(response):
    return parser_registry.parse_with_fallback(response)
```

## API Reference

### ToolParserBase

Base class for all parsers.

**Methods**:

```python
def can_parse(self, response: Union[str, Dict, None]) -> bool:
    """Check if parser can handle this response"""

def parse(self, response: Union[str, Dict, None], **kwargs) -> Optional[List[Dict]]:
    """Extract tool calls from response"""

def validate(self, tool_calls: List[Dict]) -> bool:
    """Validate extracted tool calls"""

def _validate_json_size(self, text: str) -> None:
    """Check JSON size doesn't exceed limit (1MB)"""

def _validate_timeout(self, start_time: float) -> None:
    """Check parsing doesn't exceed timeout (100ms)"""
```

### ParserRegistry

Central registry managing parsers.

**Methods**:

```python
def register(self, parser: ToolParserBase, priority: int = 50) -> None:
    """Register a parser with priority"""

def get_ordered_parsers(self) -> List[ToolParserBase]:
    """Get parsers sorted by priority (highest first)"""

def parse_with_fallback(self, response: Union[str, Dict, None]) -> Optional[Union[List[Dict], Dict]]:
    """Try parsers in priority order until one succeeds"""
```

## Troubleshooting

### Parser Never Called

**Problem**: Your parser's `can_parse()` returns True but `parse()` is never called.

**Solution**: Check priority ordering:

```python
# Check parser priorities
from lib.tool_parsers import parser_registry

for parser in parser_registry.get_ordered_parsers():
    priority = parser_registry.get_priority(parser)
    print(f"{parser.__class__.__name__}: priority={priority}")

# Your parser should appear in order
```

### Parsing Returns None

**Problem**: `parse()` returns `None` when it should return tool calls.

**Solution**: Debug with logging:

```python
def parse(self, response: str) -> Optional[List[Dict]]:
    print(f"Input: {response[:100]}...")

    try:
        # Parsing logic
        result = extract_tools(response)
        print(f"Extracted: {result}")

        if not self.validate(result):
            print("Validation failed")
            return None

        print(f"Success: {result}")
        return result
    except Exception as e:
        print(f"Error: {e}")
        return None
```

### Performance Issues

**Problem**: Parser is slow (>10ms).

**Solution**: Profile and optimize:

```python
import time

def parse(self, response: str) -> Optional[List[Dict]]:
    t0 = time.time()

    # Step 1
    step1_time = (time.time() - t0) * 1000

    # Step 2
    step2_time = (time.time() - (t0 + step1_time/1000)) * 1000

    print(f"Step 1: {step1_time:.2f}ms, Step 2: {step2_time:.2f}ms")
```

## See Also

- `scripts/lib/tool_parsers.py` - Implementation
- `tests/unit/test_tool_parsers.py` - Unit tests
- `tests/integration/test_parser_failover.py` - Integration tests
- `docs/development/circuit-breaker-guide.md` - Circuit breaker integration
