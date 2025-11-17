#!/usr/bin/env python3
"""
Unit Tests: ConfigValidator - Configuration Validation

Tests for the config validator module that validates environment variables,
model paths, port conflicts, and dependency checks.

Expected to FAIL until ConfigValidator implementation is complete (TDD Red Phase)
"""

import unittest
import sys
import os
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Optional, Dict, Any

# Add scripts directory to path
scripts_path = Path(__file__).parent.parent.parent / 'scripts'
sys.path.insert(0, str(scripts_path))

# This import will fail until implementation is complete
try:
    from lib.config_validator import ConfigValidator, ValidationError, DependencyError
except ImportError:
    class ConfigValidator:
        def __init__(self, *args, **kwargs):
            raise NotImplementedError("ConfigValidator not yet implemented")

    class ValidationError(Exception):
        pass

    class DependencyError(Exception):
        pass


class TestConfigValidatorBasics(unittest.TestCase):
    """Test basic config validator functionality"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    def test_init_creates_config_validator(self):
        """Test that initialization creates a valid config validator"""
        self.assertIsNotNone(self.validator)

    def test_validate_port_valid_port(self):
        """Test that valid port numbers are accepted"""
        # Typical HTTP ports
        self.assertTrue(self.validator.validate_port(8080))
        self.assertTrue(self.validator.validate_port(8000))
        self.assertTrue(self.validator.validate_port(3000))

    def test_validate_port_invalid_port(self):
        """Test that invalid port numbers are rejected"""
        with self.assertRaises(ValidationError):
            self.validator.validate_port(0)  # Too low

        with self.assertRaises(ValidationError):
            self.validator.validate_port(65536)  # Too high

        with self.assertRaises(ValidationError):
            self.validator.validate_port(-1)  # Negative

    def test_validate_port_privileged_warning(self):
        """Test that privileged ports (< 1024) generate warning"""
        result = self.validator.validate_port(80)

        self.assertTrue(result['valid'])
        self.assertIn('warning', result)
        self.assertIn('privileged', result['warning'].lower())


class TestConfigValidatorEnvironmentVariables(unittest.TestCase):
    """Test environment variable validation"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    def test_validate_env_var_required_present(self):
        """Test that required env vars pass when present"""
        with patch.dict(os.environ, {'MLX_MODEL': '/path/to/model'}):
            result = self.validator.validate_env_var(
                'MLX_MODEL',
                required=True
            )
            self.assertTrue(result['valid'])

    def test_validate_env_var_required_missing(self):
        """Test that missing required env vars fail"""
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValidationError):
                self.validator.validate_env_var(
                    'REQUIRED_VAR',
                    required=True
                )

    def test_validate_env_var_optional_missing(self):
        """Test that missing optional env vars don't fail"""
        with patch.dict(os.environ, {}, clear=True):
            result = self.validator.validate_env_var(
                'OPTIONAL_VAR',
                required=False
            )
            self.assertTrue(result['valid'])
            self.assertIn('default', result)

    def test_validate_env_var_integer_type(self):
        """Test that integer env vars are validated"""
        with patch.dict(os.environ, {'PORT': '8080'}):
            result = self.validator.validate_env_var(
                'PORT',
                var_type='int',
                min_value=1024,
                max_value=65535
            )
            self.assertTrue(result['valid'])
            self.assertEqual(result['value'], 8080)

    def test_validate_env_var_integer_invalid(self):
        """Test that non-integer values are rejected"""
        with patch.dict(os.environ, {'PORT': 'not-a-number'}):
            with self.assertRaises(ValidationError):
                self.validator.validate_env_var('PORT', var_type='int')

    def test_validate_env_var_range_validation(self):
        """Test that values outside range are rejected"""
        with patch.dict(os.environ, {'TIMEOUT': '10'}):
            with self.assertRaises(ValidationError):
                self.validator.validate_env_var(
                    'TIMEOUT',
                    var_type='int',
                    min_value=60,
                    max_value=300
                )

    def test_validate_env_var_boolean_type(self):
        """Test that boolean env vars are validated"""
        test_cases = [
            ('1', True),
            ('true', True),
            ('TRUE', True),
            ('yes', True),
            ('0', False),
            ('false', False),
            ('FALSE', False),
            ('no', False),
        ]

        for env_value, expected in test_cases:
            with patch.dict(os.environ, {'ENABLE_CACHE': env_value}):
                result = self.validator.validate_env_var(
                    'ENABLE_CACHE',
                    var_type='bool'
                )
                self.assertEqual(result['value'], expected)


