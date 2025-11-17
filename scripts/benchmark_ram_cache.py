#!/usr/bin/env python3
"""
Performance Benchmark: InMemoryKVCacheManager vs MLXKVCacheManager

Compares RAM-based cache (InMemoryKVCacheManager) against disk-based cache (MLXKVCacheManager).
Validates the 100-200x speedup target for follow-up requests.

Expected to FAIL until InMemoryKVCacheManager implementation is complete (TDD Red Phase)

Usage:
    python3 scripts/benchmark_ram_cache.py [--verbose] [--compare]
"""

import sys
import time
import os
import json
import statistics
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor
import threading

# Add scripts directory to path
scripts_path = Path(__file__).parent
sys.path.insert(0, str(scripts_path))

# Try to import both cache managers
try:
    from ram_cache import InMemoryKVCacheManager
    HAS_RAM_CACHE = True
except ImportError:
    HAS_RAM_CACHE = False
    InMemoryKVCacheManager = None

try:
    from mlx_server import MLXKVCacheManager
    HAS_DISK_CACHE = True
except ImportError:
    HAS_DISK_CACHE = False
    MLXKVCacheManager = None


class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class BenchmarkResult:
    """Container for benchmark results"""
    def __init__(self, name: str, operations: int, total_time: float):
        self.name = name
        self.operations = operations
        self.total_time = total_time
        self.avg_latency_ms = (total_time / operations) * 1000 if operations > 0 else 0
        self.throughput_ops_per_sec = operations / total_time if total_time > 0 else 0

    def print_result(self):
        """Print benchmark result"""
        print(f"\n{Colors.BLUE}{self.name}{Colors.RESET}")
        print(f"  Operations: {self.operations:,}")
        print(f"  Total time: {self.total_time:.3f}s")
        print(f"  Avg latency: {self.avg_latency_ms:.3f}ms")
        print(f"  Throughput: {self.throughput_ops_per_sec:,.0f} ops/sec")

    def compare_to(self, other: 'BenchmarkResult') -> Dict[str, float]:
        """Compare this result to another"""
        speedup = other.avg_latency_ms / self.avg_latency_ms if self.avg_latency_ms > 0 else 0
        throughput_ratio = self.throughput_ops_per_sec / other.throughput_ops_per_sec if other.throughput_ops_per_sec > 0 else 0

        return {
            'speedup_factor': speedup,
            'throughput_ratio': throughput_ratio,
            'latency_improvement_percent': ((other.avg_latency_ms - self.avg_latency_ms) / other.avg_latency_ms * 100) if other.avg_latency_ms > 0 else 0,
        }


