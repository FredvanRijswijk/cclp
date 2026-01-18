#!/usr/bin/env node

import { Command } from "commander";
import { scanProjects } from "./scanner.js";
import { parseAllProjects } from "./parser.js";
import { showPicker, showTable, showStats, fuzzyMatch, filterByDays } from "./ui.js";
import { launchClaude } from "./launcher.js";
import { track, shutdown } from "./telemetry.js";
import pc from "picocolors";

const program = new Command();

program
  .name("ccl")
  .description("Fast CLI to scan, list, and launch Claude Code projects")
  .version("1.0.0")
  .option("-d, --days <n>", "filter to last N days", parseInt);

program
  .command("list")
  .description("Show all projects in table format")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .action(async (opts) => {
    const days = opts.days ?? program.opts().days;
    const projects = await scanProjects();
    let stats = await parseAllProjects(projects);
    if (days) stats = filterByDays(stats, days);
    track({ command: "list", projectCount: stats.length, daysFilter: days });
    showTable(stats);
    await shutdown();
  });

program
  .command("open <name>")
  .description("Open project by name (fuzzy match)")
  .action(async (name: string) => {
    const projects = await scanProjects();
    const stats = await parseAllProjects(projects);
    const match = fuzzyMatch(stats, name);

    if (!match) {
      track({ command: "open", success: false });
      await shutdown();
      console.log(pc.red(`No project found matching "${name}"`));
      process.exit(1);
    }

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
    const projects = await scanProjects();
    let stats = await parseAllProjects(projects);
    if (days) stats = filterByDays(stats, days);
    track({ command: "stats", projectCount: stats.length, daysFilter: days });
    showStats(stats, days);
    await shutdown();
  });

// Default: interactive picker
program.action(async () => {
  const days = program.opts().days;
  const projects = await scanProjects();
  let stats = await parseAllProjects(projects);
  if (days) stats = filterByDays(stats, days);

  try {
    const selected = await showPicker(stats);
    if (selected) {
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
