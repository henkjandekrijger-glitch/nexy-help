import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  reasoning: "high",
  defaultTools: false,
  limits: { maxInputTokensPerSession: 150000, maxOutputTokensPerSession: 15000, maxTokenCostUsdPerSession: 0.15 },
});
