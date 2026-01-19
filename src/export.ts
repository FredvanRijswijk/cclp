import type { ProjectStats } from "./parser.js";
import { calculateCost } from "./pricing.js";

interface ExportRow {
  name: string;
  path: string;
  sessions: number;
  firstActivity: string | null;
  lastActivity: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

function toExportRow(s: ProjectStats): ExportRow {
  return {
    name: s.project.name,
    path: s.project.path,
    sessions: s.sessions,
    firstActivity: s.firstActivity?.toISOString() ?? null,
    lastActivity: s.lastActivity?.toISOString() ?? null,
    inputTokens: s.usage.inputTokens,
    outputTokens: s.usage.outputTokens,
    cacheCreationTokens: s.usage.cacheCreationInputTokens,
    cacheReadTokens: s.usage.cacheReadInputTokens,
    totalTokens: s.usage.inputTokens + s.usage.outputTokens,
    estimatedCost: calculateCost(s.usage),
  };
}

export function exportJSON(stats: ProjectStats[]): string {
  const rows = stats.map(toExportRow);
  return JSON.stringify(rows, null, 2);
}

export function exportCSV(stats: ProjectStats[]): string {
  const headers = [
    "name",
    "path",
    "sessions",
    "firstActivity",
    "lastActivity",
    "inputTokens",
    "outputTokens",
    "cacheCreationTokens",
    "cacheReadTokens",
    "totalTokens",
    "estimatedCost",
  ];

  const rows = stats.map(toExportRow);

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h as keyof ExportRow];
          if (val === null) return "";
          if (typeof val === "string" && val.includes(",")) {
            return `"${val}"`;
          }
          return String(val);
        })
        .join(",")
    ),
  ];

  return csvRows.join("\n");
}
