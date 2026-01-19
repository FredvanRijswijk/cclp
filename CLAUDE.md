# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # run with tsx (development)
npm run build            # compile TypeScript to dist/
npm link                 # install globally for testing
cclp                     # test the CLI
```

## Architecture

CLI tool that scans `~/.claude/projects/` to list and launch Claude Code projects with cost tracking.

**Source modules:**
- `index.ts` - CLI entry (commander), wires commands to handlers
- `scanner.ts` - scans project directory, decodes encoded paths (handles hyphens/underscores in folder names via filesystem validation)
- `parser.ts` - parses JSONL session files, extracts timestamps and token usage
- `pricing.ts` - Anthropic token pricing (sonnet-4 default), cost calculation
- `ui.ts` - interactive picker (@inquirer/prompts), table output, fuzzy matching, days filtering
- `launcher.ts` - spawns `claude` process in project directory
- `telemetry.ts` - PostHog event tracking (anonymous usage stats)
- `cache.ts` - caches ProjectStats to `~/.cclp/cache.json` (5min TTL, invalidates on projects dir mtime change)
- `frecency.ts` - tracks launch history in `~/.cclp/history.json`, calculates frecency scores (recent+frequent launches rank higher)
- `preview.ts` - parses last session JSONL for preview info (model, tokens, first user message)
- `config.ts` - user config in `~/.cclp/config.json` (archived projects, defaults)
- `cost.ts` - daily/weekly cost breakdown with bar charts
- `export.ts` - CSV/JSON export of project stats

**Path decoding:** Claude encodes project paths like `/Users/foo/my-project` as `-Users-foo-my-project`. The scanner uses recursive filesystem validation to handle ambiguous hyphens (path separators vs literal hyphens/underscores).
