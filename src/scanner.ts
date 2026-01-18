import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Project {
  name: string;
  path: string;
  encodedPath: string;
}

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function decodePath(encoded: string): Promise<string | null> {
  // encoded: -Users-foo-bar-baz where hyphens can be path separators, hyphens, OR underscores
  // Strategy: recursively try segments with both - and _ variants, validating against filesystem
  const parts = encoded.slice(1).split("-"); // remove leading -, split on -

  async function findPath(idx: number, currentPath: string): Promise<string | null> {
    if (idx >= parts.length) {
      return (await exists(currentPath)) ? currentPath : null;
    }

    // Try increasingly longer segments (to handle multi-hyphen names)
    for (let end = idx + 1; end <= parts.length; end++) {
      const segmentParts = parts.slice(idx, end);

      // Try with hyphens
      const hyphenSegment = segmentParts.join("-");
      const hyphenPath = currentPath + "/" + hyphenSegment;
      if (await exists(hyphenPath)) {
        const result = await findPath(end, hyphenPath);
        if (result) return result;
      }

      // Try with underscores (if multi-part segment)
      if (segmentParts.length > 1) {
        const underscoreSegment = segmentParts.join("_");
        const underscorePath = currentPath + "/" + underscoreSegment;
        if (await exists(underscorePath)) {
          const result = await findPath(end, underscorePath);
          if (result) return result;
        }
      }
    }
    return null;
  }

  return findPath(0, "");
}

function getProjectName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export async function scanProjects(): Promise<Project[]> {
  const projects: Project[] = [];

  try {
    const entries = await readdir(PROJECTS_DIR);

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      const fullPath = join(PROJECTS_DIR, entry);
      const stats = await stat(fullPath);

      if (!stats.isDirectory()) continue;

      const decodedPath = await decodePath(entry);

      if (decodedPath) {
        projects.push({
          name: getProjectName(decodedPath),
          path: decodedPath,
          encodedPath: entry,
        });
      }
    }
  } catch {
    // Projects dir doesn't exist
  }

  return projects;
}

export function getProjectDir(project: Project): string {
  return join(PROJECTS_DIR, project.encodedPath);
}
