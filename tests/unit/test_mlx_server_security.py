#!/usr/bin/env python3
"""
Unit Tests: MLX Server Security & Code Quality (Phase 1.1)

Tests security patterns and code quality of the restored mlx-server.py file.
This complements the bash and Node.js integration tests with Python-specific checks.

Expected to FAIL until implementation is complete (TDD Red Phase)
"""

import os
import re
import sys
import ast
import unittest
from pathlib import Path

# ANSI color codes
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

class MLXServerSecurityTests(unittest.TestCase):
    """Security and code quality tests for mlx-server.py"""

    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        cls.repo_root = Path(__file__).parent.parent.parent
        cls.dest_file = cls.repo_root / 'scripts' / 'mlx-server.py'
        cls.archive_file = cls.repo_root / 'scripts' / 'archive' / 'mlx-server.py'

        # Read file content if it exists
        cls.content = None
        cls.ast_tree = None
        if cls.dest_file.exists():
            with open(cls.dest_file, 'r', encoding='utf-8') as f:
                cls.content = f.read()
            try:
                cls.ast_tree = ast.parse(cls.content)
            except SyntaxError as e:
                print(f"{Colors.YELLOW}Warning: Could not parse file (syntax error): {e}{Colors.NC}")

    def test_file_exists(self):
        """Test that the restored file exists"""
        self.assertTrue(
            self.dest_file.exists(),
            f"File not found at {self.dest_file}"
        )

    def test_file_is_readable(self):
        """Test that the file is readable"""
        self.assertIsNotNone(
            self.content,
            "File could not be read"
        )

    def test_valid_python_syntax(self):
        """Test that the file contains valid Python syntax"""
        self.assertIsNotNone(
            self.ast_tree,
            "File contains syntax errors (could not parse AST)"
        )

    def test_no_hardcoded_api_keys(self):
        """Test that no hardcoded API keys are present"""
        if self.content is None:
            self.skipTest("File not readable")

        # Pattern for Anthropic API keys
        api_key_pattern = re.compile(r'sk-[a-zA-Z0-9]{48}')
        matches = api_key_pattern.findall(self.content)

        self.assertEqual(
            len(matches), 0,
            f"Found {len(matches)} potential hardcoded API key(s): {matches[:3]}"
        )

    def test_no_hardcoded_passwords(self):
        """Test that no hardcoded passwords are present"""
        if self.content is None:
            self.skipTest("File not readable")

        # Patterns for common password assignments
        password_patterns = [
            r'password\s*=\s*["\'][^"\']+["\']',
            r'PASSWORD\s*=\s*["\'][^"\']+["\']',
            r'pwd\s*=\s*["\'][^"\']+["\']',
        ]

        for pattern in password_patterns:
            matches = re.findall(pattern, self.content, re.IGNORECASE)
            self.assertEqual(
                len(matches), 0,
                f"Found potential hardcoded password(s) with pattern '{pattern}': {matches}"
            )

    def test_no_hardcoded_tokens(self):
        """Test that no hardcoded tokens are present"""
        if self.content is None:
            self.skipTest("File not readable")

        # Pattern for GitHub tokens, JWT tokens, etc.
        token_patterns = [
            r'ghp_[a-zA-Z0-9]{36}',  # GitHub Personal Access Token
            r'gho_[a-zA-Z0-9]{36}',  # GitHub OAuth Token
            r'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*',  # JWT
        ]

        for pattern in token_patterns:
            matches = re.findall(pattern, self.content)
            self.assertEqual(
                len(matches), 0,
                f"Found potential hardcoded token(s) with pattern '{pattern}'"
            )

    def test_uses_environment_variables(self):
        """Test that configuration uses environment variables"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertTrue(
            'os.environ.get' in self.content or 'os.getenv' in self.content,
            "Should use os.environ.get() or os.getenv() for configuration"
        )

    def test_uses_pathlib(self):
        """Test that file uses pathlib.Path for path operations"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertTrue(
            'from pathlib import Path' in self.content or 'import pathlib' in self.content,
            "Should use pathlib.Path for safe path handling"
        )

    def test_no_os_system_calls(self):
        """Test that no os.system calls are present (shell injection risk)"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertNotIn(
            'os.system',
            self.content,
            "Should not use os.system (shell injection risk)"
        )

    def test_no_shell_true_subprocess(self):
        """Test that no subprocess calls with shell=True are present"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertNotIn(
            'shell=True',
            self.content,
            "Should not use subprocess with shell=True (shell injection risk)"
        )

    def test_no_eval_exec(self):
        """Test that no eval() or exec() calls are present"""
        if self.content is None:
            self.skipTest("File not readable")

        # Check for dangerous eval/exec (but allow MLX's mx.eval())
        lines = self.content.split('\n')
        dangerous_lines = []

        for i, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith('#'):
                continue

            # Check for eval( but exclude mx.eval() (MLX evaluation function)
            if 'eval(' in line and 'mx.eval(' not in line:
                dangerous_lines.append(f"Line {i}: {line.strip()}")

            # Check for exec( (no exceptions)
            if 'exec(' in line:
                dangerous_lines.append(f"Line {i}: {line.strip()}")

        self.assertEqual(
            len(dangerous_lines), 0,
            f"Found dangerous eval/exec calls: {dangerous_lines}"
        )

    def test_has_module_docstring(self):
        """Test that the file has a module-level docstring"""
        if self.ast_tree is None:
            self.skipTest("Could not parse AST")

        self.assertIsNotNone(
            ast.get_docstring(self.ast_tree),
            "File should have a module-level docstring"
        )

    def test_class_definitions_present(self):
        """Test that required classes are defined"""
        if self.ast_tree is None:
            self.skipTest("Could not parse AST")

        required_classes = {'MLXKVCacheManager', 'PromptCache', 'VLLMMLXServer'}
        found_classes = {
            node.name for node in ast.walk(self.ast_tree)
            if isinstance(node, ast.ClassDef)
        }

        missing_classes = required_classes - found_classes
        self.assertEqual(
            len(missing_classes), 0,
            f"Missing required classes: {missing_classes}"
        )

    def test_required_imports_present(self):
        """Test that required imports are present"""
        if self.content is None:
            self.skipTest("File not readable")

        required_imports = [
            'import mlx.core',
            'from fastapi import FastAPI',
            'import uvicorn',
            'import mlx_lm',
            'import json',
            'import asyncio',
            'import logging',
        ]

        missing_imports = []
        for import_stmt in required_imports:
            if import_stmt not in self.content:
                missing_imports.append(import_stmt)

        self.assertEqual(
            len(missing_imports), 0,
            f"Missing required imports: {missing_imports}"
        )

    def test_has_argparse_for_cli(self):
        """Test that argparse is used for CLI argument parsing"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertIn(
            'argparse',
            self.content,
            "Should use argparse for CLI argument parsing"
        )

    def test_has_proper_logging_setup(self):
        """Test that logging is properly configured"""
        if self.content is None:
            self.skipTest("File not readable")

        logging_patterns = [
            'logging.basicConfig',
            'logger = logging.getLogger',
        ]

        has_logging = any(pattern in self.content for pattern in logging_patterns)
        self.assertTrue(
            has_logging,
            "Should configure logging properly"
        )

    def test_has_cache_version_constant(self):
        """Test that CACHE_VERSION constant is defined"""
        if self.content is None:
            self.skipTest("File not readable")

        self.assertIn(
            'CACHE_VERSION',
            self.content,
            "Should define CACHE_VERSION constant for cache invalidation"
        )

    def test_no_debug_print_statements(self):
        """Test that no debug print statements are left in production code"""
        if self.content is None:
            self.skipTest("File not readable")

        # Look for print statements (excluding proper logging)
        lines = self.content.split('\n')
        debug_prints = []

        for i, line in enumerate(lines, 1):
            # Skip comments and docstrings
            stripped = line.strip()
            if stripped.startswith('#') or stripped.startswith('"""') or stripped.startswith("'''"):
                continue

            # Look for print() but allow specific patterns
            if 'print(' in line:
                # Allow print statements with descriptive messages (startup info, etc.)
                # Include performance report formatting (=, -, CACHE, PERFORMANCE, etc.)
                if not any(acceptable in line for acceptable in [
                    '✓', '⚠️', 'Warning:', 'Error:', 'MLX', 'CPU', 'GPU',
                    'Loading', 'Server', 'cache', 'available', 'CACHE', 'PERFORMANCE',
                    'REPORT', 'TOKEN', 'BREAKDOWN', 'METRICS', '"="', '"-"',
                    'Cache Hit', 'Speedup', 'Total', 'Avg', 'Cached', 'Eviction'
                ]):
                    debug_prints.append(f"Line {i}: {line.strip()}")

        # Allow some informational prints, but not too many
        self.assertLessEqual(
            len(debug_prints), 5,
            f"Found {len(debug_prints)} potential debug print statements: {debug_prints[:5]}"
        )

    def test_proper_error_handling(self):
        """Test that proper error handling is implemented"""
        if self.ast_tree is None:
            self.skipTest("Could not parse AST")

        # Count try-except blocks
        try_blocks = [
            node for node in ast.walk(self.ast_tree)
            if isinstance(node, ast.Try)
        ]

        self.assertGreater(
            len(try_blocks), 0,
            "Should have at least one try-except block for error handling"
        )

    def test_no_bare_except(self):
        """Test that no bare except clauses are used (bad practice)"""
        if self.ast_tree is None:
            self.skipTest("Could not parse AST")

        bare_excepts = []
        for node in ast.walk(self.ast_tree):
            if isinstance(node, ast.ExceptHandler):
                if node.type is None:
                    # Get line number if available
                    line = getattr(node, 'lineno', 'unknown')
                    bare_excepts.append(f"Line {line}")

        # Allow a few bare excepts (sometimes necessary), but not many
        self.assertLessEqual(
            len(bare_excepts), 3,
            f"Found {len(bare_excepts)} bare except clauses (should use specific exceptions): {bare_excepts}"
        )

    def test_file_permissions_correct(self):
        """Test that file has correct permissions (executable)"""
        if not self.dest_file.exists():
            self.skipTest("File does not exist")

        import stat
        file_stat = os.stat(self.dest_file)
        is_executable = bool(file_stat.st_mode & stat.S_IXUSR)

        self.assertTrue(
            is_executable,
            "File should be executable (chmod +x required)"
        )

    def test_python3_shebang(self):
        """Test that file has correct Python3 shebang"""
        if self.content is None:
            self.skipTest("File not readable")

        first_line = self.content.split('\n')[0]
        self.assertEqual(
            first_line,
            '#!/usr/bin/env python3',
            "First line should be '#!/usr/bin/env python3'"
        )

    def test_utf8_encoding(self):
        """Test that file uses UTF-8 encoding"""
        if not self.dest_file.exists():
            self.skipTest("File does not exist")

        try:
            with open(self.dest_file, 'r', encoding='utf-8') as f:
                f.read()
        except UnicodeDecodeError:
            self.fail("File should be UTF-8 encoded")

    def test_no_trailing_whitespace(self):
        """Test that file doesn't have excessive trailing whitespace"""
        if self.content is None:
            self.skipTest("File not readable")

        lines = self.content.split('\n')
        lines_with_trailing_space = [
            i for i, line in enumerate(lines, 1)
            if line.endswith(' ') or line.endswith('\t')
        ]

        # Allow some trailing whitespace, but not excessive
        self.assertLessEqual(
            len(lines_with_trailing_space), 10,
            f"Found {len(lines_with_trailing_space)} lines with trailing whitespace"
        )

    def test_consistent_indentation(self):
        """Test that file uses consistent indentation (spaces)"""
        if self.content is None:
            self.skipTest("File not readable")

        lines = self.content.split('\n')
        tab_lines = [
            i for i, line in enumerate(lines, 1)
            if '\t' in line and not line.strip().startswith('#')
        ]

        # Python should use spaces, not tabs
        self.assertEqual(
            len(tab_lines), 0,
            f"Found {len(tab_lines)} lines with tabs (should use spaces): {tab_lines[:5]}"
        )


