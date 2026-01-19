import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";
import type { Project } from "./scanner.js";
import { getProjectDir } from "./scanner.js";
import { calculateCost, formatCost, formatTokens } from "./pricing.js";
import type { TokenUsage } from "./parser.js";

interface DailyCost {
  date: string;
  usage: TokenUsage;
  cost: number;
}

interface JsonlLine {
  timestamp?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getCostByDay(projects: Project[]): Promise<Map<string, TokenUsage>> {
  const dailyUsage = new Map<string, TokenUsage>();

  for (const project of projects) {
    const projectDir = getProjectDir(project);

    try {
      const files = await readdir(projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      for (const file of jsonlFiles) {
        const content = await readFile(join(projectDir, file), "utf-8");
        const lines = content.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const data: JsonlLine = JSON.parse(line);

            if (data.timestamp && data.message?.usage) {
              const dateKey = formatDateKey(new Date(data.timestamp));
              const usage = data.message.usage;

              if (!dailyUsage.has(dateKey)) {
                dailyUsage.set(dateKey, {
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheCreationInputTokens: 0,
                  cacheReadInputTokens: 0,
                });
              }

              const daily = dailyUsage.get(dateKey)!;
              daily.inputTokens += usage.input_tokens || 0;
              daily.outputTokens += usage.output_tokens || 0;
              daily.cacheCreationInputTokens += usage.cache_creation_input_tokens || 0;
              daily.cacheReadInputTokens += usage.cache_read_input_tokens || 0;
            }
          } catch {
            // skip invalid lines
          }
        }
      }
    } catch {
      // skip project
    }
  }

  return dailyUsage;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

export function showDailyCost(dailyUsage: Map<string, TokenUsage>, days?: number): void {
  // Sort by date descending
  const entries = Array.from(dailyUsage.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // Filter by days if specified
  const filtered = days
    ? entries.filter(([date]) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return new Date(date) >= cutoff;
      })
    : entries;

  if (filtered.length === 0) {
    console.log(pc.yellow("No cost data found"));
    return;
  }

  const title = days ? `Daily cost breakdown (last ${days}d)` : "Daily cost breakdown";
  console.log(pc.bold(title));
  console.log(pc.dim("-".repeat(60)));
  console.log(
    pc.bold(`${padRight("DATE", 12)} ${padRight("TOKENS", 14)} ${padRight("COST", 12)} BAR`)
  );
  console.log(pc.dim("-".repeat(60)));

  // Find max cost for bar scaling
  const maxCost = Math.max(...filtered.map(([, u]) => calculateCost(u)));

  let totalCost = 0;

  for (const [date, usage] of filtered) {
    const cost = calculateCost(usage);
    totalCost += cost;
    const tokens = usage.inputTokens + usage.outputTokens;
    const barLen = maxCost > 0 ? Math.round((cost / maxCost) * 20) : 0;
    const bar = pc.green("█".repeat(barLen));

    console.log(
      `${padRight(date, 12)} ${padRight(formatTokens(tokens), 14)} ${padRight(formatCost(cost), 12)} ${bar}`
    );
  }

  console.log(pc.dim("-".repeat(60)));
  console.log(pc.green(`Total: ${formatCost(totalCost)}`));
}

export function showWeeklyCost(dailyUsage: Map<string, TokenUsage>): void {
  // Group by week
  const weeklyUsage = new Map<string, TokenUsage>();

  for (const [dateStr, usage] of dailyUsage) {
    const date = new Date(dateStr);
    // Get Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const weekKey = formatDateKey(monday);

    if (!weeklyUsage.has(weekKey)) {
      weeklyUsage.set(weekKey, {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      });
    }

    const weekly = weeklyUsage.get(weekKey)!;
    weekly.inputTokens += usage.inputTokens;
    weekly.outputTokens += usage.outputTokens;
    weekly.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    weekly.cacheReadInputTokens += usage.cacheReadInputTokens;
  }

  // Sort by week descending
  const entries = Array.from(weeklyUsage.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  if (entries.length === 0) {
    console.log(pc.yellow("No cost data found"));
    return;
  }

  console.log(pc.bold("Weekly cost breakdown"));
  console.log(pc.dim("-".repeat(60)));
  console.log(
    pc.bold(`${padRight("WEEK OF", 12)} ${padRight("TOKENS", 14)} ${padRight("COST", 12)} BAR`)
  );
  console.log(pc.dim("-".repeat(60)));

  const maxCost = Math.max(...entries.map(([, u]) => calculateCost(u)));
  let totalCost = 0;

  for (const [week, usage] of entries) {
    const cost = calculateCost(usage);
    totalCost += cost;
    const tokens = usage.inputTokens + usage.outputTokens;
    const barLen = maxCost > 0 ? Math.round((cost / maxCost) * 20) : 0;
    const bar = pc.green("█".repeat(barLen));

    console.log(
      `${padRight(week, 12)} ${padRight(formatTokens(tokens), 14)} ${padRight(formatCost(cost), 12)} ${bar}`
    );
  }

  console.log(pc.dim("-".repeat(60)));
  console.log(pc.green(`Total: ${formatCost(totalCost)}`));
}
