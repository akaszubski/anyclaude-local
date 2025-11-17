#!/usr/bin/env python3
"""
ConfigValidator: Configuration Validation for MLX Server

Validates environment variables, model paths, port availability,
and dependency requirements at server startup.

Prevents server startup with invalid configuration.
"""

import os
import socket
import importlib
from pathlib import Path
from typing import Optional, Dict, Any, List


class ValidationError(Exception):
    """Raised when configuration validation fails"""
    pass


class DependencyError(Exception):
    """Raised when required dependency is missing or too old"""
    pass


class ConfigValidator:
    """
    Configuration validator

    Features:
    - Environment variable validation (types, ranges)
    - Model path validation (existence, permissions, required files)
    - Port conflict detection
    - Dependency version checking
    - Complete config validation with error collection
    """

    def __init__(self):
        """Initialize config validator"""
        pass

    def validate_port(self, port: Any) -> Dict[str, Any]:
        """
        Validate port number

        Args:
            port: Port number (int or string)

        Returns:
            Dict with validation status and warnings

        Raises:
            ValidationError: If port is invalid
        """
        # Convert string to int if needed
        if isinstance(port, str):
            try:
                port = int(port)
            except ValueError:
                raise ValidationError(f"Port must be a number, got: {port}")

        # Validate range
        if port < 1 or port > 65535:
            raise ValidationError(f"Port must be between 1-65535, got: {port}")

        # Check for privileged ports
        result = {'valid': True, 'port': port}
        if port < 1024:
            result['warning'] = f"Port {port} is privileged (< 1024), may require root access"

        return result

    def validate_env_var(
        self,
        var_name: str,
        required: bool = False,
        var_type: str = 'str',
        min_value: Optional[int] = None,
        max_value: Optional[int] = None,
        default: Any = None
    ) -> Dict[str, Any]:
        """
        Validate environment variable

        Args:
            var_name: Environment variable name
            required: Whether variable is required
            var_type: Expected type ('str', 'int', 'bool')
            min_value: Minimum value for int type
            max_value: Maximum value for int type
            default: Default value if not set

        Returns:
            Dict with validation status and value

        Raises:
            ValidationError: If validation fails
        """
        value = os.environ.get(var_name)

        # Check if variable is set
        if value is None or value.strip() == '':
            if required:
                raise ValidationError(f"Required environment variable {var_name} is not set")
            return {
                'valid': True,
                'value': default,
                'default': True
            }

        # Validate type
        if var_type == 'int':
            try:
                value = int(value)
            except ValueError:
                raise ValidationError(f"{var_name} must be an integer, got: {value}")

            # Validate range
            if min_value is not None and value < min_value:
                raise ValidationError(
                    f"{var_name} must be >= {min_value}, got: {value}"
                )
            if max_value is not None and value > max_value:
                raise ValidationError(
                    f"{var_name} must be <= {max_value}, got: {value}"
                )

        elif var_type == 'bool':
            # Convert to boolean
            value_lower = value.lower()
            if value_lower in ('1', 'true', 'yes'):
                value = True
            elif value_lower in ('0', 'false', 'no'):
                value = False
            else:
                raise ValidationError(
                    f"{var_name} must be boolean (1/true/yes or 0/false/no), got: {value}"
                )

        return {
            'valid': True,
            'value': value
        }

    def validate_model_path(self, model_path: str) -> Dict[str, Any]:
        """
        Validate model path

        Args:
            model_path: Path to model directory

        Returns:
            Dict with validation status and details

        Raises:
            ValidationError: If model path is invalid
        """
        # Check existence
        if not os.path.exists(model_path):
            raise ValidationError("Model path validation failed: path does not exist")

        # Check if directory
        if not os.path.isdir(model_path):
            raise ValidationError("Model path validation failed: not a directory")

        # Check readable
        if not os.access(model_path, os.R_OK):
            raise ValidationError("Model path validation failed: not readable")

        # Check for required files
        files = os.listdir(model_path)
        has_config = any('config.json' in f for f in files)
        has_tokenizer = any('tokenizer' in f for f in files)
        has_weights = any('safetensors' in f or 'bin' in f for f in files)

        if not (has_config and has_tokenizer and has_weights):
            raise ValidationError("Model path validation failed: missing required files (config.json, tokenizer, or weights)")

        result = {
            'valid': True,
            'exists': True,
            'has_config': has_config,
            'has_tokenizer': has_tokenizer,
            'has_weights': has_weights
        }

        # Check if symlink
        if os.path.islink(model_path):
            result['is_symlink'] = True

        return result

    def check_port_available(self, port: int, timeout: float = 1.0) -> Dict[str, Any]:
        """
        Check if port is available

        Args:
            port: Port number to check
            timeout: Connection timeout in seconds

        Returns:
            Dict with availability status
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                result = sock.connect_ex(('localhost', port))

                if result == 0:
                    # Port is in use
                    return {
                        'available': False,
                        'in_use': True
                    }
                else:
                    # Port is free
                    return {
                        'available': True,
                        'in_use': False
                    }
        except (TimeoutError, OSError):
            # Timeout or other error - assume available
            return {
                'available': True,
                'in_use': False,
                'warning': 'Could not verify port status'
            }

    def find_available_port(self, start_port: int, end_port: int) -> Dict[str, Any]:
        """
        Find an available port in range

        Args:
            start_port: Start of port range
            end_port: End of port range (inclusive)

        Returns:
            Dict with found port or failure status
        """
        for port in range(start_port, end_port + 1):
            result = self.check_port_available(port)
            if result['available']:
                return {
                    'found': True,
                    'port': port
                }

        return {
            'found': False,
            'port': None
        }

    def check_dependency(
        self,
        module_name: str,
        min_version: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check if dependency is installed

        Args:
            module_name: Name of Python module
            min_version: Minimum required version (e.g., '1.0.0')

        Returns:
            Dict with installation status and version

        Raises:
            DependencyError: If version requirement not met
        """
        try:
            module = importlib.import_module(module_name)

            # Get version
            version = getattr(module, '__version__', 'unknown')

            result = {
                'installed': True,
                'version': version
            }

            # Check version requirement
            if min_version and version != 'unknown':
                version_ok = self._compare_versions(version, min_version)
                result['version_ok'] = version_ok

                if not version_ok:
                    raise DependencyError(
                        f"{module_name} version {version} is too old, "
                        f"requires >= {min_version}"
                    )

            return result

        except ImportError:
            return {
                'installed': False,
                'version': None
            }

    def _compare_versions(self, version: str, min_version: str) -> bool:
        """
        Compare version strings

        Args:
            version: Current version
            min_version: Minimum required version

        Returns:
            True if version >= min_version
        """
        try:
            # Simple version comparison (major.minor.patch)
            v_parts = [int(x) for x in version.split('.')[:3]]
            min_parts = [int(x) for x in min_version.split('.')[:3]]

            # Pad with zeros if needed
            while len(v_parts) < 3:
                v_parts.append(0)
            while len(min_parts) < 3:
                min_parts.append(0)

            return v_parts >= min_parts
        except (ValueError, AttributeError):
            # Can't parse versions - assume OK
            return True

    def check_all_dependencies(self, required_deps: List[str]) -> Dict[str, Any]:
        """
        Check all required dependencies

        Args:
            required_deps: List of required module names

        Returns:
            Dict with overall status and missing dependencies
        """
        missing = []

        for dep in required_deps:
            result = self.check_dependency(dep)
            if not result['installed']:
                missing.append(dep)

        return {
            'all_installed': len(missing) == 0,
            'missing': missing
        }

    def validate_complete_config(self) -> Dict[str, Any]:
        """
        Validate complete server configuration

        Returns:
            Dict with overall validation status and details
        """
        errors = []
        result = {
            'valid': True,
            'errors': errors,
            'environment_vars': {},
            'model_path': {},
            'port': {},
            'dependencies': {}
        }

        # Validate environment variables
        try:
            env_result = self.validate_env_var('MLX_MODEL', required=False)
            result['environment_vars']['MLX_MODEL'] = env_result
        except ValidationError as e:
            errors.append(str(e))
            result['valid'] = False

        try:
            port_result = self.validate_env_var(
                'MLX_PORT',
                required=False,
                var_type='int',
                min_value=1024,
                max_value=65535,
                default=8080
            )
            result['environment_vars']['MLX_PORT'] = port_result
        except ValidationError as e:
            errors.append(str(e))
            result['valid'] = False

        try:
            cache_result = self.validate_env_var(
                'KV_CACHE_WARMUP',
                required=False,
                var_type='bool',
                default=True
            )
            result['environment_vars']['KV_CACHE_WARMUP'] = cache_result
        except ValidationError as e:
            errors.append(str(e))
            result['valid'] = False

        # Validate model path if specified
        model_path = os.environ.get('MLX_MODEL')
        if model_path:
            try:
                model_result = self.validate_model_path(model_path)
                result['model_path'] = model_result
            except ValidationError as e:
                errors.append(str(e))
                result['valid'] = False

        # Validate port availability
        port = int(os.environ.get('MLX_PORT', '8080'))
        try:
            port_validation = self.validate_port(port)
            port_available = self.check_port_available(port)
            result['port'] = {**port_validation, **port_available}
        except ValidationError as e:
            errors.append(str(e))
            result['valid'] = False

        # Check dependencies
        required_deps = ['psutil', 'mlx', 'mlx_lm']
        deps_result = self.check_all_dependencies(required_deps)
        result['dependencies'] = deps_result

        if not deps_result['all_installed']:
            errors.append(f"Missing dependencies: {', '.join(deps_result['missing'])}")
            # Note: Don't set valid=False for missing deps, just warn

        return result
