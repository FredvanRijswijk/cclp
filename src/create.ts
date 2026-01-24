import { mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getProjectBaseDir } from "./config.js";

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

export async function createProject(name: string, baseDir?: string): Promise<string> {
  const dir = baseDir ?? (await getProjectBaseDir());

  if (!dir) {
    throw new Error("No base directory set. Run: cclp set-base <path>");
  }

  const expandedDir = expandHome(dir);
  const resolvedBase = resolve(expandedDir);

  // Check base dir exists
  try {
    await access(resolvedBase);
  } catch {
    throw new Error(`Base directory does not exist: ${resolvedBase}`);
  }

  const projectPath = join(resolvedBase, name);

  // Create project dir
  await mkdir(projectPath, { recursive: true });

  return projectPath;
}
