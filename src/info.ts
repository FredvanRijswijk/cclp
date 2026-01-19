import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import pc from "picocolors";
import type { Project } from "./scanner.js";
import { getProjectDir } from "./scanner.js";
import type { ProjectStats } from "./parser.js";
import { calculateCost, formatCost, formatTokens } from "./pricing.js";

const CCLP_DIR = join(homedir(), ".cclp");
const SUMMARIES_DIR = join(CCLP_DIR, "summaries");
const SUMMARY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ProjectInfo {
  stats: ProjectStats;
  recentPrompts: string[];
  filesModified: string[];
  toolsUsed: Record<string, number>;
  summary?: string;
}

interface SummaryCache {
  timestamp: number;
  lastActivity: string;
  summary: string;
}

async function ensureSummariesDir(): Promise<void> {
  try {
    await mkdir(SUMMARIES_DIR, { recursive: true });
  } catch {
    // exists
  }
}

function getSummaryCachePath(projectPath: string): string {
  const hash = projectPath.replace(/\//g, "-").replace(/^-/, "");
  return join(SUMMARIES_DIR, `${hash}.json`);
}

async function getCachedSummary(
  projectPath: string,
  lastActivity: Date | null
): Promise<string | null> {
  try {
    const cachePath = getSummaryCachePath(projectPath);
    const content = await readFile(cachePath, "utf-8");
    const cache: SummaryCache = JSON.parse(content);

    // Check if cache is still valid
    const cacheAge = Date.now() - cache.timestamp;
    const lastActivityStr = lastActivity?.toISOString() ?? "";

    // Valid if: less than 24h old AND project hasn't been modified since
    if (cacheAge < SUMMARY_MAX_AGE_MS && cache.lastActivity === lastActivityStr) {
      return cache.summary;
    }
  } catch {
    // no cache
  }
  return null;
}

async function saveSummaryCache(
  projectPath: string,
  lastActivity: Date | null,
  summary: string
): Promise<void> {
  await ensureSummariesDir();
  const cache: SummaryCache = {
    timestamp: Date.now(),
    lastActivity: lastActivity?.toISOString() ?? "",
    summary,
  };
  await writeFile(getSummaryCachePath(projectPath), JSON.stringify(cache), "utf-8");
}

export async function generateSummary(
  stats: ProjectStats,
  recentPrompts: string[]
): Promise<string> {
  const promptText = recentPrompts.slice(0, 5).join("\n- ");
  const input = `Summarize this Claude Code project in 2-3 sentences. Focus on what was built/done.

Project: ${stats.project.name}
Path: ${stats.project.path}
Sessions: ${stats.sessions}
Recent prompts:
- ${promptText}

Summary:`;

  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p", input], {
      cwd: stats.project.path,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      resolve(output.trim() || "Unable to generate summary");
    });

    proc.on("error", () => {
      resolve("Claude CLI not available for summary");
    });

    // Timeout after 30s
    setTimeout(() => {
      proc.kill();
      resolve("Summary generation timed out");
    }, 30000);
  });
}

export async function getOrGenerateSummary(info: ProjectInfo): Promise<string> {
  const { stats, recentPrompts } = info;

  // Check cache first
  const cached = await getCachedSummary(stats.project.path, stats.lastActivity);
  if (cached) {
    return cached;
  }

  // Generate new summary
  console.log(pc.dim("  Generating summary..."));
  const summary = await generateSummary(stats, recentPrompts);

  // Cache it
  await saveSummaryCache(stats.project.path, stats.lastActivity, summary);

  return summary;
}

interface JsonlLine {
  timestamp?: string;
  type?: string;
  message?: {
    role?: string;
    content?: string | { type: string; text?: string; name?: string; input?: unknown }[];
  };
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    command?: string;
  };
}

function extractUserMessage(content: unknown): string | null {
  if (typeof content === "string") {
    return content.slice(0, 100);
  }
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b.type === "text" && b.text);
    if (textBlock?.text) {
      return textBlock.text.slice(0, 100);
    }
  }
  return null;
}

