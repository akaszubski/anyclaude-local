"""
Unit tests for schema validator (Issue #15)

Tests JSON Schema validation for tool calling with focus on:
- Required parameter validation
- Type checking
- Nested object validation
- Array validation
- Union types (oneOf, anyOf)
- Edge cases
- Performance (<10ms target)
- Error message clarity
"""

import unittest
import time
import json
import sys
from pathlib import Path

# Add scripts/lib to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts" / "lib"))

from schema_validator import SchemaValidator, ValidationResult, ValidationError


class TestBasicValidation(unittest.TestCase):
    """Test basic schema validation functionality"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_valid_simple_schema(self):
        """Test validation passes for valid simple schema"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt"},
            schema
        )

        self.assertTrue(result.is_valid)
        self.assertIsNone(result.error_message)
        self.assertEqual(result.tool_name, "Read")

    def test_missing_required_parameter(self):
        """Test validation fails when required parameter missing"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call(
            "Read",
            {},  # Missing file_path
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIn("file_path", result.error_message.lower())
        self.assertIn("required", result.error_message.lower())

    def test_type_mismatch(self):
        """Test validation fails on type mismatch"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "limit": {"type": "integer"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt", "limit": "not_a_number"},
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIn("type", result.error_message.lower())

    def test_optional_parameter(self):
        """Test optional parameters are accepted when missing"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "offset": {"type": "integer"}  # Optional
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt"},  # No offset
            schema
        )

        self.assertTrue(result.is_valid)

    def test_additional_properties_allowed(self):
        """Test additional properties are allowed by default"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt", "extra_param": "value"},
            schema
        )

        # By default, additional properties are allowed
        self.assertTrue(result.is_valid)

    def test_additional_properties_forbidden(self):
        """Test additional properties rejected when forbidden"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"],
            "additionalProperties": False
        }

        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt", "extra_param": "value"},
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIn("additional", result.error_message.lower())


class TestNestedObjects(unittest.TestCase):
    """Test validation of nested object structures"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_nested_object_valid(self):
        """Test valid nested object passes validation"""
        schema = {
            "type": "object",
            "properties": {
                "config": {
                    "type": "object",
                    "properties": {
                        "auth": {
                            "type": "object",
                            "properties": {
                                "token": {"type": "string"}
                            },
                            "required": ["token"]
                        }
                    },
                    "required": ["auth"]
                }
            },
            "required": ["config"]
        }

        result = self.validator.validate_tool_call(
            "Configure",
            {"config": {"auth": {"token": "abc123"}}},
            schema
        )

        self.assertTrue(result.is_valid)

    def test_nested_object_missing_field(self):
        """Test missing field in nested object fails validation"""
        schema = {
            "type": "object",
            "properties": {
                "config": {
                    "type": "object",
                    "properties": {
                        "auth": {
                            "type": "object",
                            "properties": {
                                "token": {"type": "string"}
                            },
                            "required": ["token"]
                        }
                    },
                    "required": ["auth"]
                }
            },
            "required": ["config"]
        }

        result = self.validator.validate_tool_call(
            "Configure",
            {"config": {"auth": {}}},  # Missing token
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIn("token", result.error_message.lower())


class TestArrayValidation(unittest.TestCase):
    """Test validation of array parameters"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_array_of_strings_valid(self):
        """Test array of strings passes validation"""
        schema = {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["files"]
        }

        result = self.validator.validate_tool_call(
            "ProcessFiles",
            {"files": ["file1.txt", "file2.txt"]},
            schema
        )

        self.assertTrue(result.is_valid)

    def test_array_type_mismatch(self):
        """Test array item type mismatch fails validation"""
        schema = {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["files"]
        }

        result = self.validator.validate_tool_call(
            "ProcessFiles",
            {"files": ["file1.txt", 123]},  # Invalid: number in array
            schema
        )

        self.assertFalse(result.is_valid)

    def test_array_of_objects_valid(self):
        """Test array of objects passes validation"""
        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "header": {"type": "string"},
                            "question": {"type": "string"}
                        },
                        "required": ["header", "question"]
                    }
                }
            },
            "required": ["questions"]
        }

        result = self.validator.validate_tool_call(
            "AskUserQuestion",
            {
                "questions": [
                    {"header": "Test", "question": "Is this valid?"}
                ]
            },
            schema
        )

        self.assertTrue(result.is_valid)

    def test_empty_array_valid(self):
        """Test empty array is valid when allowed"""
        schema = {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["files"]
        }

        result = self.validator.validate_tool_call(
            "ProcessFiles",
            {"files": []},
            schema
        )

        self.assertTrue(result.is_valid)


class TestUnionTypes(unittest.TestCase):
    """Test validation of union types (oneOf, anyOf)"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_oneof_string_or_number(self):
        """Test oneOf accepts either type"""
        schema = {
            "type": "object",
            "properties": {
                "value": {
                    "oneOf": [
                        {"type": "string"},
                        {"type": "number"}
                    ]
                }
            },
            "required": ["value"]
        }

        # Test string
        result1 = self.validator.validate_tool_call(
            "Test",
            {"value": "text"},
            schema
        )
        self.assertTrue(result1.is_valid)

        # Test number
        result2 = self.validator.validate_tool_call(
            "Test",
            {"value": 42},
            schema
        )
        self.assertTrue(result2.is_valid)

    def test_anyof_accepts_valid(self):
        """Test anyOf accepts when at least one matches"""
        schema = {
            "type": "object",
            "properties": {
                "data": {
                    "anyOf": [
                        {"type": "string", "minLength": 5},
                        {"type": "number", "minimum": 10}
                    ]
                }
            },
            "required": ["data"]
        }

        result = self.validator.validate_tool_call(
            "Test",
            {"data": "valid_string"},
            schema
        )

        self.assertTrue(result.is_valid)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and security limits"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_empty_schema(self):
        """Test empty schema allows any parameters"""
        schema = {"type": "object"}

        result = self.validator.validate_tool_call(
            "Test",
            {"any_param": "any_value"},
            schema
        )

        self.assertTrue(result.is_valid)

    def test_null_value(self):
        """Test null values are handled correctly"""
        schema = {
            "type": "object",
            "properties": {
                "optional_field": {"type": ["string", "null"]}
            }
        }

        result = self.validator.validate_tool_call(
            "Test",
            {"optional_field": None},
            schema
        )

        self.assertTrue(result.is_valid)

    def test_large_input_rejected(self):
        """Test validation rejects inputs exceeding size limit"""
        schema = {"type": "object"}

        # Create input exceeding 10KB limit
        large_input = {"data": "x" * (11 * 1024)}

        result = self.validator.validate_tool_call(
            "Test",
            large_input,
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIn("size limit", result.error_message.lower())

    def test_schema_complexity_limit(self):
        """Test schema with too many properties is rejected"""
        # Create schema with > 100 properties
        properties = {f"field_{i}": {"type": "string"} for i in range(101)}
        schema = {
            "type": "object",
            "properties": properties
        }

        with self.assertRaises(ValidationError) as context:
            self.validator.register_tool_schema("Test", schema)

        self.assertIn("properties", str(context.exception).lower())


class TestPerformance(unittest.TestCase):
    """Test validation performance meets <10ms target"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_simple_validation_under_1ms(self):
        """Test simple validation completes in <1ms"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        # Warm up
        self.validator.validate_tool_call("Read", {"file_path": "/tmp/test.txt"}, schema)

        # Measure
        start = time.perf_counter()
        result = self.validator.validate_tool_call(
            "Read",
            {"file_path": "/tmp/test.txt"},
            schema
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

        self.assertTrue(result.is_valid)
        self.assertLess(elapsed_ms, 1.0, f"Validation took {elapsed_ms:.2f}ms, expected <1ms")

    def test_complex_validation_under_10ms(self):
        """Test complex nested validation completes in <10ms"""
        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "header": {"type": "string"},
                            "question": {"type": "string"},
                            "options": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {"type": "string"},
                                        "description": {"type": "string"}
                                    },
                                    "required": ["label", "description"]
                                }
                            }
                        },
                        "required": ["header", "question", "options"]
                    }
                }
            },
            "required": ["questions"]
        }

        params = {
            "questions": [
                {
                    "header": "Test",
                    "question": "Is this valid?",
                    "options": [
                        {"label": "Yes", "description": "Valid"},
                        {"label": "No", "description": "Invalid"}
                    ]
                }
            ]
        }

        # Warm up
        self.validator.validate_tool_call("AskUserQuestion", params, schema)

        # Measure
        start = time.perf_counter()
        result = self.validator.validate_tool_call("AskUserQuestion", params, schema)
        elapsed_ms = (time.perf_counter() - start) * 1000

        self.assertTrue(result.is_valid)
        self.assertLess(elapsed_ms, 10.0, f"Validation took {elapsed_ms:.2f}ms, expected <10ms")

    def test_1000_validations_under_1_second(self):
        """Test 1000 validations complete in <1 second"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        # Warm up
        self.validator.validate_tool_call("Read", {"file_path": "/tmp/test.txt"}, schema)

        # Measure 1000 validations
        start = time.perf_counter()
        for i in range(1000):
            self.validator.validate_tool_call(
                "Read",
                {"file_path": f"/tmp/test{i}.txt"},
                schema
            )
        elapsed = time.perf_counter() - start

        self.assertLess(elapsed, 1.0, f"1000 validations took {elapsed:.2f}s, expected <1s")


class TestErrorMessages(unittest.TestCase):
    """Test error message clarity and usefulness"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_error_message_includes_tool_name(self):
        """Test error messages include tool name"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call("Read", {}, schema)

        self.assertFalse(result.is_valid)
        self.assertIn("Read", result.error_message)

    def test_error_message_includes_parameter_name(self):
        """Test error messages include parameter name"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        result = self.validator.validate_tool_call("Read", {}, schema)

        self.assertFalse(result.is_valid)
        self.assertIn("file_path", result.error_message)

    def test_error_path_extracted(self):
        """Test JSONPath to error is extracted"""
        schema = {
            "type": "object",
            "properties": {
                "config": {
                    "type": "object",
                    "properties": {
                        "token": {"type": "string"}
                    },
                    "required": ["token"]
                }
            },
            "required": ["config"]
        }

        result = self.validator.validate_tool_call(
            "Test",
            {"config": {}},
            schema
        )

        self.assertFalse(result.is_valid)
        self.assertIsNotNone(result.error_path)
        self.assertIn("config", result.error_path)


class TestStatistics(unittest.TestCase):
    """Test validation statistics tracking"""

    def setUp(self):
        """Initialize schema validator for each test"""
        self.validator = SchemaValidator(timeout_sec=5.0)

    def test_stats_tracking(self):
        """Test validation statistics are tracked correctly"""
        schema = {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            },
            "required": ["file_path"]
        }

        # Perform validations
        self.validator.validate_tool_call("Read", {"file_path": "/tmp/test.txt"}, schema)  # Pass
        self.validator.validate_tool_call("Read", {}, schema)  # Fail

        stats = self.validator.get_stats()

        self.assertEqual(stats['total_validations'], 2)
        self.assertEqual(stats['passed'], 1)
        self.assertEqual(stats['failed'], 1)
        self.assertEqual(stats['pass_rate'], 50.0)
        self.assertGreater(stats['avg_validation_time_ms'], 0)


if __name__ == '__main__':
    unittest.main()
