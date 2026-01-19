import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProjectStats } from "./parser.js";

const CCLP_DIR = join(homedir(), ".cclp");
const CACHE_FILE = join(CCLP_DIR, "cache.json");
const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheData {
  timestamp: number;
  projectsDirMtime: number;
  stats: SerializedStats[];
}

interface SerializedStats {
  project: { name: string; path: string; encodedPath: string };
  sessions: number;
  firstActivity: string | null;
  lastActivity: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(CCLP_DIR, { recursive: true });
  } catch {
    // exists
  }
}

async function getProjectsDirMtime(): Promise<number> {
  try {
    const s = await stat(PROJECTS_DIR);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

function serialize(stats: ProjectStats[]): SerializedStats[] {
  return stats.map((s) => ({
    project: s.project,
    sessions: s.sessions,
    firstActivity: s.firstActivity?.toISOString() ?? null,
    lastActivity: s.lastActivity?.toISOString() ?? null,
    usage: s.usage,
  }));
}

function deserialize(data: SerializedStats[]): ProjectStats[] {
  return data.map((s) => ({
    project: s.project,
    sessions: s.sessions,
    firstActivity: s.firstActivity ? new Date(s.firstActivity) : null,
    lastActivity: s.lastActivity ? new Date(s.lastActivity) : null,
    usage: s.usage,
  }));
}

export async function getCached(): Promise<ProjectStats[] | null> {
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    const data: CacheData = JSON.parse(content);

    // Check TTL
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      return null;
    }

    // Check if projects dir changed
    const currentMtime = await getProjectsDirMtime();
    if (currentMtime !== data.projectsDirMtime) {
      return null;
    }

    return deserialize(data.stats);
  } catch {
    return null;
  }
}

export async function setCache(stats: ProjectStats[]): Promise<void> {
  await ensureDir();
  const data: CacheData = {
    timestamp: Date.now(),
    projectsDirMtime: await getProjectsDirMtime(),
    stats: serialize(stats),
  };
  await writeFile(CACHE_FILE, JSON.stringify(data), "utf-8");
}

export async function clearCache(): Promise<boolean> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(CACHE_FILE);
    return true;
  } catch {
    return false;
  }
}