class MLXServerIntegrationTests(unittest.TestCase):
    """Integration tests for config and documentation"""

    @classmethod
    def setUpClass(cls):
        """Set up test environment"""
        cls.repo_root = Path(__file__).parent.parent.parent

    def test_example_config_updated(self):
        """Test that example config includes legacy backend documentation"""
        config_path = self.repo_root / '.anyclauderc.example.json'
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()

        has_legacy_reference = (
            'mlx-server' in content or
            '"mlx"' in content or
            'legacy' in content.lower()
        )

        self.assertTrue(
            has_legacy_reference,
            "Example config should document legacy MLX backend"
        )

    def test_production_backend_unaffected(self):
        """Test that production backend still exists and is referenced"""
        config_path = self.repo_root / '.anyclauderc.example.json'
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()

        self.assertIn(
            'mlx-textgen-server.sh',
            content,
            "Example config should still reference production backend"
        )

    def test_migration_documentation_exists(self):
        """Test that migration documentation was created"""
        doc_path = self.repo_root / 'docs' / 'guides' / 'mlx-migration.md'
        self.assertTrue(
            doc_path.exists(),
            "Should create docs/guides/mlx-migration.md"
        )

    def test_migration_doc_explains_differences(self):
        """Test that migration doc explains key differences"""
        doc_path = self.repo_root / 'docs' / 'guides' / 'mlx-migration.md'
        if not doc_path.exists():
            self.skipTest("Migration doc does not exist")

        with open(doc_path, 'r', encoding='utf-8') as f:
            content = f.read()

        self.assertIn('mlx-server', content.lower())
        self.assertIn('mlx-textgen', content.lower())
        self.assertTrue(
            'migration' in content.lower() or 'difference' in content.lower(),
            "Migration doc should explain differences between versions"
        )

    def test_archive_readme_updated(self):
        """Test that archive README documents MLX servers"""
        readme_path = self.repo_root / 'scripts' / 'archive' / 'README.md'
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()

        has_mlx_reference = (
            'mlx-server' in content.lower() or
            'mlx-server' in content.lower()
        )

        self.assertTrue(
            has_mlx_reference,
            "Archive README should document MLX server files"
        )

    def test_changelog_updated(self):
        """Test that CHANGELOG mentions restoration"""
        changelog_path = self.repo_root / 'CHANGELOG.md'
        with open(changelog_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check first 100 lines for recent changes (changelog entries are newest-first)
        lines = content.split('\n')
        recent_content = '\n'.join(lines[:100])

        has_restoration_mention = bool(re.search(
            r'mlx-server|restore.*mlx|legacy.*mlx',
            recent_content,
            re.IGNORECASE
        ))

        self.assertTrue(
            has_restoration_mention,
            "CHANGELOG should document MLX server restoration"
        )


def run_tests():
    """Run all tests with colored output"""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(MLXServerSecurityTests))
    suite.addTests(loader.loadTestsFromTestCase(MLXServerIntegrationTests))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary with colors
    print('\n' + '=' * 60)
    print('Test Summary')
    print('=' * 60)
    print(f'Total tests: {result.testsRun}')
    print(f'{Colors.GREEN}Passed: {result.testsRun - len(result.failures) - len(result.errors)}{Colors.NC}')
    print(f'{Colors.RED}Failed: {len(result.failures) + len(result.errors)}{Colors.NC}')

    if result.wasSuccessful():
        print(f'\n{Colors.GREEN}✓ All tests passed!{Colors.NC}')
        return 0
    else:
        print(f'\n{Colors.RED}✗ Tests failed!{Colors.NC}')
        print('This is expected in TDD Red phase.')
        print('\nNext steps:')
        print('1. Implement the restoration script')
        print('2. Fix any security issues found')
        print('3. Re-run this test suite')
        return 1


if __name__ == '__main__':
    sys.exit(run_tests())