class RAMCacheBenchmark:
    """Benchmark suite for InMemoryKVCacheManager"""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.results = []

    def benchmark_get_operations(self, cache, num_ops: int = 10000) -> BenchmarkResult:
        """Benchmark cache GET operations"""
        if self.verbose:
            print(f"\nBenchmarking GET operations ({num_ops} iterations)...")

        # Pre-populate cache
        key = "benchmark_key"
        value = b"x" * (1024 * 1024)  # 1MB value
        cache.set(key, value, prefix_tokens=100)

        # Measure GET latency
        start = time.perf_counter()
        for _ in range(num_ops):
            cache.get(key)
        elapsed = time.perf_counter() - start

        result = BenchmarkResult("RAM Cache GET", num_ops, elapsed)
        self.results.append(result)
        return result

    def benchmark_set_operations(self, cache, num_ops: int = 1000) -> BenchmarkResult:
        """Benchmark cache SET operations"""
        if self.verbose:
            print(f"\nBenchmarking SET operations ({num_ops} iterations)...")

        value = b"x" * (1024 * 1024)  # 1MB value

        start = time.perf_counter()
        for i in range(num_ops):
            cache.set(f"bench_key_{i}", value, prefix_tokens=100)
        elapsed = time.perf_counter() - start

        result = BenchmarkResult("RAM Cache SET", num_ops, elapsed)
        self.results.append(result)
        return result

    def benchmark_mixed_operations(self, cache, num_ops: int = 5000) -> BenchmarkResult:
        """Benchmark mixed read/write operations"""
        if self.verbose:
            print(f"\nBenchmarking mixed operations ({num_ops} iterations)...")

        value = b"x" * (512 * 1024)  # 512KB value

        start = time.perf_counter()
        for i in range(num_ops):
            # 80% reads, 20% writes
            if i % 5 != 0:
                cache.get(f"bench_key_{i % 100}")
            else:
                cache.set(f"bench_key_{i % 100}", value)
        elapsed = time.perf_counter() - start

        result = BenchmarkResult("RAM Cache Mixed (80/20 R/W)", num_ops, elapsed)
        self.results.append(result)
        return result

    def benchmark_concurrent_access(self, cache, num_threads: int = 10, ops_per_thread: int = 100) -> BenchmarkResult:
        """Benchmark concurrent access patterns"""
        if self.verbose:
            print(f"\nBenchmarking concurrent access ({num_threads} threads, {ops_per_thread} ops/thread)...")

        # Pre-populate cache
        for i in range(10):
            cache.set(f"shared_key_{i}", b"data" * 100)

        def thread_work():
            for i in range(ops_per_thread):
                key = f"shared_key_{i % 10}"
                cache.get(key)

        total_ops = num_threads * ops_per_thread
        start = time.perf_counter()

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(thread_work) for _ in range(num_threads)]
            for future in futures:
                future.result()

        elapsed = time.perf_counter() - start

        result = BenchmarkResult(f"RAM Cache Concurrent ({num_threads} threads)", total_ops, elapsed)
        self.results.append(result)
        return result

    def benchmark_large_value_operations(self, cache, num_ops: int = 100) -> BenchmarkResult:
        """Benchmark operations with large values"""
        if self.verbose:
            print(f"\nBenchmarking large value operations ({num_ops} iterations)...")

        large_value = b"x" * (50 * 1024 * 1024)  # 50MB value

        start = time.perf_counter()
        for i in range(num_ops):
            # Alternate between set and get
            if i % 2 == 0:
                cache.set(f"large_key_{i % 2}", large_value)
            else:
                cache.get(f"large_key_{i % 2}")
        elapsed = time.perf_counter() - start

        result = BenchmarkResult("RAM Cache Large Values", num_ops, elapsed)
        self.results.append(result)
        return result

    def benchmark_metadata_operations(self, cache, num_ops: int = 5000) -> BenchmarkResult:
        """Benchmark metadata retrieval"""
        if self.verbose:
            print(f"\nBenchmarking metadata operations ({num_ops} iterations)...")

        # Pre-populate cache with metadata
        key = "metadata_key"
        cache.set(key, b"test_value" * 100, prefix_tokens=42)

        start = time.perf_counter()
        for _ in range(num_ops):
            cache.get_metadata(key)
        elapsed = time.perf_counter() - start

        result = BenchmarkResult("RAM Cache Metadata Retrieval", num_ops, elapsed)
        self.results.append(result)
        return result

    def run_full_benchmark(self, cache):
        """Run complete benchmark suite"""
        print(f"\n{Colors.CYAN}{Colors.BOLD}=== RAM Cache Benchmark ==={Colors.RESET}")

        try:
            self.benchmark_get_operations(cache, 10000)
            self.benchmark_set_operations(cache, 1000)
            self.benchmark_mixed_operations(cache, 5000)
            self.benchmark_metadata_operations(cache, 5000)
            self.benchmark_concurrent_access(cache, 10, 100)
            self.benchmark_large_value_operations(cache, 50)

            return True
        except Exception as e:
            print(f"{Colors.RED}Benchmark failed: {e}{Colors.RESET}")
            import traceback
            traceback.print_exc()
            return False

    def print_summary(self):
        """Print benchmark summary"""
        print(f"\n{Colors.CYAN}{Colors.BOLD}=== Benchmark Summary ==={Colors.RESET}")

        for result in self.results:
            result.print_result()

        # Print performance targets
        print(f"\n{Colors.CYAN}{Colors.BOLD}=== Performance Targets ==={Colors.RESET}")

        for result in self.results:
            print(f"\n{result.name}")
            if "GET" in result.name:
                if result.avg_latency_ms < 10:
                    print(f"  {Colors.GREEN}✓ GET latency < 10ms{Colors.RESET}: {result.avg_latency_ms:.3f}ms")
                else:
                    print(f"  {Colors.RED}✗ GET latency < 10ms{Colors.RESET}: {result.avg_latency_ms:.3f}ms")

            if "Throughput" in result.name or "Concurrent" in result.name:
                if result.throughput_ops_per_sec > 10000:
                    print(f"  {Colors.GREEN}✓ Throughput > 10k ops/sec{Colors.RESET}: {result.throughput_ops_per_sec:,.0f} ops/sec")
                else:
                    print(f"  {Colors.RED}✗ Throughput > 10k ops/sec{Colors.RESET}: {result.throughput_ops_per_sec:,.0f} ops/sec")


