#!/usr/bin/env node

import { Command } from "commander";
import { scanProjects } from "./scanner.js";
import { parseAllProjects } from "./parser.js";
import { showPicker, showTable, showStats, fuzzyMatch, filterByDays } from "./ui.js";
import { launchClaude } from "./launcher.js";
import { track, shutdown } from "./telemetry.js";
import { getCached, setCache } from "./cache.js";
import { getFrecencyScores, recordLaunch } from "./frecency.js";
import { getLastSessionPreview } from "./preview.js";
import type { ProjectStats } from "./parser.js";
import type { SessionPreview } from "./preview.js";
import pc from "picocolors";

const program = new Command();

async function getStats(): Promise<ProjectStats[]> {
  // Try cache first
  const cached = await getCached();
  if (cached) {
    return cached;
  }

  // Parse fresh
  const projects = await scanProjects();
  const stats = await parseAllProjects(projects);
  await setCache(stats);
  return stats;
}

async function loadPreviews(stats: ProjectStats[]): Promise<Map<string, SessionPreview | null>> {
  const previews = new Map<string, SessionPreview | null>();
  await Promise.all(
    stats.map(async (s) => {
      const preview = await getLastSessionPreview(s.project);
      previews.set(s.project.path, preview);
    })
  );
  return previews;
}

program
  .name("cclp")
  .description("Fast CLI to scan, list, and launch Claude Code projects")
  .version("1.0.0")
  .option("-d, --days <n>", "filter to last N days", parseInt);

program
  .command("list")
  .description("Show all projects in table format")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .action(async (opts) => {
    const days = opts.days ?? program.opts().days;
    let stats = await getStats();
    if (days) stats = filterByDays(stats, days);
    track({ command: "list", projectCount: stats.length, daysFilter: days });
    showTable(stats);
    await shutdown();
  });

program
  .command("open <name>")
  .description("Open project by name (fuzzy match)")
  .action(async (name: string) => {
    const stats = await getStats();
    const match = fuzzyMatch(stats, name);

    if (!match) {
      track({ command: "open", success: false });
      await shutdown();
      console.log(pc.red(`No project found matching "${name}"`));
      process.exit(1);
    }

    await recordLaunch(match.project.path);
    track({ command: "open", success: true });
    await shutdown();
    console.log(pc.dim(`Opening ${match.project.path}...`));
    launchClaude(match.project);
  });

program
  .command("stats")
  .description("Show usage summary")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .action(async (opts) => {
    const days = opts.days ?? program.opts().days;
    let stats = await getStats();
    if (days) stats = filterByDays(stats, days);
    track({ command: "stats", projectCount: stats.length, daysFilter: days });
    showStats(stats, days);
    await shutdown();
  });

// Default: interactive picker
program.action(async () => {
  const days = program.opts().days;
  let stats = await getStats();
  if (days) stats = filterByDays(stats, days);

  // Load frecency and previews in parallel
  const [frecencyScores, previews] = await Promise.all([
    getFrecencyScores(),
    loadPreviews(stats),
  ]);

  try {
    const selected = await showPicker(stats, { frecencyScores, previews });
    if (selected) {
      await recordLaunch(selected.project.path);
      track({ command: "picker", projectCount: stats.length, daysFilter: days, success: true });
      await shutdown();
      console.log(pc.dim(`Opening ${selected.project.path}...`));
      launchClaude(selected.project);
    } else {
      track({ command: "picker", projectCount: stats.length, daysFilter: days, success: false });
      await shutdown();
    }
  } catch {
    track({ command: "picker", success: false });
    await shutdown();
    process.exit(0);
  }
});

program.parse();