class TestConfigValidatorModelPath(unittest.TestCase):
    """Test model path validation"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('os.access')
    @patch('os.listdir')
    def test_validate_model_path_exists(self, mock_listdir, mock_access, mock_isdir, mock_exists):
        """Test that existing model paths are validated"""
        mock_exists.return_value = True
        mock_isdir.return_value = True
        mock_access.return_value = True
        mock_listdir.return_value = ['config.json', 'tokenizer.json', 'model.safetensors']

        result = self.validator.validate_model_path('/path/to/model')

        self.assertTrue(result['valid'])
        self.assertTrue(result['exists'])

    @patch('os.path.exists')
    def test_validate_model_path_not_exists(self, mock_exists):
        """Test that non-existent paths are rejected"""
        mock_exists.return_value = False

        with self.assertRaises(ValidationError):
            self.validator.validate_model_path('/nonexistent/path')

    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('os.path.isfile')
    def test_validate_model_path_file_instead_of_dir(self, mock_isfile, mock_isdir, mock_exists):
        """Test that file paths are rejected when directory expected"""
        mock_exists.return_value = True
        mock_isdir.return_value = False
        mock_isfile.return_value = True

        with self.assertRaises(ValidationError):
            self.validator.validate_model_path('/path/to/file.txt')

    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('os.access')
    def test_validate_model_path_not_readable(self, mock_access, mock_isdir, mock_exists):
        """Test that unreadable paths are rejected"""
        mock_exists.return_value = True
        mock_isdir.return_value = True
        mock_access.return_value = False  # Not readable

        with self.assertRaises(ValidationError):
            self.validator.validate_model_path('/path/to/unreadable')

    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('os.access')
    @patch('os.listdir')
    def test_validate_model_path_contains_required_files(self, mock_listdir, mock_access, mock_isdir, mock_exists):
        """Test that model directory contains required files"""
        mock_exists.return_value = True
        mock_isdir.return_value = True
        mock_access.return_value = True
        mock_listdir.return_value = [
            'config.json',
            'tokenizer.json',
            'model.safetensors',
            'model.safetensors.index.json'
        ]

        result = self.validator.validate_model_path('/path/to/model')

        self.assertTrue(result['valid'])
        self.assertTrue(result['has_config'])
        self.assertTrue(result['has_tokenizer'])
        self.assertTrue(result['has_weights'])

    @patch('os.path.exists')
    @patch('os.path.isdir')
    @patch('os.listdir')
    def test_validate_model_path_missing_required_files(self, mock_listdir, mock_isdir, mock_exists):
        """Test that model directory without required files fails"""
        mock_exists.return_value = True
        mock_isdir.return_value = True
        mock_listdir.return_value = ['readme.md']  # Missing config, tokenizer, weights

        with self.assertRaises(ValidationError):
            self.validator.validate_model_path('/path/to/invalid-model')


class TestConfigValidatorPortConflicts(unittest.TestCase):
    """Test port conflict detection"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    @patch('socket.socket')
    def test_check_port_available_port_free(self, mock_socket):
        """Test that available ports are detected"""
        mock_sock = Mock()
        mock_sock.connect_ex.return_value = 1  # Connection refused = port free
        mock_socket.return_value.__enter__.return_value = mock_sock

        result = self.validator.check_port_available(8080)

        self.assertTrue(result['available'])

    @patch('socket.socket')
    def test_check_port_available_port_in_use(self, mock_socket):
        """Test that in-use ports are detected"""
        mock_sock = Mock()
        mock_sock.connect_ex.return_value = 0  # Connection successful = port in use
        mock_socket.return_value.__enter__.return_value = mock_sock

        result = self.validator.check_port_available(8080)

        self.assertFalse(result['available'])
        self.assertIn('in_use', result)

    @patch('socket.socket')
    def test_check_port_available_timeout(self, mock_socket):
        """Test that port check handles timeouts"""
        mock_sock = Mock()
        mock_sock.connect_ex.side_effect = TimeoutError("Timeout")
        mock_socket.return_value.__enter__.return_value = mock_sock

        # Timeout should be treated as "available" (fail open)
        result = self.validator.check_port_available(8080)
        self.assertTrue(result['available'])

    def test_find_available_port_in_range(self):
        """Test finding an available port in a range"""
        with patch.object(self.validator, 'check_port_available') as mock_check:
            # First 3 ports in use, 4th available
            mock_check.side_effect = [
                {'available': False},
                {'available': False},
                {'available': False},
                {'available': True}
            ]

            result = self.validator.find_available_port(8080, 8090)

            self.assertTrue(result['found'])
            self.assertEqual(result['port'], 8083)  # 4th attempt

    def test_find_available_port_none_available(self):
        """Test when no ports available in range"""
        with patch.object(self.validator, 'check_port_available') as mock_check:
            mock_check.return_value = {'available': False}

            result = self.validator.find_available_port(8080, 8082)

            self.assertFalse(result['found'])


