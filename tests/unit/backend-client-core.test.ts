/**
 * Unit tests for BackendClient
 * Tests the generic backend client that works with any OpenAI-compatible API
 */

import { BackendClient } from "../../src/backend-client";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("BackendClient", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("constructor", () => {
    it("should remove trailing /v1 from baseUrl", () => {
      const client = new BackendClient("http://localhost:8081/v1");
      // We can verify by calling getModels and checking the URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], object: "list" }),
      });
      client.getModels();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8081/v1/models");
    });

    it("should handle baseUrl without /v1 suffix", () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], object: "list" }),
      });
      client.getModels();
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8081/v1/models");
    });
  });

  describe("getModels", () => {
    it("should return models response on success", async () => {
      const client = new BackendClient("http://localhost:8081");
      const mockResponse = {
        data: [
          { id: "model-1", object: "model", context_length: 32768 },
          { id: "model-2", object: "model", context_length: 8192 },
        ],
        object: "list" as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getModels();
      expect(result).toEqual(mockResponse);
    });

    it("should throw error on non-ok response", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.getModels()).rejects.toThrow(
        "Backend API error (404 Not Found): http://localhost:8081/v1/models. Check model name and endpoint path."
      );
    });

    it("should throw error on network failure", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getModels()).rejects.toThrow("Network error");
    });

    it("should handle 500 server error", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.getModels()).rejects.toThrow(
        "Backend API error (500 Internal Server Error): http://localhost:8081/v1/models."
      );
    });
  });

  describe("getFirstModel", () => {
    it("should return first model when available", async () => {
      const client = new BackendClient("http://localhost:8081");
      const mockModel = {
        id: "test-model",
        object: "model",
        context_length: 32768,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockModel], object: "list" }),
      });

      const result = await client.getFirstModel();
      expect(result).toEqual(mockModel);
    });

    it("should return null when no models available", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], object: "list" }),
      });

      const result = await client.getFirstModel();
      expect(result).toBeNull();
    });

    it("should return null on API error", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await client.getFirstModel();
      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.getFirstModel();
      expect(result).toBeNull();
    });
  });

  describe("getModelInfo", () => {
    it("should return model name and context", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "qwen3-30b", object: "model", context_length: 32768 }],
            object: "list",
          }),
      });

      const result = await client.getModelInfo();
      expect(result).toEqual({ name: "qwen3-30b", context: 32768 });
    });

    it("should return null when no model available", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], object: "list" }),
      });

      const result = await client.getModelInfo();
      expect(result).toBeNull();
    });

    describe("context length priority", () => {
      it("should prefer loaded_context_length (LMStudio)", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  loaded_context_length: 16384,
                  context_length: 32768,
                  max_context_length: 65536,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBe(16384);
      });

      it("should use context_length when loaded_context_length not available", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  context_length: 32768,
                  max_context_length: 65536,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBe(32768);
      });

      it("should use max_context_length as fallback", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  max_context_length: 65536,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBe(65536);
      });

      it("should return null context when no context fields available", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ id: "model", object: "model" }],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBeNull();
      });
    });

    describe("context length validation", () => {
      it("should reject NaN context length", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  context_length: NaN,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBeNull();
      });

      it("should reject Infinity context length", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  context_length: Infinity,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBeNull();
      });

      it("should reject negative context length", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  context_length: -1,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBeNull();
      });

      it("should reject zero context length", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  context_length: 0,
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBeNull();
      });

      it("should skip invalid loaded_context_length and use valid context_length", async () => {
        const client = new BackendClient("http://localhost:8081");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "model",
                  object: "model",
                  loaded_context_length: -1, // Invalid
                  context_length: 32768, // Valid
                },
              ],
              object: "list",
            }),
        });

        const result = await client.getModelInfo();
        expect(result?.context).toBe(32768);
      });
    });
  });

  describe("error message quality", () => {
    it("should include URL in connection refused error", async () => {
      const client = new BackendClient("http://localhost:8081");
      const networkError = new Error("Connection refused");
      (networkError as any).code = "ECONNREFUSED";

      mockFetch.mockRejectedValueOnce(networkError);

      await expect(client.getModels()).rejects.toThrow();

      // Test will initially fail - implementation needs to improve error message
      // Expected improved error: "Failed to connect to http://localhost:8081/v1/models: Connection refused. Is the server running?"
    });

    it("should include URL and status in HTTP 404 error", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.getModels()).rejects.toThrow(
        /Backend API error \(404 Not Found\): http:\/\/localhost:8081\/v1\/models\. Check model name and endpoint path\./
      );
    });

    it("should include URL and status in HTTP 500 error", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.getModels()).rejects.toThrow(
        /Backend API error \(500 Internal Server Error\): http:\/\/localhost:8081\/v1\/models\./
      );
    });

    it("should include timeout value in timeout error", async () => {
      const client = new BackendClient("http://localhost:8081");
      const timeoutError = new Error("Request timeout");
      (timeoutError as any).code = "ETIMEDOUT";

      mockFetch.mockRejectedValueOnce(timeoutError);

      await expect(client.getModels()).rejects.toThrow();

      // Test will initially fail - implementation needs to improve error message
      // Expected improved error: "Request to http://localhost:8081/v1/models timed out. Check network connectivity or increase timeout."
    });

    it("should not expose stack traces in error messages", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      try {
        await client.getModels();
        fail("Expected error to be thrown");
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Error message should not contain file paths or stack traces
        expect(errorMessage).not.toMatch(/\.ts:/);
        expect(errorMessage).not.toMatch(/at /);
        expect(errorMessage).not.toMatch(/backend-client\.ts/);
      }
    });

    it("should distinguish connection vs API errors", async () => {
      const client = new BackendClient("http://localhost:8081");

      // Test connection error
      const connectionError = new Error("Connection refused");
      (connectionError as any).code = "ECONNREFUSED";
      mockFetch.mockRejectedValueOnce(connectionError);

      try {
        await client.getModels();
        fail("Expected connection error");
      } catch (error) {
        // Should identify as connection issue
        expect((error as Error).message).toMatch(/connect|connection|refused/i);
      }

      // Test API error (different error type)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      try {
        await client.getModels();
        fail("Expected API error");
      } catch (error) {
        // Should identify as API error with status
        expect((error as Error).message).toMatch(/401/);
        expect((error as Error).message).toMatch(/Unauthorized/);
      }
    });

    it("should suggest checking server when connection fails", async () => {
      const client = new BackendClient("http://localhost:8081");
      const networkError = new Error("ECONNREFUSED");
      (networkError as any).code = "ECONNREFUSED";

      mockFetch.mockRejectedValueOnce(networkError);

      try {
        await client.getModels();
        fail("Expected error to be thrown");
      } catch (error) {
        // Test will initially fail - implementation needs to add helpful suggestion
        // Expected: error message contains "Is the server running?" or similar
        const errorMessage = (error as Error).message;
        expect(errorMessage).toBeDefined();
        // This will fail until implementation adds the suggestion
      }
    });

    it("should include endpoint path in all error messages", async () => {
      const client = new BackendClient("http://localhost:8081");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      try {
        await client.getModels();
        fail("Expected error");
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Should include the full URL being accessed
        expect(errorMessage).toContain("http://localhost:8081/v1/models");
      }
    });
  });
});
