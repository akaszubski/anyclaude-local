/**
 * Integration tests for mlx-omni local model support
 *
 * Tests that mlx-omni mode ONLY accepts local model file paths,
 * not HuggingFace model IDs.
 */

const { execSync } = require("child_process");
const path = require("path");

describe("MLX-Omni Local Models Integration", () => {
  const projectRoot = path.resolve(__dirname, "../../");
  const distPath = path.join(projectRoot, "dist", "main-cli.js");

  describe("Model Validation", () => {
    test("should reject HuggingFace model IDs (no path separators)", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "qwen3-coder-30b", // HuggingFace ID
        PROXY_ONLY: "true",
      };

      expect(() => {
        execSync(`node ${distPath}`, { env, stdio: "pipe" });
      }).toThrow();
    });

    test("should reject HuggingFace org/model format", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "mlx-community/Qwen3-Coder-30B", // org/model format
        PROXY_ONLY: "true",
      };

      expect(() => {
        execSync(`node ${distPath}`, { env, stdio: "pipe" });
      }).toThrow();
    });

    test("should accept absolute Unix paths", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "/Users/user/models/Qwen3-Coder-30B-4bit",
        PROXY_ONLY: "true",
      };

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain("[anyclaude] Model: /Users/user/models/Qwen3-Coder-30B-4bit");
    });

    test("should accept Linux home directory paths", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "/home/user/models/Qwen3-Coder-30B-4bit",
        PROXY_ONLY: "true",
      };

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain("[anyclaude] Model: /home/user/models/Qwen3-Coder-30B-4bit");
    });

    test("should accept Windows absolute paths", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "C:\\Users\\user\\models\\Qwen3-Coder-30B-4bit",
        PROXY_ONLY: "true",
      };

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain(
        "[anyclaude] Model: C:\\Users\\user\\models\\Qwen3-Coder-30B-4bit"
      );
    });

    test("should require model path when MLX_OMNI_MODEL not set", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        PROXY_ONLY: "true",
      };
      delete env.MLX_OMNI_MODEL;
      delete env.MLX_MODEL;

      expect(() => {
        execSync(`node ${distPath}`, { env, stdio: "pipe" });
      }).toThrow();
    });

    test("should fall back to MLX_MODEL environment variable", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_MODEL: "/path/to/local/model",
        PROXY_ONLY: "true",
      };
      delete env.MLX_OMNI_MODEL;

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain("[anyclaude] Model: /path/to/local/model");
    });

    test("should prefer MLX_OMNI_MODEL over MLX_MODEL", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "/path/to/omni/model",
        MLX_MODEL: "/path/to/lm/model",
        PROXY_ONLY: "true",
      };

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain("[anyclaude] Model: /path/to/omni/model");
    });
  });

  describe("Error Messages", () => {
    test("should provide helpful error for HuggingFace IDs", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        MLX_OMNI_MODEL: "qwen3-coder-30b",
        PROXY_ONLY: "true",
      };

      let output = "";
      try {
        execSync(`node ${distPath}`, { env, stdio: "pipe", encoding: "utf8" });
      } catch (error) {
        output = error.message;
      }

      expect(output).toContain("MLX-Omni mode does NOT support HuggingFace model IDs");
      expect(output).toContain("MLX-Omni only works with local model files");
      expect(output).toContain("use MLX-LM or LMStudio mode instead");
    });

    test("should explain MLX_OMNI_MODEL requirement when missing", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "mlx-omni",
        PROXY_ONLY: "true",
      };
      delete env.MLX_OMNI_MODEL;
      delete env.MLX_MODEL;

      let output = "";
      try {
        execSync(`node ${distPath}`, { env, stdio: "pipe", encoding: "utf8" });
      } catch (error) {
        output = error.message;
      }

      expect(output).toContain("MLX_OMNI_MODEL or MLX_MODEL environment variable");
      expect(output).toContain("local file path");
    });
  });

  describe("Mode Interaction", () => {
    test("should not validate models in other modes", () => {
      const env = {
        ...process.env,
        ANYCLAUDE_MODE: "lmstudio",
        MLX_OMNI_MODEL: "qwen3-coder-30b", // Invalid for mlx-omni, but not checked
        PROXY_ONLY: "true",
      };

      const output = execSync(`node ${distPath}`, { env, encoding: "utf8" });
      expect(output).toContain("[anyclaude] Mode: LMSTUDIO");
      expect(output).not.toContain("does NOT support HuggingFace");
    });
  });
});
