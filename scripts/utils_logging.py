#!/usr/bin/env python3
"""
Logging utilities for anyclaude Python scripts.

Provides structured logging, debug levels, and file output management similar to
the TypeScript debug.ts module. Integrates with environment variables for control.

Features:
- Structured logging with multiple levels
- Debug level control via ANYCLAUDE_DEBUG environment variable
- Optional log file output
- Colored console output (when appropriate)
- Performance metrics logging
"""

import logging
import sys
import os
from typing import Optional, Any, Dict
from pathlib import Path
from datetime import datetime
import json
from functools import wraps


class DebugLevel:
    """Debug level constants matching TypeScript debug.ts"""
    DISABLED = 0
    BASIC = 1
    VERBOSE = 2
    TRACE = 3


def get_debug_level() -> int:
    """
    Get the debug level from ANYCLAUDE_DEBUG environment variable.

    Returns:
        int: 0 (disabled), 1 (basic), 2 (verbose), or 3 (trace)

    Environment:
        ANYCLAUDE_DEBUG: Set to 0, 1, 2, or 3. Defaults to 0 if not set.
    """
    debug_value = os.environ.get("ANYCLAUDE_DEBUG", "0")

    try:
        level = int(debug_value)
        return max(0, min(3, level))  # Clamp to 0-3 range
    except ValueError:
        return 1  # Default to basic debug for any non-numeric value


def is_debug_enabled() -> bool:
    """Check if any debug mode is enabled."""
    return get_debug_level() > 0


def is_verbose_debug_enabled() -> bool:
    """Check if verbose debug mode (level 2) is enabled."""
    return get_debug_level() >= 2


def is_trace_debug_enabled() -> bool:
    """Check if trace debug mode (level 3) is enabled."""
    return get_debug_level() >= 3


def setup_logger(
    name: str,
    level: int = logging.INFO,
    log_file: Optional[str] = None,
    format_string: Optional[str] = None
) -> logging.Logger:
    """
    Set up a logger with optional file output.

    Args:
        name: Logger name (typically __name__ or module name)
        level: Logging level (default: INFO)
        log_file: Optional path to write logs to
        format_string: Custom format string for log messages

    Returns:
        logging.Logger: Configured logger instance

    Example:
        logger = setup_logger(__name__)
        logger.info("Application started")

        # With file output
        logger = setup_logger(
            "my_module",
            log_file="/tmp/my_app.log",
            level=logging.DEBUG
        )
    """
    if format_string is None:
        format_string = '[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'

    log_logger = logging.getLogger(name)

    # For debug() function support, always allow DEBUG level and filter at handler level
    effective_level = logging.DEBUG if get_debug_level() > 0 else level
    log_logger.setLevel(effective_level)

    # Remove existing handlers to avoid duplication
    log_logger.handlers = []

    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(effective_level)
    formatter = logging.Formatter(format_string)
    console_handler.setFormatter(formatter)
    log_logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        try:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_path)
            file_handler.setLevel(effective_level)
            file_handler.setFormatter(formatter)
            log_logger.addHandler(file_handler)
        except Exception as e:
            log_logger.warning(f"Failed to set up file logging to {log_file}: {e}")

    return log_logger


def debug(level: int, message: str, data: Optional[Any] = None) -> None:
    """
    Log a debug message at the specified level.

    Only logs if ANYCLAUDE_DEBUG is set to at least the specified level.

    Args:
        level: Minimum debug level required (1, 2, or 3)
        message: The message to log
        data: Optional data to append (dict, list, str, etc.)

    Example:
        debug(1, "Request received", {"path": "/v1/chat/completions"})
        debug(2, "Full request body", request_dict)
        debug(3, "Detailed trace", trace_data)
    """
    if get_debug_level() >= level:
        log = get_logger()
        if data is not None:
            # For trace level, show full objects with pretty printing
            # For lower levels, truncate to first 200 chars
            if isinstance(data, (dict, list)):
                if get_debug_level() >= 3:
                    data_str = json.dumps(data, indent=2, default=str)
                else:
                    data_str = json.dumps(data, separators=(',', ':'), default=str)[:200]
            else:
                data_str = str(data)[:200]

            log.debug(f"{message} {data_str}")
        else:
            log.debug(message)


