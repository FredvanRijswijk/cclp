import { vimSelect } from "./vim-select.js";
import pc from "picocolors";
import type { ProjectStats } from "./parser.js";
import type { SessionPreview } from "./preview.js";
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

// Activity level based on last activity
type ActivityLevel = "hot" | "warm" | "cold" | "frozen";

function getActivityLevel(date: Date | null): ActivityLevel {
  if (!date) return "frozen";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 1) return "hot";
  if (days <= 7) return "warm";
  if (days <= 30) return "cold";
  return "frozen";
}

function colorByActivity(text: string, level: ActivityLevel): string {
  switch (level) {
    case "hot": return pc.red(text);
    case "warm": return pc.yellow(text);
    case "cold": return pc.blue(text);
    case "frozen": return pc.dim(text);
  }
}

function activityIndicator(level: ActivityLevel): string {
  switch (level) {
    case "hot": return pc.red("●");
    case "warm": return pc.yellow("●");
    case "cold": return pc.blue("●");
    case "frozen": return pc.dim("○");
  }
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function formatModel(model: string | null): string {
  if (!model) return "";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("-")[0] || model;
}

function formatPreview(preview: SessionPreview | null): string {
  if (!preview) return "";
  const parts: string[] = [];

  if (preview.model) {
    parts.push(formatModel(preview.model));
  }

  const tokens = preview.inputTokens + preview.outputTokens;
  if (tokens > 0) {
    parts.push(formatTokens(tokens));
  }

  if (preview.firstUserMessage) {
    const msg = preview.firstUserMessage.replace(/\n/g, " ").slice(0, 40);
    parts.push(`"${msg}${preview.firstUserMessage.length > 40 ? "..." : ""}"`);
  }

  return parts.length > 0 ? pc.dim(parts.join(" | ")) : "";
}

export interface PickerOptions {
  frecencyScores?: Record<string, number>;
  previews?: Map<string, SessionPreview | null>;
}

export function sortByFrecency(
  stats: ProjectStats[],
  frecencyScores: Record<string, number> = {}
): ProjectStats[] {
  return [...stats].sort((a, b) => {
    const scoreA = frecencyScores[a.project.path] || 0;
    const scoreB = frecencyScores[b.project.path] || 0;

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  });
}

export async function showPicker(
  stats: ProjectStats[],
  options: PickerOptions = {}
): Promise<ProjectStats | null> {
  if (stats.length === 0) {
    console.log(pc.yellow("No projects found"));
    return null;
  }

  const { frecencyScores = {}, previews } = options;
  const sorted = sortByFrecency(stats, frecencyScores);

  const choices = sorted.map((s) => {
    const cost = calculateCost(s.usage);
    const costStr = formatCost(cost);
    const lastStr = formatDate(s.lastActivity);
    const frecency = frecencyScores[s.project.path];
    const frecencyStr = frecency ? pc.cyan(`[${frecency}]`) : "";
    const activity = getActivityLevel(s.lastActivity);
    const indicator = activityIndicator(activity);

    const preview = previews?.get(s.project.path) ?? null;
    const previewStr = formatPreview(preview);

    return {
      name: `${indicator} ${padRight(s.project.name, 26)} ${pc.dim(lastStr.padStart(10))} ${pc.green(costStr.padStart(8))} ${frecencyStr}`,
      description: previewStr || undefined,
      value: s,
    };
  });

  return vimSelect({
    message: "Select project:",
    choices,
    pageSize: 15,
  });
}

export function showRecent(
  stats: ProjectStats[],
  frecencyScores: Record<string, number> = {},
  limit: number = 5
): void {
  if (stats.length === 0) {
    console.log(pc.yellow("No projects found"));
    return;
  }

  const sorted = sortByFrecency(stats, frecencyScores).slice(0, limit);

  console.log(pc.bold("Recent projects:"));
  console.log();

  sorted.forEach((s, i) => {
    const cost = calculateCost(s.usage);
    const activity = getActivityLevel(s.lastActivity);
    const indicator = activityIndicator(activity);
    const lastStr = formatDate(s.lastActivity);

    console.log(
      `  ${pc.dim(`${i + 1}.`)} ${indicator} ${padRight(s.project.name, 24)} ${pc.dim(lastStr.padStart(10))} ${pc.green(formatCost(cost))}`
    );
  });
  console.log();
  console.log(pc.dim(`Run: cclp open <name>`));
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
      `  ${padRight("PROJECT", 28)} ${padRight("SESSIONS", 10)} ${padRight("LAST", 12)} ${padRight("TOKENS", 12)} ${padRight("COST", 10)}`
    )
  );
  console.log(pc.dim("-".repeat(76)));

  for (const s of sorted) {
    const cost = calculateCost(s.usage);
    const totalTokens = s.usage.inputTokens + s.usage.outputTokens;
    const activity = getActivityLevel(s.lastActivity);
    const indicator = activityIndicator(activity);

    console.log(
      `${indicator} ${padRight(s.project.name, 28)} ${padRight(String(s.sessions), 10)} ${padRight(formatDate(s.lastActivity), 12)} ${padRight(formatTokens(totalTokens), 12)} ${pc.green(formatCost(cost))}`
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
