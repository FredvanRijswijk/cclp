import { select } from "@inquirer/prompts";
import pc from "picocolors";
import type { ProjectStats } from "./parser.js";
import { calculateCost, formatCost, formatTokens } from "./pricing.js";

function formatDate(date: Date | null): string {
  if (!date) return "never";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

export async function showPicker(stats: ProjectStats[]): Promise<ProjectStats | null> {
  if (stats.length === 0) {
    console.log(pc.yellow("No projects found"));
    return null;
  }

  // Sort by last activity (most recent first)
  const sorted = [...stats].sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  });

  const choices = sorted.map((s) => {
    const cost = calculateCost(s.usage);
    const costStr = formatCost(cost);
    const lastStr = formatDate(s.lastActivity);
    return {
      name: `${padRight(s.project.name, 30)} ${pc.dim(lastStr.padStart(10))} ${pc.green(costStr.padStart(8))}`,
      value: s,
    };
  });

  return select({
    message: "Select project (ctrl-c to cancel):",
    choices,
    pageSize: 15,
  });
}

export function showTable(stats: ProjectStats[]): void {
  if (stats.length === 0) {
    console.log(pc.yellow("No projects found"));
    return;
  }

  // Sort by last activity
  const sorted = [...stats].sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  });

  // Header
  console.log(
    pc.bold(
      `${padRight("PROJECT", 30)} ${padRight("SESSIONS", 10)} ${padRight("LAST", 12)} ${padRight("TOKENS", 12)} ${padRight("COST", 10)}`
    )
  );
  console.log(pc.dim("-".repeat(74)));

  for (const s of sorted) {
    const cost = calculateCost(s.usage);
    const totalTokens = s.usage.inputTokens + s.usage.outputTokens;
    console.log(
      `${padRight(s.project.name, 30)} ${padRight(String(s.sessions), 10)} ${padRight(formatDate(s.lastActivity), 12)} ${padRight(formatTokens(totalTokens), 12)} ${pc.green(formatCost(cost))}`
    );
  }
}

export function showStats(stats: ProjectStats[], days?: number): void {
  const totals = stats.reduce(
    (acc, s) => {
      acc.sessions += s.sessions;
      acc.inputTokens += s.usage.inputTokens;
      acc.outputTokens += s.usage.outputTokens;
      acc.cacheCreationInputTokens += s.usage.cacheCreationInputTokens;
      acc.cacheReadInputTokens += s.usage.cacheReadInputTokens;
      return acc;
    },
    {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    }
  );

  const totalCost = calculateCost(totals);
  const title = days ? `Claude Code Usage (last ${days}d)` : "Claude Code Usage";

  console.log(pc.bold(title));
  console.log(pc.dim("-".repeat(40)));
  console.log(`Projects:       ${stats.length}`);
  console.log(`Sessions:       ${totals.sessions}`);
  console.log(`Input tokens:   ${formatTokens(totals.inputTokens)}`);
  console.log(`Output tokens:  ${formatTokens(totals.outputTokens)}`);
  console.log(`Cache writes:   ${formatTokens(totals.cacheCreationInputTokens)}`);
  console.log(`Cache reads:    ${formatTokens(totals.cacheReadInputTokens)}`);
  console.log(pc.dim("-".repeat(40)));
  console.log(pc.green(`Estimated cost: ${formatCost(totalCost)}`));
}

export function fuzzyMatch(projects: ProjectStats[], query: string): ProjectStats | null {
  const q = query.toLowerCase();
  // Exact match first
  const exact = projects.find((p) => p.project.name.toLowerCase() === q);
  if (exact) return exact;
  // Then substring match
  const matches = projects.filter((p) => p.project.name.toLowerCase().includes(q));
  return matches[0] || null;
}

export function filterByDays(stats: ProjectStats[], days: number): ProjectStats[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return stats.filter((s) => s.lastActivity && s.lastActivity >= cutoff);
}
