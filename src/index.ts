#!/usr/bin/env node

import { Command } from "commander";
import { scanProjects } from "./scanner.js";
import { parseAllProjects } from "./parser.js";
import { showPicker, showTable, showStats, showRecent, fuzzyMatch, filterByDays } from "./ui.js";
import { launchClaude } from "./launcher.js";
import { track, shutdown } from "./telemetry.js";
import { getCached, setCache, clearCache } from "./cache.js";
import { getFrecencyScores, recordLaunch } from "./frecency.js";
import { getLastSessionPreview } from "./preview.js";
import { loadConfig, archiveProject, unarchiveProject, filterArchived } from "./config.js";
import { getCostByDay, showDailyCost, showWeeklyCost } from "./cost.js";
import { exportJSON, exportCSV } from "./export.js";
import { getProjectInfo, showProjectInfo, getOrGenerateSummary } from "./info.js";
import type { ProjectStats } from "./parser.js";
import type { SessionPreview } from "./preview.js";
import pc from "picocolors";

const program = new Command();

interface GlobalOpts {
  days?: number;
  cache?: boolean;
}

async function getStats(opts: GlobalOpts = {}): Promise<{ stats: ProjectStats[]; fromCache: boolean }> {
  // Try cache first (unless --no-cache)
  if (opts.cache !== false) {
    const cached = await getCached();
    if (cached) {
      return { stats: cached, fromCache: true };
    }
  }

  // Parse fresh
  const projects = await scanProjects();
  const stats = await parseAllProjects(projects);
  await setCache(stats);
  return { stats, fromCache: false };
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

function showCacheIndicator(fromCache: boolean): void {
  if (fromCache) {
    console.log(pc.dim("(cached)"));
  }
}

program
  .name("cclp")
  .description("Fast CLI to scan, list, and launch Claude Code projects")
  .version("1.4.0")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .option("--no-cache", "bypass cache, fetch fresh data");

program
  .command("list")
  .description("Show all projects in table format")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .option("-a, --all", "include archived projects")
  .action(async (opts) => {
    const globalOpts = program.opts() as GlobalOpts;
    const days = opts.days ?? globalOpts.days;
    const config = await loadConfig();
    const { stats: allStats, fromCache } = await getStats(globalOpts);
    let stats = opts.all ? allStats : filterArchived(allStats, config);
    if (days) stats = filterByDays(stats, days);
    track({ command: "list", projectCount: stats.length, daysFilter: days });
    showCacheIndicator(fromCache);
    showTable(stats);
    await shutdown();
  });

program
  .command("recent")
  .description("Show top 5 projects by frecency")
  .option("-n, --limit <n>", "number of projects to show", parseInt, 5)
  .action(async (opts) => {
    const globalOpts = program.opts() as GlobalOpts;
    const config = await loadConfig();
    const { stats: allStats, fromCache } = await getStats(globalOpts);
    const stats = filterArchived(allStats, config);
    const frecencyScores = await getFrecencyScores();
    track({ command: "recent", projectCount: stats.length });
    showCacheIndicator(fromCache);
    showRecent(stats, frecencyScores, opts.limit);
    await shutdown();
  });

program
  .command("info <name>")
  .description("Show detailed project information")
  .option("-s, --summary", "include AI-generated summary (uses claude -p)")
  .action(async (name: string, opts: { summary?: boolean }) => {
    const { stats } = await getStats();
    const match = fuzzyMatch(stats, name);

    if (!match) {
      console.log(pc.red(`No project found matching "${name}"`));
      process.exit(1);
    }

    const info = await getProjectInfo(match);
    let summary: string | undefined;

    if (opts.summary) {
      summary = await getOrGenerateSummary(info);
    }

    showProjectInfo(info, summary);
    await shutdown();
  });

program
  .command("open <name>")
  .description("Open project by name (fuzzy match)")
  .action(async (name: string) => {
    const globalOpts = program.opts() as GlobalOpts;
    const { stats } = await getStats(globalOpts);
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
    const globalOpts = program.opts() as GlobalOpts;
    const days = opts.days ?? globalOpts.days;
    const { stats: allStats, fromCache } = await getStats(globalOpts);
    const stats = days ? filterByDays(allStats, days) : allStats;
    track({ command: "stats", projectCount: stats.length, daysFilter: days });
    showCacheIndicator(fromCache);
    showStats(stats, days);
    await shutdown();
  });

program
  .command("cost")
  .description("Show cost breakdown by day or week")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .option("-w, --weekly", "group by week instead of day")
  .action(async (opts) => {
    const globalOpts = program.opts() as GlobalOpts;
    const days = opts.days ?? globalOpts.days;
    const projects = await scanProjects();
    const dailyUsage = await getCostByDay(projects);
    track({ command: "cost", daysFilter: days, weekly: opts.weekly });

    if (opts.weekly) {
      showWeeklyCost(dailyUsage);
    } else {
      showDailyCost(dailyUsage, days);
    }
    await shutdown();
  });

program
  .command("export")
  .description("Export project data as CSV or JSON")
  .option("-f, --format <format>", "output format: csv or json", "json")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .option("-o, --output <file>", "write to file instead of stdout")
  .action(async (opts) => {
    const globalOpts = program.opts() as GlobalOpts;
    const days = opts.days ?? globalOpts.days;
    const { stats: allStats } = await getStats(globalOpts);
    const stats = days ? filterByDays(allStats, days) : allStats;

    const output = opts.format === "csv" ? exportCSV(stats) : exportJSON(stats);

    if (opts.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(opts.output, output, "utf-8");
      console.log(pc.green(`Exported to ${opts.output}`));
    } else {
      console.log(output);
    }

    track({ command: "export", format: opts.format, projectCount: stats.length });
    await shutdown();
  });

program
  .command("archive <name>")
  .description("Hide project from picker and list")
  .action(async (name: string) => {
    const { stats } = await getStats();
    const match = fuzzyMatch(stats, name);

    if (!match) {
      console.log(pc.red(`No project found matching "${name}"`));
      process.exit(1);
    }

    await archiveProject(match.project.path);
    console.log(pc.green(`Archived: ${match.project.name}`));
    console.log(pc.dim("Use 'cclp list -a' to see archived projects"));
    await shutdown();
  });

program
  .command("unarchive <name>")
  .description("Restore archived project")
  .action(async (name: string) => {
    const { stats } = await getStats();
    const match = fuzzyMatch(stats, name);

    if (!match) {
      console.log(pc.red(`No project found matching "${name}"`));
      process.exit(1);
    }

    await unarchiveProject(match.project.path);
    console.log(pc.green(`Unarchived: ${match.project.name}`));
    await shutdown();
  });

program
  .command("clear-cache")
  .description("Clear cached project data")
  .action(async () => {
    const cleared = await clearCache();
    if (cleared) {
      console.log(pc.green("Cache cleared"));
    } else {
      console.log(pc.dim("No cache to clear"));
    }
    await shutdown();
  });

// Shell completion commands
program
  .command("completion")
  .description("Generate shell completion script")
  .argument("<shell>", "shell type: bash, zsh, or fish")
  .action((shell: string) => {
    const name = "cclp";
    switch (shell) {
      case "bash":
        console.log(`# Add to ~/.bashrc:
_${name}_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="list recent open stats cost export archive unarchive clear-cache completion"
  COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
}
complete -F _${name}_completions ${name}`);
        break;
      case "zsh":
        console.log(`# Add to ~/.zshrc:
_${name}() {
  local commands=(
    'list:Show all projects in table format'
    'recent:Show top 5 projects by frecency'
    'open:Open project by name'
    'stats:Show usage summary'
    'cost:Show cost breakdown by day/week'
    'export:Export project data as CSV/JSON'
    'archive:Hide project from picker'
    'unarchive:Restore archived project'
    'clear-cache:Clear cached project data'
    'completion:Generate shell completion'
  )
  _describe 'command' commands
}
compdef _${name} ${name}`);
        break;
      case "fish":
        console.log(`# Save to ~/.config/fish/completions/${name}.fish:
complete -c ${name} -n __fish_use_subcommand -a list -d 'Show all projects'
complete -c ${name} -n __fish_use_subcommand -a recent -d 'Show top 5 by frecency'
complete -c ${name} -n __fish_use_subcommand -a open -d 'Open project by name'
complete -c ${name} -n __fish_use_subcommand -a stats -d 'Show usage summary'
complete -c ${name} -n __fish_use_subcommand -a cost -d 'Show cost breakdown'
complete -c ${name} -n __fish_use_subcommand -a export -d 'Export as CSV/JSON'
complete -c ${name} -n __fish_use_subcommand -a archive -d 'Hide project'
complete -c ${name} -n __fish_use_subcommand -a unarchive -d 'Restore project'
complete -c ${name} -n __fish_use_subcommand -a clear-cache -d 'Clear cache'
complete -c ${name} -n __fish_use_subcommand -a completion -d 'Generate completion'`);
        break;
      default:
        console.log(pc.red(`Unknown shell: ${shell}. Use bash, zsh, or fish.`));
        process.exit(1);
    }
  });

// Default: interactive picker
program.action(async () => {
  const globalOpts = program.opts() as GlobalOpts;
  const days = globalOpts.days;
  const config = await loadConfig();
  const { stats: allStats, fromCache } = await getStats(globalOpts);
  let stats = filterArchived(allStats, config);
  if (days) stats = filterByDays(stats, days);

  // Load frecency and previews in parallel
  const [frecencyScores, previews] = await Promise.all([
    getFrecencyScores(),
    loadPreviews(stats),
  ]);

  showCacheIndicator(fromCache);

  try {
    const result = await showPicker(stats, { frecencyScores, previews });
    if (result) {
      if (result.action === "info") {
        // Show info and exit
        const info = await getProjectInfo(result.value);
        showProjectInfo(info);
        track({ command: "picker", projectCount: stats.length, daysFilter: days, success: true });
        await shutdown();
      } else {
        // Select and launch
        await recordLaunch(result.value.project.path);
        track({ command: "picker", projectCount: stats.length, daysFilter: days, success: true });
        await shutdown();
        console.log(pc.dim(`Opening ${result.value.project.path}...`));
        launchClaude(result.value.project);
      }
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
