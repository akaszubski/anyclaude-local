const {
  filterSystemPrompt,
  OptimizationTier,
} = require("../../dist/safe-system-filter.js");
const fs = require("fs");

// Read actual CLAUDE.md
const claudeMd = fs.readFileSync("CLAUDE.md", "utf8");
console.log(
  "CLAUDE.md size:",
  claudeMd.length,
  "chars (~" + Math.round(claudeMd.length / 4) + " tokens)"
);

const result = filterSystemPrompt(claudeMd, {
  tier: OptimizationTier.AGGRESSIVE,
  maxTokens: 4000,
});

console.log(
  "Output size:",
  result.filteredPrompt.length,
  "chars (~" + Math.round(result.filteredPrompt.length / 4) + " tokens)"
);
console.log("Applied tier:", result.appliedTier);
console.log("Reduction:", result.stats.reductionPercent.toFixed(1) + "%");
console.log("Valid:", result.validation.isValid);
console.log("Missing patterns:", result.validation.missingPatterns);
