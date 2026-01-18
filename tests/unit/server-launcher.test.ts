/**
 * Unit tests for server-launcher.ts (Issue #63)
 *
 * Tests server startup, cleanup, Docker/container management,
 * and port handling with mocked child_process
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest, describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import * as childProcess from "child_process";
import * as fs from "fs";
import { EventEmitter } from "events";

// Mock child_process
jest.mock("child_process");
const mockChildProcess = childProcess as jest.Mocked<typeof childProcess>;

// Mock fs
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock fetch - assigned in beforeEach

// Import after mocks are set up
import {
  isDockerAvailable,
  startDockerDaemon,
  isSearxNGRunning,
  stopSearxNGContainer,
  getProcessOnPort,
  isServerRunning,
  killProcessOnPort,
  wasServerLaunchedByUs,
  startMLXWorkerServer,
  startLMStudioServer,
  waitForServerReady,
  launchBackendServer,
  registerServerProcess,
  getServerProcess,
  cleanupServerProcess,
} from "../../src/server-launcher";

// Mock debug
jest.mock("../../src/debug", () => ({
  debug: jest.fn(),
}));

describe("Server Launcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fetch
    global.fetch = jest.fn();

    // Default fs mocks
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (mockFs.createWriteStream as jest.Mock).mockReturnValue({
      write: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("isDockerAvailable", () => {
    test("should return true when docker info succeeds", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "Docker version info",
        stderr: "",
      });

      expect(isDockerAvailable()).toBe(true);
      expect(mockChildProcess.spawnSync).toHaveBeenCalledWith(
        "docker",
        ["info"],
        expect.objectContaining({ encoding: "utf8", timeout: 5000 })
      );
    });

    test("should return false when docker info fails", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "Cannot connect to Docker daemon",
      });

      expect(isDockerAvailable()).toBe(false);
    });

    test("should return false when docker command throws", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(() => {
        throw new Error("Command not found");
      });

      expect(isDockerAvailable()).toBe(false);
    });
  });

  describe("startDockerDaemon", () => {
    test("should return true immediately if Docker is already running", async () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "Docker is running",
        stderr: "",
      });

      const result = await startDockerDaemon();
      expect(result).toBe(true);
    });

    test("should try OrbStack first if available", async () => {
      let dockerInfoCalls = 0;
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(
        (...args: any[]) => {
          const cmd = args[0];
          const cmdArgs = args[1] || [];
          if (cmd === "docker" && cmdArgs[0] === "info") {
            dockerInfoCalls++;
            // First call: Docker not running, subsequent: running
            return { status: dockerInfoCalls === 1 ? 1 : 0 };
          }
          if (cmd === "which" && cmdArgs[0] === "orbctl") {
            return { status: 0, stdout: "/opt/homebrew/bin/orbctl" };
          }
          if (cmd === "open") {
            return { status: 0 };
          }
          return { status: 0 };
        }
      );

      const result = await startDockerDaemon();
      expect(result).toBe(true);
      expect(mockChildProcess.spawnSync).toHaveBeenCalledWith(
        "open",
        ["-a", "OrbStack"],
        expect.any(Object)
      );
    });

    test("should fall back to Docker Desktop if OrbStack not available", async () => {
      let dockerInfoCalls = 0;
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(
        (...args: any[]) => {
          const cmd = args[0];
          const cmdArgs = args[1] || [];
          if (cmd === "docker" && cmdArgs[0] === "info") {
            dockerInfoCalls++;
            return { status: dockerInfoCalls === 1 ? 1 : 0 };
          }
          if (cmd === "which" && cmdArgs[0] === "orbctl") {
            return { status: 1, stdout: "" }; // OrbStack not found
          }
          if (cmd === "open") {
            return { status: 0 };
          }
          return { status: 0 };
        }
      );

      const result = await startDockerDaemon();
      expect(result).toBe(true);
      expect(mockChildProcess.spawnSync).toHaveBeenCalledWith(
        "open",
        ["-a", "Docker"],
        expect.any(Object)
      );
    });
  });

  describe("isSearxNGRunning", () => {
    test("should return true when container is running", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "abc123def456\n",
        stderr: "",
      });

      expect(isSearxNGRunning()).toBe(true);
      expect(mockChildProcess.spawnSync).toHaveBeenCalledWith(
        "docker",
        ["ps", "-q", "-f", "name=anyclaude-searxng"],
        expect.any(Object)
      );
    });

    test("should return false when container is not running", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "",
        stderr: "",
      });

      expect(isSearxNGRunning()).toBe(false);
    });

    test("should return false when docker command fails", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(() => {
        throw new Error("Docker not running");
      });

      expect(isSearxNGRunning()).toBe(false);
    });
  });

  describe("getProcessOnPort", () => {
    test("should return PID when process is listening", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "12345\n",
        stderr: "",
      });

      const pid = getProcessOnPort(8081);
      expect(pid).toBe(12345);
      expect(mockChildProcess.spawnSync).toHaveBeenCalledWith(
        "lsof",
        ["-i", ":8081", "-sTCP:LISTEN", "-t"],
        expect.any(Object)
      );
    });

    test("should return first PID when multiple processes", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "12345\n67890\n",
        stderr: "",
      });

      expect(getProcessOnPort(8081)).toBe(12345);
    });

    test("should return null when no process is listening", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });

      expect(getProcessOnPort(8081)).toBeNull();
    });

    test("should return null when lsof throws", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(() => {
        throw new Error("lsof failed");
      });

      expect(getProcessOnPort(8081)).toBeNull();
    });
  });

  describe("isServerRunning", () => {
    test("should return true when process found on port", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "12345\n",
        stderr: "",
      });

      expect(isServerRunning(8081)).toBe(true);
    });

    test("should return false when no process on port", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });

      expect(isServerRunning(8081)).toBe(false);
    });
  });

  describe("killProcessOnPort", () => {
    test("should return false when no process on port", () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });

      expect(killProcessOnPort(8081)).toBe(false);
    });

    test("should kill process and return true on success", () => {
      // Mock process.kill
      const originalKill = process.kill;
      const mockKill = jest.fn();
      process.kill = mockKill as any;

      let lsofCalls = 0;
      (mockChildProcess.spawnSync as jest.Mock).mockImplementation(
        (...args: any[]) => {
          const cmd = args[0];
          if (cmd === "lsof") {
            lsofCalls++;
            // First call: process exists, second call: process gone
            return {
              status: lsofCalls === 1 ? 0 : 1,
              stdout: lsofCalls === 1 ? "12345\n" : "",
              stderr: "",
            };
          }
          return { status: 0 };
        }
      );

      const result = killProcessOnPort(8081);

      expect(mockKill).toHaveBeenCalledWith(12345, "SIGTERM");
      expect(result).toBe(true);

      process.kill = originalKill;
    });
  });

  describe("waitForServerReady", () => {
    test("should return true when server responds with 200", async () => {
      // @ts-expect-error - Jest mock typing issue
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await waitForServerReady("http://localhost:8081/v1", 5000);
      expect(result).toBe(true);
      expect((global.fetch as jest.Mock)).toHaveBeenCalledWith(
        "http://localhost:8081/v1/models",
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    test("should retry on fetch failure", async () => {
      const mockFetch = global.fetch as jest.Mock;
      // @ts-expect-error - Jest mock typing issue with chained calls
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      // @ts-expect-error - Jest mock typing issue with chained calls
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      // @ts-expect-error - Jest mock typing issue with chained calls
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await waitForServerReady("http://localhost:8081/v1", 5000);
      expect(result).toBe(true);
      expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(3);
    });

    test("should return false on timeout", async () => {
      // @ts-expect-error - Jest mock typing issue
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Connection refused"));

      // Short timeout for test
      const result = await waitForServerReady("http://localhost:8081/v1", 1000);
      expect(result).toBe(false);
    });

    test("should retry when server returns non-200", async () => {
      const mockFetch = global.fetch as jest.Mock;
      // @ts-expect-error - Jest mock typing issue with chained calls
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      // @ts-expect-error - Jest mock typing issue with chained calls
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await waitForServerReady("http://localhost:8081/v1", 5000);
      expect(result).toBe(true);
      expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2);
    });
  });

  describe("registerServerProcess / getServerProcess", () => {
    test("should register and retrieve server process", () => {
      const mockProcess = { pid: 12345 } as childProcess.ChildProcess;

      registerServerProcess(mockProcess);
      expect(getServerProcess()).toBe(mockProcess);
    });
  });

  describe("cleanupServerProcess", () => {
    test("should kill process group when process has PID", () => {
      const originalKill = process.kill;
      const mockKill = jest.fn();
      process.kill = mockKill as any;

      const mockProcess = { pid: 12345 } as childProcess.ChildProcess;
      registerServerProcess(mockProcess);

      cleanupServerProcess();

      // Should try to kill process group first
      expect(mockKill).toHaveBeenCalledWith(-12345, "SIGTERM");

      process.kill = originalKill;
    });

    test("should fallback to killing process directly if group kill fails", () => {
      const originalKill = process.kill;
      const mockKill = jest.fn().mockImplementation((...args: any[]) => {
        const pid = args[0];
        if (pid < 0) {
          throw new Error("No such process group");
        }
      });
      process.kill = mockKill as any;

      const mockProcess = { pid: 12345 } as childProcess.ChildProcess;
      registerServerProcess(mockProcess);

      cleanupServerProcess();

      // Should try process group, then individual process
      expect(mockKill).toHaveBeenCalledWith(-12345, "SIGTERM");
      expect(mockKill).toHaveBeenCalledWith(12345, "SIGTERM");

      process.kill = originalKill;
    });

    test("should clear process reference after cleanup", () => {
      const mockProcess = { pid: 12345 } as childProcess.ChildProcess;
      registerServerProcess(mockProcess);

      const originalKill = process.kill;
      process.kill = jest.fn() as any;

      cleanupServerProcess();

      expect(getServerProcess()).toBeNull();

      process.kill = originalKill;
    });
  });

  describe("startMLXWorkerServer", () => {
    test("should return true if server already running", async () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "12345\n",
        stderr: "",
      });

      const result = await startMLXWorkerServer({ port: 8081 });
      expect(result).toBe(true);
      expect(wasServerLaunchedByUs()).toBe(false);
    });

    test("should return false if no model path configured", async () => {
      // Server not running
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });

      // No model path in env
      const originalEnv = process.env.MLX_MODEL_PATH;
      delete process.env.MLX_MODEL_PATH;

      const result = await startMLXWorkerServer({ port: 8081 });
      expect(result).toBe(false);

      if (originalEnv) {
        process.env.MLX_MODEL_PATH = originalEnv;
      }
    });

    test("should return false if model path does not exist", async () => {
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });
      (mockFs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await startMLXWorkerServer({
        port: 8081,
        modelPath: "/nonexistent/model",
      });
      expect(result).toBe(false);
    });

    test("should spawn uvicorn and wait for server ready", async () => {
      // Server not running
      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
      });

      // Model exists
      (mockFs.existsSync as jest.Mock).mockImplementation((...args: any[]) => {
        const p = args[0] as string;
        return p.includes("model") || p.includes("uvicorn");
      });

      // Create mock EventEmitter for spawn
      const mockSpawnProcess = new EventEmitter() as any;
      mockSpawnProcess.pid = 12345;
      mockSpawnProcess.exitCode = null;
      mockSpawnProcess.stdout = new EventEmitter();
      mockSpawnProcess.stderr = new EventEmitter();
      mockSpawnProcess.unref = jest.fn();

      (mockChildProcess.spawn as jest.Mock).mockReturnValue(mockSpawnProcess);

      // Server becomes ready
      // @ts-expect-error - Jest mock typing issue
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      const result = await startMLXWorkerServer({
        port: 8081,
        modelPath: "/path/to/model",
        startupTimeout: 1000,
      });

      expect(result).toBe(true);
      expect(mockChildProcess.spawn).toHaveBeenCalled();
    });
  });

  describe("startLMStudioServer", () => {
    test("should log configuration without starting server", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      startLMStudioServer({ backend: "lmstudio", port: 1234 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("LMStudio configured")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("launchBackendServer", () => {
    test("should skip launch if ANYCLAUDE_NO_AUTO_LAUNCH is set", () => {
      const originalEnv = process.env.ANYCLAUDE_NO_AUTO_LAUNCH;
      process.env.ANYCLAUDE_NO_AUTO_LAUNCH = "1";

      launchBackendServer("mlx", { backends: { mlx: { port: 8081 } } });

      // Should not check port
      expect(mockChildProcess.spawnSync).not.toHaveBeenCalled();

      if (originalEnv) {
        process.env.ANYCLAUDE_NO_AUTO_LAUNCH = originalEnv;
      } else {
        delete process.env.ANYCLAUDE_NO_AUTO_LAUNCH;
      }
    });

    test("should skip launch for claude mode", () => {
      launchBackendServer("claude", {});
      expect(mockChildProcess.spawnSync).not.toHaveBeenCalled();
    });

    test("should use existing server if running for lmstudio", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      (mockChildProcess.spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: "12345\n",
        stderr: "",
      });

      launchBackendServer("lmstudio", {
        backends: { lmstudio: { port: 1234 } },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("already running")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("SearXNG container management", () => {
    test("stopSearxNGContainer should not stop if not launched by us", () => {
      // Ensure SearXNG was not launched by us (default state)
      stopSearxNGContainer();

      // Should not try to stop container
      expect(mockChildProcess.spawnSync).not.toHaveBeenCalledWith(
        "docker",
        ["stop", "anyclaude-searxng"],
        expect.any(Object)
      );
    });
  });
});