export async function getProjectInfo(stats: ProjectStats): Promise<ProjectInfo> {
  const projectDir = getProjectDir(stats.project);
  const recentPrompts: string[] = [];
  const filesModified = new Set<string>();
  const toolsUsed: Record<string, number> = {};

  try {
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    // Sort by mtime to get recent files first
    const filesWithMtime = await Promise.all(
      jsonlFiles.map(async (f) => {
        const s = await stat(join(projectDir, f));
        return { file: f, mtime: s.mtimeMs };
      })
    );
    filesWithMtime.sort((a, b) => b.mtime - a.mtime);

    // Parse recent sessions (last 3)
    const recentFiles = filesWithMtime.slice(0, 3);

    for (const { file } of recentFiles) {
      const content = await readFile(join(projectDir, file), "utf-8");
      const lines = content.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data: JsonlLine = JSON.parse(line);

          // Extract user prompts
          if (data.type === "user" && data.message?.content) {
            const msg = extractUserMessage(data.message.content);
            if (msg && recentPrompts.length < 10) {
              recentPrompts.push(msg);
            }
          }

          // Extract tool usage and file paths
          if (data.type === "tool_use" || data.tool_name) {
            const toolName = data.tool_name || "unknown";
            toolsUsed[toolName] = (toolsUsed[toolName] || 0) + 1;

            // Track files from Write/Edit/Read tools
            const filePath = data.tool_input?.file_path;
            if (filePath && (toolName === "Write" || toolName === "Edit")) {
              filesModified.add(filePath);
            }
          }

          // Also check content array for tool_use blocks
          if (Array.isArray(data.message?.content)) {
            for (const block of data.message.content) {
              if (block.type === "tool_use" && block.name) {
                toolsUsed[block.name] = (toolsUsed[block.name] || 0) + 1;
                const input = block.input as { file_path?: string } | undefined;
                if (input?.file_path && (block.name === "Write" || block.name === "Edit")) {
                  filesModified.add(input.file_path);
                }
              }
            }
          }
        } catch {
          // skip invalid lines
        }
      }
    }
  } catch {
    // project not found
  }

  return {
    stats,
    recentPrompts,
    filesModified: Array.from(filesModified).slice(0, 15),
    toolsUsed,
  };
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function formatDate(date: Date | null): string {
  if (!date) return "never";
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function showProjectInfo(info: ProjectInfo, summary?: string): void {
  const { stats, recentPrompts, filesModified, toolsUsed } = info;
  const cost = calculateCost(stats.usage);
  const totalTokens = stats.usage.inputTokens + stats.usage.outputTokens;

  console.log();
  console.log(pc.bold(pc.cyan(`  ${stats.project.name}`)));
  console.log(pc.dim(`  ${stats.project.path}`));
  console.log();

  // AI Summary (if available)
  if (summary) {
    console.log(pc.bold("  Summary"));
    console.log(pc.dim("  " + "-".repeat(40)));
    const lines = summary.split("\n");
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log();
  }

  // Stats
  console.log(pc.bold("  Stats"));
  console.log(pc.dim("  " + "-".repeat(40)));
  console.log(`  Sessions:     ${stats.sessions}`);
  console.log(`  First:        ${formatDate(stats.firstActivity)}`);
  console.log(`  Last:         ${formatDate(stats.lastActivity)}`);
  console.log(`  Tokens:       ${formatTokens(totalTokens)}`);
  console.log(`  Cost:         ${pc.green(formatCost(cost))}`);
  console.log();

  // Recent prompts
  if (recentPrompts.length > 0) {
    console.log(pc.bold("  Recent prompts"));
    console.log(pc.dim("  " + "-".repeat(40)));
    for (const prompt of recentPrompts.slice(0, 5)) {
      const truncated = prompt.replace(/\n/g, " ").slice(0, 60);
      console.log(`  ${pc.dim("•")} ${truncated}${prompt.length > 60 ? "..." : ""}`);
    }
    console.log();
  }

  // Files modified
  if (filesModified.length > 0) {
    console.log(pc.bold("  Files modified"));
    console.log(pc.dim("  " + "-".repeat(40)));
    for (const file of filesModified.slice(0, 8)) {
      const shortPath = file.split("/").slice(-2).join("/");
      console.log(`  ${pc.dim("•")} ${shortPath}`);
    }
    if (filesModified.length > 8) {
      console.log(pc.dim(`  ... and ${filesModified.length - 8} more`));
    }
    console.log();
  }

  // Top tools
  const topTools = Object.entries(toolsUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topTools.length > 0) {
    console.log(pc.bold("  Top tools"));
    console.log(pc.dim("  " + "-".repeat(40)));
    for (const [tool, count] of topTools) {
      console.log(`  ${padRight(tool, 20)} ${pc.dim(String(count) + "x")}`);
    }
    console.log();
  }
}

export function formatInfoCompact(info: ProjectInfo): string {
  const { stats, recentPrompts, filesModified } = info;
  const lines: string[] = [];

  lines.push(pc.bold(stats.project.name));
  lines.push(`${stats.sessions} sessions | ${formatTokens(stats.usage.inputTokens + stats.usage.outputTokens)} | ${pc.green(formatCost(calculateCost(stats.usage)))}`);

  if (recentPrompts.length > 0) {
    lines.push("");
    lines.push(pc.dim("Recent:"));
    for (const p of recentPrompts.slice(0, 3)) {
      lines.push(`  ${p.replace(/\n/g, " ").slice(0, 50)}...`);
    }
  }

  if (filesModified.length > 0) {
    lines.push("");
    lines.push(pc.dim(`${filesModified.length} files modified`));
  }

  return lines.join("\n");
}
