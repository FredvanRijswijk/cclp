#!/usr/bin/env node

import { Command } from "commander";
import { scanProjects } from "./scanner.js";
import { parseAllProjects } from "./parser.js";
import { showPicker, showTable, showStats, fuzzyMatch, filterByDays } from "./ui.js";
import { launchClaude } from "./launcher.js";
import { track, shutdown } from "./telemetry.js";
import { getCached, setCache, clearCache } from "./cache.js";
import { getFrecencyScores, recordLaunch } from "./frecency.js";
import { getLastSessionPreview } from "./preview.js";
import type { ProjectStats } from "./parser.js";
import type { SessionPreview } from "./preview.js";
import pc from "picocolors";

const program = new Command();

interface GlobalOpts {
  days?: number;
  cache?: boolean; // --no-cache sets this to false
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
  .version("1.2.0")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .option("--no-cache", "bypass cache, fetch fresh data");

program
  .command("list")
  .description("Show all projects in table format")
  .option("-d, --days <n>", "filter to last N days", parseInt)
  .action(async (opts) => {
    const globalOpts = program.opts() as GlobalOpts;
    const days = opts.days ?? globalOpts.days;
    const { stats: allStats, fromCache } = await getStats(globalOpts);
    const stats = days ? filterByDays(allStats, days) : allStats;
    track({ command: "list", projectCount: stats.length, daysFilter: days });
    showCacheIndicator(fromCache);
    showTable(stats);
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
  local commands="list open stats clear-cache completion"
  COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
}
complete -F _${name}_completions ${name}`);
        break;
      case "zsh":
        console.log(`# Add to ~/.zshrc:
_${name}() {
  local commands=(
    'list:Show all projects in table format'
    'open:Open project by name'
    'stats:Show usage summary'
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
complete -c ${name} -n __fish_use_subcommand -a open -d 'Open project by name'
complete -c ${name} -n __fish_use_subcommand -a stats -d 'Show usage summary'
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
  const { stats: allStats, fromCache } = await getStats(globalOpts);
  const stats = days ? filterByDays(allStats, days) : allStats;

  // Load frecency and previews in parallel
  const [frecencyScores, previews] = await Promise.all([
    getFrecencyScores(),
    loadPreviews(stats),
  ]);

  showCacheIndicator(fromCache);

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