def write_error_debug_file(
    status_code: int,
    request_info: Dict[str, Any],
    response_info: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Write debug information to a temporary file.

    Similar to TypeScript's writeDebugToTempFile, this writes HTTP error
    information to a JSON file for later analysis.

    Args:
        status_code: HTTP status code
        request_info: Dict with 'method', 'url', 'headers', 'body'
        response_info: Dict with 'statusCode', 'headers', 'body'

    Returns:
        str: Path to debug file, or None if not written

    Note:
        Only writes if ANYCLAUDE_DEBUG is enabled and status code is 4xx (not 429).
    """
    if not is_debug_enabled() or status_code == 429 or status_code < 400 or status_code >= 500:
        return None

    try:
        import tempfile
        import random
        import string

        timestamp = int(datetime.now().timestamp() * 1000)
        random_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        filename = f"anyclaude-debug-{timestamp}-{random_id}.json"
        filepath = Path(tempfile.gettempdir()) / filename

        debug_data = {
            "timestamp": datetime.now().isoformat(),
            "statusCode": status_code,
            "request": request_info,
            "response": response_info or None
        }

        with open(filepath, 'w') as f:
            json.dump(debug_data, f, indent=2, default=str)

        # Also write a simple error log
        error_log_path = Path(tempfile.gettempdir()) / "anyclaude-errors.log"
        with open(error_log_path, 'a') as f:
            f.write(f"[{datetime.now().isoformat()}] HTTP {status_code} - Debug: {filepath}\n")

        return str(filepath)

    except Exception as e:
        logger = logging.getLogger("anyclaude")
        logger.error(f"Failed to write debug file: {e}")
        return None


def log_debug_error(
    error_type: str,
    status_code: int,
    debug_file: Optional[str] = None,
    context: Optional[Dict[str, str]] = None
) -> None:
    """
    Log a debug error with context information.

    Args:
        error_type: Type of error (e.g., "HTTP", "Provider", "Streaming")
        status_code: HTTP status code
        debug_file: Path to debug file (if created)
        context: Optional context dict with 'provider' and/or 'model'
    """
    if not debug_file:
        return

    logger = logging.getLogger("anyclaude")
    message = f"{error_type} error"

    if context and 'provider' in context and 'model' in context:
        message += f" ({context['provider']}/{context['model']})"
    elif status_code:
        message += f" {status_code}"

    message += f" - Debug info written to: {debug_file}"
    logger.error(message)


def display_debug_startup() -> None:
    """Display debug mode startup information."""
    level = get_debug_level()
    if level > 0:
        logger = logging.getLogger("anyclaude")
        import tempfile

        tmp_dir = tempfile.gettempdir()
        logger.info("═" * 40)
        logger.info(f"ANYCLAUDE DEBUG MODE ENABLED (Level {level})")
        logger.info(f"Error log: {tmp_dir}/anyclaude-errors.log")
        logger.info(f"Debug files: {tmp_dir}/anyclaude-debug-*.json")

        if level >= 2:
            logger.info("Verbose: Full data structures will be displayed")
        if level >= 3:
            logger.info("Trace: All function calls and streaming events logged")

        logger.info("═" * 40)


def log_performance(name: str, duration_ms: float, details: Optional[Dict[str, Any]] = None) -> None:
    """
    Log performance metrics.

    Args:
        name: Name of operation being measured
        duration_ms: Duration in milliseconds
        details: Optional dict with additional performance details
    """
    if is_verbose_debug_enabled():
        logger = logging.getLogger("anyclaude")

        message = f"Performance: {name} took {duration_ms:.2f}ms"
        if details:
            message += f" {json.dumps(details)}"

        logger.debug(message)


def log_cache_hit(cache_type: str, key: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """
    Log cache hit information.

    Args:
        cache_type: Type of cache (e.g., "prompt", "kv", "embedding")
        key: Cache key identifier
        metadata: Optional cache metadata
    """
    if is_debug_enabled():
        logger = logging.getLogger("anyclaude")
        message = f"[Cache] HIT - {cache_type}: {key}"

        if metadata:
            message += f" {json.dumps(metadata)}"

        logger.debug(message)


def log_cache_miss(cache_type: str, key: str, reason: Optional[str] = None) -> None:
    """
    Log cache miss information.

    Args:
        cache_type: Type of cache (e.g., "prompt", "kv", "embedding")
        key: Cache key identifier
        reason: Optional reason for miss
    """
    if is_debug_enabled():
        logger = logging.getLogger("anyclaude")
        message = f"[Cache] MISS - {cache_type}: {key}"

        if reason:
            message += f" ({reason})"

        logger.debug(message)


class PerformanceTimer:
    """Context manager for measuring performance."""

    def __init__(self, name: str, log_level: int = 2):
        """
        Initialize performance timer.

        Args:
            name: Name of operation
            log_level: Minimum debug level to log (default: 2 for verbose)
        """
        self.name = name
        self.log_level = log_level
        self.start_time = None
        self.logger = logging.getLogger("anyclaude")

    def __enter__(self):
        """Start timing."""
        self.start_time = datetime.now()
        if is_verbose_debug_enabled():
            self.logger.debug(f"[Timer] Starting: {self.name}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """End timing and log duration."""
        if self.start_time:
            duration = (datetime.now() - self.start_time).total_seconds() * 1000

            if exc_type:
                self.logger.error(
                    f"[Timer] {self.name} failed after {duration:.2f}ms: {exc_type.__name__}"
                )
            elif get_debug_level() >= self.log_level:
                self.logger.debug(f"[Timer] {self.name} completed in {duration:.2f}ms")

    def checkpoint(self, label: str) -> float:
        """Log a checkpoint and return elapsed time."""
        if self.start_time:
            elapsed = (datetime.now() - self.start_time).total_seconds() * 1000
            if is_verbose_debug_enabled():
                self.logger.debug(f"[Timer] {self.name} @ {label}: {elapsed:.2f}ms")
            return elapsed
        return 0.0


def timing_decorator(log_level: int = 2):
    """
    Decorator to log function execution time.

    Args:
        log_level: Minimum debug level to log (default: 2 for verbose)

    Example:
        @timing_decorator()
        def my_function():
            # function code
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with PerformanceTimer(f"{func.__module__}.{func.__name__}", log_level):
                return func(*args, **kwargs)
        return wrapper
    return decorator


# Module-level logger - initialized on first use
def get_logger() -> logging.Logger:
    """
    Get the module-level logger.

    Returns:
        logging.Logger: The anyclaude logger instance
    """
    log = logging.getLogger("anyclaude")

    # Ensure it has handlers (only set up once)
    if not log.handlers:
        level = logging.DEBUG if get_debug_level() > 0 else logging.INFO
        log.setLevel(level)
        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(level)
        formatter = logging.Formatter('[%(asctime)s] [%(name)s] %(levelname)s: %(message)s')
        handler.setFormatter(formatter)
        log.addHandler(handler)

    return log


__all__ = [
    "DebugLevel",
    "get_debug_level",
    "is_debug_enabled",
    "is_verbose_debug_enabled",
    "is_trace_debug_enabled",
    "setup_logger",
    "get_logger",
    "debug",
    "write_error_debug_file",
    "log_debug_error",
    "display_debug_startup",
    "log_performance",
    "log_cache_hit",
    "log_cache_miss",
    "PerformanceTimer",
    "timing_decorator",
]
