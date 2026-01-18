import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "./scanner.js";
import { getProjectDir } from "./scanner.js";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ProjectStats {
  project: Project;
  sessions: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  usage: TokenUsage;
}

interface JsonlMessage {
  timestamp?: string;
  type?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;
  };
}

export async function parseProject(project: Project): Promise<ProjectStats> {
  const projectDir = getProjectDir(project);
  const stats: ProjectStats = {
    project,
    sessions: 0,
    firstActivity: null,
    lastActivity: null,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
  };

  try {
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    stats.sessions = jsonlFiles.length;

    for (const file of jsonlFiles) {
      const content = await readFile(join(projectDir, file), "utf-8");
      const lines = content.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data: JsonlMessage = JSON.parse(line);

          // Track timestamps
          if (data.timestamp) {
            const ts = new Date(data.timestamp);
            if (!stats.firstActivity || ts < stats.firstActivity) {
              stats.firstActivity = ts;
            }
            if (!stats.lastActivity || ts > stats.lastActivity) {
              stats.lastActivity = ts;
            }
          }

          // Aggregate token usage
          const usage = data.message?.usage;
          if (usage) {
            stats.usage.inputTokens += usage.input_tokens || 0;
            stats.usage.outputTokens += usage.output_tokens || 0;
            stats.usage.cacheCreationInputTokens +=
              usage.cache_creation_input_tokens || 0;
            stats.usage.cacheReadInputTokens +=
              usage.cache_read_input_tokens || 0;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  } catch {
    // Error reading project
  }

  return stats;
}

export async function parseAllProjects(
  projects: Project[]
): Promise<ProjectStats[]> {
  return Promise.all(projects.map(parseProject));
}
