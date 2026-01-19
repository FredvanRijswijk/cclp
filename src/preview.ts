import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "./scanner.js";
import { getProjectDir } from "./scanner.js";

export interface SessionPreview {
  lastTimestamp: Date | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  firstUserMessage: string | null;
}

interface JsonlLine {
  timestamp?: string;
  type?: string;
  message?: {
    role?: string;
    content?: string | { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    model?: string;
  };
}

export async function getLastSessionPreview(project: Project): Promise<SessionPreview | null> {
  const projectDir = getProjectDir(project);

  try {
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) return null;

    // Find most recent session file by mtime
    let latestFile = jsonlFiles[0];
    let latestMtime = 0;

    for (const file of jsonlFiles) {
      const s = await stat(join(projectDir, file));
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs;
        latestFile = file;
      }
    }

    const content = await readFile(join(projectDir, latestFile), "utf-8");
    const lines = content.split("\n").filter(Boolean);

    const preview: SessionPreview = {
      lastTimestamp: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      firstUserMessage: null,
    };

    for (const line of lines) {
      try {
        const data: JsonlLine = JSON.parse(line);

        if (data.timestamp) {
          const ts = new Date(data.timestamp);
          if (!preview.lastTimestamp || ts > preview.lastTimestamp) {
            preview.lastTimestamp = ts;
          }
        }

        if (data.message?.model && !preview.model) {
          preview.model = data.message.model;
        }

        if (data.message?.usage) {
          preview.inputTokens += data.message.usage.input_tokens || 0;
          preview.outputTokens += data.message.usage.output_tokens || 0;
        }

        // Capture first user message
        if (!preview.firstUserMessage && data.type === "user" && data.message?.content) {
          const content = data.message.content;
          if (typeof content === "string") {
            preview.firstUserMessage = content.slice(0, 80);
          } else if (Array.isArray(content)) {
            const textBlock = content.find((b) => b.type === "text" && b.text);
            if (textBlock && textBlock.text) {
              preview.firstUserMessage = textBlock.text.slice(0, 80);
            }
          }
        }
      } catch {
        // skip invalid lines
      }
    }

    return preview;
  } catch {
    return null;
  }
}
