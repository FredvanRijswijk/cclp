import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CCLP_DIR = join(homedir(), ".cclp");
const CONFIG_FILE = join(CCLP_DIR, "config.json");

export interface Config {
  defaultDays?: number;
  defaultModel?: string;
  archived?: string[]; // project paths to hide
  projectBaseDir?: string; // base dir for new projects
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(CCLP_DIR, { recursive: true });
  } catch {
    // exists
  }
}

export async function loadConfig(): Promise<Config> {
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function archiveProject(path: string): Promise<void> {
  const config = await loadConfig();
  if (!config.archived) config.archived = [];
  if (!config.archived.includes(path)) {
    config.archived.push(path);
    await saveConfig(config);
  }
}

export async function unarchiveProject(path: string): Promise<void> {
  const config = await loadConfig();
  if (config.archived) {
    config.archived = config.archived.filter((p) => p !== path);
    await saveConfig(config);
  }
}

export function filterArchived<T extends { project: { path: string } }>(
  stats: T[],
  config: Config
): T[] {
  if (!config.archived || config.archived.length === 0) return stats;
  return stats.filter((s) => !config.archived!.includes(s.project.path));
}

export async function setProjectBaseDir(dir: string): Promise<void> {
  const config = await loadConfig();
  config.projectBaseDir = dir;
  await saveConfig(config);
}

export async function getProjectBaseDir(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.projectBaseDir;
}
