import type { TokenUsage } from "./parser.js";

// Anthropic pricing per 1M tokens (USD)
interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICING: Record<string, ModelPricing> = {
  "opus-4": {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "sonnet-4": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "haiku-4": {
    input: 0.8,
    output: 4,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
};

// Default to sonnet-4 pricing (most common)
const DEFAULT_MODEL = "sonnet-4";

export function calculateCost(
  usage: TokenUsage,
  model: string = DEFAULT_MODEL
): number {
  const pricing = PRICING[model] || PRICING[DEFAULT_MODEL];
  const M = 1_000_000;

  const inputCost = (usage.inputTokens / M) * pricing.input;
  const outputCost = (usage.outputTokens / M) * pricing.output;
  const cacheWriteCost =
    (usage.cacheCreationInputTokens / M) * pricing.cacheWrite;
  const cacheReadCost = (usage.cacheReadInputTokens / M) * pricing.cacheRead;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}
