import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CCLP_DIR = join(homedir(), ".cclp");
const HISTORY_FILE = join(CCLP_DIR, "history.json");

// Decay weights: recent launches count more
// Index 0 = last hour, 1 = last day, 2 = last week, 3 = last month, 4 = older
const DECAY_WEIGHTS = [100, 70, 50, 30, 10];
const BUCKETS_MS = [
  60 * 60 * 1000,           // 1 hour
  24 * 60 * 60 * 1000,      // 1 day
  7 * 24 * 60 * 60 * 1000,  // 1 week
  30 * 24 * 60 * 60 * 1000, // 1 month
];

interface HistoryData {
  launches: Record<string, number[]>; // path -> timestamps
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(CCLP_DIR, { recursive: true });
  } catch {
    // exists
  }
}

async function loadHistory(): Promise<HistoryData> {
  try {
    const content = await readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { launches: {} };
  }
}

async function saveHistory(data: HistoryData): Promise<void> {
  await ensureDir();
  await writeFile(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function recordLaunch(projectPath: string): Promise<void> {
  const history = await loadHistory();
  if (!history.launches[projectPath]) {
    history.launches[projectPath] = [];
  }
  history.launches[projectPath].push(Date.now());

  // Keep only last 100 launches per project
  if (history.launches[projectPath].length > 100) {
    history.launches[projectPath] = history.launches[projectPath].slice(-100);
  }

  await saveHistory(history);
}

export function calculateFrecency(timestamps: number[]): number {
  if (!timestamps || timestamps.length === 0) return 0;

  const now = Date.now();
  let score = 0;

  for (const ts of timestamps) {
    const age = now - ts;
    let bucket = BUCKETS_MS.findIndex((b) => age < b);
    if (bucket === -1) bucket = DECAY_WEIGHTS.length - 1;
    score += DECAY_WEIGHTS[bucket];
  }

  return score;
}

export async function getFrecencyScores(): Promise<Record<string, number>> {
  const history = await loadHistory();
  const scores: Record<string, number> = {};

  for (const [path, timestamps] of Object.entries(history.launches)) {
    scores[path] = calculateFrecency(timestamps);
  }

  return scores;
}
