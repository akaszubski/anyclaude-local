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
        "Backend API error: 404 Not Found"
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
        "Backend API error: 500 Internal Server Error"
      );
    });
  });

  describe("getFirstModel", () => {
    it("should return first model when available", async () => {
      const client = new BackendClient("http://localhost:8081");
      const mockModel = { id: "test-model", object: "model", context_length: 32768 };

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
});