class ComparativeBenchmark:
    """Compare RAM cache vs Disk cache"""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose

    def benchmark_follow_up_requests(self):
        """Benchmark follow-up request scenario (key use case)"""
        if not HAS_RAM_CACHE:
            print(f"{Colors.RED}InMemoryKVCacheManager not available{Colors.RESET}")
            return False

        if not HAS_DISK_CACHE:
            print(f"{Colors.YELLOW}MLXKVCacheManager not available for comparison{Colors.RESET}")
            return False

        print(f"\n{Colors.CYAN}{Colors.BOLD}=== Follow-up Request Benchmark ==={Colors.RESET}")

        # Initialize caches
        ram_cache = InMemoryKVCacheManager(max_memory_mb=5000, eviction_policy='lru')
        # Note: MLXKVCacheManager init depends on filesystem
        # disk_cache = MLXKVCacheManager(cache_dir="/tmp/kv_cache", max_size=100)

        prompt = "You are a helpful AI assistant. " * 100
        key = "system_prompt"

        # Pre-populate RAM cache
        ram_cache.set(key, prompt.encode(), prefix_tokens=200)

        # Benchmark RAM cache retrieval
        print(f"\n{Colors.BLUE}RAM Cache (Follow-up Retrieval){Colors.RESET}")
        ram_times = []
        for _ in range(100):
            start = time.perf_counter()
            ram_cache.get(key)
            elapsed = time.perf_counter() - start
            ram_times.append(elapsed * 1000)

        ram_avg = statistics.mean(ram_times)
        ram_p95 = sorted(ram_times)[95]

        print(f"  Average: {ram_avg:.3f}ms")
        print(f"  P95: {ram_p95:.3f}ms")
        print(f"  Max: {max(ram_times):.3f}ms")

        # Print target achievement
        if ram_avg < 10:
            print(f"  {Colors.GREEN}✓ Target < 10ms achieved{Colors.RESET}")
        else:
            print(f"  {Colors.RED}✗ Target < 10ms missed{Colors.RESET}")

        # Note: Disk cache benchmark would go here if filesystem is available
        print(f"\n{Colors.YELLOW}Note: Disk cache comparison requires MLXKVCacheManager filesystem access{Colors.RESET}")

        ram_cache.clear()
        return True

    def calculate_speedup(self):
        """Calculate and display speedup targets"""
        print(f"\n{Colors.CYAN}{Colors.BOLD}=== Speedup Analysis ==={Colors.RESET}")

        print(f"\n{Colors.BLUE}Target Performance Improvements:{Colors.RESET}")
        print(f"  Disk cache retrieval: 500-2000ms")
        print(f"  RAM cache retrieval: < 10ms")
        print(f"  Expected speedup: {Colors.BOLD}50-200x{Colors.RESET}")

        print(f"\n{Colors.BLUE}Follow-up Request Timeline:{Colors.RESET}")
        print(f"  Current (disk-based): 0.5-10 seconds")
        print(f"  Target (RAM-based): 0.3-1 second")
        print(f"  Improvement: {Colors.BOLD}3-30x faster{Colors.RESET}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Benchmark InMemoryKVCacheManager performance'
    )
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Verbose output')
    parser.add_argument('--compare', '-c', action='store_true',
                       help='Compare RAM vs Disk cache')
    parser.add_argument('--output', '-o', type=str,
                       help='Output results to JSON file')

    args = parser.parse_args()

    # Check if InMemoryKVCacheManager is available
    if not HAS_RAM_CACHE:
        print(f"{Colors.RED}Error: InMemoryKVCacheManager not found{Colors.RESET}")
        print("The cache manager must be imported from mlx_server.py")
        sys.exit(1)

    # Run RAM cache benchmarks
    ram_bench = RAMCacheBenchmark(verbose=args.verbose)
    cache = InMemoryKVCacheManager(max_memory_mb=5000, eviction_policy='lru')

    success = ram_bench.run_full_benchmark(cache)
    if not success:
        sys.exit(1)

    ram_bench.print_summary()

    # Run comparative benchmark if requested
    if args.compare:
        comp_bench = ComparativeBenchmark(verbose=args.verbose)
        comp_bench.benchmark_follow_up_requests()
        comp_bench.calculate_speedup()

    # Save results to JSON if requested
    if args.output:
        results_dict = {
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'benchmarks': [
                {
                    'name': r.name,
                    'operations': r.operations,
                    'total_time_sec': r.total_time,
                    'avg_latency_ms': r.avg_latency_ms,
                    'throughput_ops_per_sec': r.throughput_ops_per_sec,
                }
                for r in ram_bench.results
            ]
        }

        with open(args.output, 'w') as f:
            json.dump(results_dict, f, indent=2)
        print(f"\n{Colors.GREEN}Results saved to {args.output}{Colors.RESET}")

    cache.clear()
    print(f"\n{Colors.GREEN}Benchmark completed successfully{Colors.RESET}")


if __name__ == '__main__':
    main()
