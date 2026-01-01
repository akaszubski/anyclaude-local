describe("parseModeFromArgs debug", () => {
  test("can load module", () => {
    try {
      console.log("Attempting to load module...");
      const main = require("../../src/main");
      console.log("Module loaded!", Object.keys(main));
      console.log("parseModeFromArgs type:", typeof main.parseModeFromArgs);

      if (main.parseModeFromArgs) {
        const result = main.parseModeFromArgs([
          "node",
          "main.js",
          "--mode=mlx-cluster",
        ]);
        console.log("Result:", result);
        expect(result).toBe("mlx-cluster");
      } else {
        console.log("parseModeFromArgs is undefined!");
        fail("parseModeFromArgs not exported");
      }
    } catch (error: any) {
      console.log("Error caught:", error.message);
      console.log("Error stack:", error.stack);
      throw error;
    }
  });
});