class TestConfigValidatorDependencies(unittest.TestCase):
    """Test dependency checks"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    def test_check_dependency_installed(self):
        """Test that installed dependencies are detected"""
        with patch('importlib.import_module') as mock_import:
            mock_import.return_value = Mock()  # Module exists

            result = self.validator.check_dependency('psutil')

            self.assertTrue(result['installed'])
            self.assertIn('version', result)

    def test_check_dependency_not_installed(self):
        """Test that missing dependencies are detected"""
        with patch('importlib.import_module') as mock_import:
            mock_import.side_effect = ImportError("No module named 'fake_module'")

            result = self.validator.check_dependency('fake_module')

            self.assertFalse(result['installed'])

    def test_check_all_dependencies(self):
        """Test checking all required dependencies"""
        required_deps = ['psutil', 'mlx', 'mlx_lm', 'safetensors']

        result = self.validator.check_all_dependencies(required_deps)

        self.assertIn('all_installed', result)
        self.assertIn('missing', result)
        self.assertIsInstance(result['missing'], list)

    def test_check_dependency_version_requirement(self):
        """Test dependency version checking"""
        with patch('importlib.import_module') as mock_import:
            mock_module = Mock()
            mock_module.__version__ = '1.5.0'
            mock_import.return_value = mock_module

            result = self.validator.check_dependency(
                'psutil',
                min_version='1.0.0'
            )

            self.assertTrue(result['version_ok'])

    def test_check_dependency_version_too_old(self):
        """Test that old versions are rejected"""
        with patch('importlib.import_module') as mock_import:
            mock_module = Mock()
            mock_module.__version__ = '0.9.0'
            mock_import.return_value = mock_module

            with self.assertRaises(DependencyError):
                self.validator.check_dependency(
                    'psutil',
                    min_version='1.0.0'
                )


class TestConfigValidatorComplete(unittest.TestCase):
    """Test complete configuration validation"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    @patch.dict(os.environ, {
        'MLX_PORT': '8080',
        'KV_CACHE_WARMUP': '1'
    })
    @patch('socket.socket')
    @patch('lib.config_validator.importlib.import_module')
    def test_validate_complete_config_valid(
        self, mock_import, mock_socket
    ):
        """Test that valid complete config passes"""
        # Mock socket for port check
        mock_sock = Mock()
        mock_sock.connect_ex.return_value = 1  # Port free
        mock_socket.return_value.__enter__.return_value = mock_sock
        
        # Mock dependencies with __version__ attribute
        mock_module = Mock()
        mock_module.__version__ = '1.0.0'
        mock_import.return_value = mock_module

        result = self.validator.validate_complete_config()

        # Should be valid even without model path (it's optional)
        self.assertTrue(result['valid'])
        self.assertIn('environment_vars', result)
        self.assertIn('port', result)
        self.assertIn('dependencies', result)

    def test_validate_complete_config_multiple_errors(self):
        """Test that all validation errors are collected"""
        # Set invalid config to trigger errors
        with patch.dict(os.environ, {'MLX_MODEL': '/nonexistent/path', 'MLX_PORT': '99999'}, clear=True):
            with patch('os.path.exists', return_value=False):
                result = self.validator.validate_complete_config()

                self.assertFalse(result['valid'])
                self.assertGreater(len(result['errors']), 0)


class TestConfigValidatorEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions"""

    def setUp(self):
        """Set up test fixtures"""
        self.validator = ConfigValidator()

    def test_validate_port_boundary_values(self):
        """Test port validation at boundaries"""
        # Minimum valid port
        self.assertTrue(self.validator.validate_port(1024)['valid'])

        # Maximum valid port
        self.assertTrue(self.validator.validate_port(65535)['valid'])

    def test_validate_env_var_empty_string(self):
        """Test that empty string env var is treated as missing"""
        with patch.dict(os.environ, {'VAR': ''}):
            with self.assertRaises(ValidationError):
                self.validator.validate_env_var('VAR', required=True)

    def test_validate_env_var_whitespace_only(self):
        """Test that whitespace-only env var is treated as missing"""
        with patch.dict(os.environ, {'VAR': '   '}):
            with self.assertRaises(ValidationError):
                self.validator.validate_env_var('VAR', required=True)

    def test_validate_model_path_symlink(self):
        """Test that symlinks to model directories are accepted"""
        with patch('os.path.exists', return_value=True):
            with patch('os.path.isdir', return_value=True):
                with patch('os.access', return_value=True):
                    with patch('os.listdir', return_value=['config.json', 'tokenizer.json', 'model.safetensors']):
                        with patch('os.path.islink', return_value=True):
                            result = self.validator.validate_model_path('/path/to/symlink')
                            self.assertTrue(result['valid'])
                            self.assertIn('is_symlink', result)

    def test_check_dependency_no_version_attribute(self):
        """Test dependency check when module has no __version__"""
        with patch('importlib.import_module') as mock_import:
            mock_module = Mock(spec=[])  # No __version__ attribute
            mock_import.return_value = mock_module

            result = self.validator.check_dependency('module_without_version')

            self.assertTrue(result['installed'])
            self.assertEqual(result['version'], 'unknown')

    def test_validate_port_string_input(self):
        """Test that string port numbers are converted"""
        result = self.validator.validate_port('8080')

        self.assertTrue(result['valid'])
        self.assertEqual(result['port'], 8080)

    def test_validate_port_invalid_string(self):
        """Test that non-numeric strings are rejected"""
        with self.assertRaises(ValidationError):
            self.validator.validate_port('not-a-port')


if __name__ == '__main__':
    unittest.main()
